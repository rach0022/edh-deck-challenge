/**
 * Shared Puppeteer browser service.
 *
 * Owns a single browser + page instance used to fetch JSON from
 * Cloudflare-protected origins (Moxfield, EDHREC). The browser stays
 * alive between requests to avoid re-solving Cloudflare challenges on
 * every call. It is recycled if disconnected or when a fetch fails
 * (the context may be stale).
 *
 * This concern was previously private to the Moxfield service; it is
 * extracted here so multiple services can share a single browser
 * instance (a second browser would double the memory and Cloudflare
 * cost) and so there is a single shutdown path.
 */

import puppeteer, { type Browser, type Page } from 'puppeteer';
import type { AppConfig } from '../config.js';

/**
 * Thrown when a browser-mediated fetch cannot be completed (the page
 * context is stale, the navigation timed out, or the browser is
 * otherwise unreachable). Callers typically translate this into their
 * own service-specific timeout/unavailable error.
 */
export class BrowserFetchError extends Error {
  /** The URL whose fetch failed, when known. */
  public readonly url?: string;
  constructor(message = 'Browser fetch failed.', options?: { cause?: unknown; url?: string }) {
    super(message);
    this.name = 'BrowserFetchError';
    if (options?.cause !== undefined) {
      // Preserve the original failure (navigation timeout, stale context,
      // Cloudflare block, page.evaluate crash) so callers can log it.
      (this as { cause?: unknown }).cause = options.cause;
    }
    this.url = options?.url;
  }
}

/** Extracts a readable message from an unknown thrown value. */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export interface BrowserService {
  /** Runs fetch(url) inside a Cloudflare-cleared page; returns {status, body}. */
  browserFetch(url: string): Promise<{ status: number; body: unknown }>;
  isReady(): boolean;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}

export function createBrowserService(config: AppConfig): BrowserService {
  let browser: Browser | null = null;
  let page: Page | null = null;
  let ready = false;

  async function initialize(): Promise<void> {
    if (ready && browser?.connected) return;

    // Clean up any existing browser
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }

    console.log('🌐 Launching browser...');

    try {
      browser = await puppeteer.launch({
        headless: config.puppeteerHeadless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });

      page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      );
      await page.setViewport({ width: 1280, height: 720 });

      // Navigate to Moxfield to solve Cloudflare challenge
      console.log('🔐 Solving Cloudflare challenge...');
      await page.goto('https://moxfield.com', {
        waitUntil: 'networkidle2',
        timeout: config.puppeteerTimeoutMs,
      });

      // Wait for Cloudflare to clear
      await page.waitForFunction(
        () => !document.title.includes('Just a moment'),
        { timeout: config.puppeteerTimeoutMs }
      );

      ready = true;
      console.log('✅ Browser ready — Cloudflare challenge solved.');
    } catch (error) {
      ready = false;
      // A failure here is the usual cause of "could not connect to Moxfield":
      // the browser could not launch, navigation to moxfield.com timed out, or
      // the Cloudflare "Just a moment" challenge never cleared within
      // puppeteerTimeoutMs. Log it with full detail before surfacing.
      console.error(
        `❌ Browser initialize failed (puppeteerTimeoutMs=${config.puppeteerTimeoutMs}, headless=${config.puppeteerHeadless}): ${errorMessage(error)}`,
        error,
      );
      throw new BrowserFetchError(
        `Browser initialization failed: ${errorMessage(error)}`,
        { cause: error, url: 'https://moxfield.com' },
      );
    }
  }

  async function ensureReady(): Promise<void> {
    if (!ready || !browser?.connected || !page) {
      await initialize();
    }
  }

  async function browserFetch(url: string): Promise<{ status: number; body: unknown }> {
    await ensureReady();
    try {
      const result = await page!.evaluate(async (fetchUrl: string) => {
        const response = await fetch(fetchUrl, {
          headers: { Accept: 'application/json' },
        });
        const text = await response.text();
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
        return {
          status: response.status,
          body,
          contentType: response.headers.get('content-type') ?? '',
        };
      }, url);

      // Detect a Cloudflare interstitial: Moxfield's API should return JSON, so
      // an HTML body (especially the "Just a moment" / "Attention Required"
      // challenge) means our cleared session expired. Surface it clearly and
      // recycle the browser so the next call re-solves the challenge.
      const looksLikeHtml =
        typeof result.body === 'string' &&
        (result.contentType.includes('text/html') ||
          /just a moment|cf-chl|challenge-platform|attention required/i.test(result.body));
      if (looksLikeHtml) {
        ready = false;
        const snippet =
          typeof result.body === 'string' ? result.body.slice(0, 200) : '';
        console.error(
          `❌ browserFetch got a non-JSON (likely Cloudflare) response for ${url} — status=${result.status}, content-type="${result.contentType}". Recycling browser. Body snippet: ${snippet}`,
        );
        throw new BrowserFetchError(
          `Cloudflare challenge or non-JSON response (status ${result.status}) for ${url}`,
          { url },
        );
      }

      if (result.status < 200 || result.status >= 300) {
        // Not an exception here — a real HTTP error status is a valid result the
        // caller maps to its own API error. Log it so failures are visible.
        console.warn(
          `⚠️  browserFetch non-2xx for ${url} — status=${result.status}, content-type="${result.contentType}"`,
        );
      }

      return { status: result.status, body: result.body };
    } catch (error) {
      // Browser context may be stale — mark as not ready for retry.
      ready = false;
      // Re-throw our own already-logged Cloudflare error untouched.
      if (error instanceof BrowserFetchError) throw error;
      console.error(
        `❌ browserFetch failed for ${url}: ${errorMessage(error)}`,
        error,
      );
      throw new BrowserFetchError(
        `Browser fetch failed for ${url}: ${errorMessage(error)}`,
        { cause: error, url },
      );
    }
  }

  async function shutdown(): Promise<void> {
    ready = false;
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
      browser = null;
      page = null;
    }
    console.log('🛑 Browser shut down.');
  }

  return {
    browserFetch,
    isReady: () => ready,
    initialize,
    shutdown,
  };
}
