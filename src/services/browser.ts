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
  constructor(message = 'Browser fetch failed.') {
    super(message);
    this.name = 'BrowserFetchError';
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

    browser = await puppeteer.launch({
      headless: config.puppeteerHeadless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
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
        return { status: response.status, body };
      }, url);
      return result;
    } catch (error) {
      // Browser context may be stale — mark as not ready for retry
      ready = false;
      throw new BrowserFetchError();
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
