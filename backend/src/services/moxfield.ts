/**
 * Moxfield scraping service using Puppeteer.
 * Manages a shared browser instance for Cloudflare bypass.
 *
 * The browser stays alive between requests to avoid re-solving
 * Cloudflare challenges on every API call. It is recycled if
 * disconnected or after a max lifetime.
 */

import puppeteer, { type Browser, type Page } from 'puppeteer';
import type { AppConfig } from '../config.js';
import type {
  MoxfieldDeckSummary,
  MoxfieldDeckDetail,
  Color,
} from '../types.js';

export class MoxfieldUserNotFoundError extends Error {
  constructor(username: string) {
    super(`Moxfield user "${username}" not found.`);
    this.name = 'MoxfieldUserNotFoundError';
  }
}

export class MoxfieldAPIError extends Error {
  public readonly statusCode: number;
  constructor(statusCode: number) {
    super(`Moxfield API returned an error (${statusCode}).`);
    this.name = 'MoxfieldAPIError';
    this.statusCode = statusCode;
  }
}

export class MoxfieldTimeoutError extends Error {
  constructor() {
    super('Could not reach Moxfield. The service may be temporarily unavailable.');
    this.name = 'MoxfieldTimeoutError';
  }
}

interface MoxfieldSearchResponse {
  pageNumber: number;
  pageSize: number;
  totalResults: number;
  totalPages: number;
  data: Array<{
    publicId: string;
    name: string;
    format: string;
    publicUrl: string;
    createdAtUtc: string;
    lastUpdatedAtUtc: string;
  }>;
}

export interface MoxfieldService {
  fetchUserDecks(username: string): Promise<MoxfieldDeckSummary[]>;
  fetchDeckDetail(publicId: string): Promise<MoxfieldDeckDetail>;
  isReady(): boolean;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}

/**
 * Extracts a Moxfield deck publicId from a URL, if the URL is a Moxfield
 * deck link. Handles variations like:
 *   https://www.moxfield.com/decks/{id}
 *   https://moxfield.com/decks/{id}
 *   http://moxfield.com/decks/{id}/whatever
 *   moxfield.com/decks/{id}?foo=bar
 * Returns null for non-Moxfield or non-deck URLs.
 */
export function parseMoxfieldDeckId(url: string): string | null {
  if (typeof url !== 'string') return null;
  const match = url.match(/moxfield\.com\/decks\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

export function createMoxfieldService(config: AppConfig): MoxfieldService {
  let browser: Browser | null = null;
  let page: Page | null = null;
  let ready = false;

  async function initialize(): Promise<void> {
    if (ready && browser?.connected) return;

    // Clean up any existing browser
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }

    console.log('🌐 Launching browser for Moxfield access...');

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
      throw new MoxfieldTimeoutError();
    }
  }

  async function fetchUserDecks(username: string): Promise<MoxfieldDeckSummary[]> {
    const baseUrl = config.moxfieldBaseUrl;

    // Verify user exists
    const profileUrl = `${baseUrl.replace('/v2', '/v1')}/users/${encodeURIComponent(username)}`;
    const profileResult = await browserFetch(profileUrl);

    if (profileResult.status === 404) {
      throw new MoxfieldUserNotFoundError(username);
    }
    if (profileResult.status < 200 || profileResult.status >= 300) {
      throw new MoxfieldAPIError(profileResult.status);
    }

    // Fetch all commander decks with pagination
    const allDecks: MoxfieldDeckSummary[] = [];
    let pageNumber = 1;
    let totalPages = 1;

    do {
      const params = new URLSearchParams({
        includePinned: 'true',
        showIllegal: 'true',
        authorUserNames: username,
        pageNumber: String(pageNumber),
        pageSize: '100',
        sortType: 'updated',
        sortDirection: 'descending',
        board: 'mainboard',
        fmt: 'commander',
      });
      const url = `${baseUrl}/decks/search?${params.toString()}`;
      const { status, body } = await browserFetch(url);

      if (status < 200 || status >= 300) {
        throw new MoxfieldAPIError(status);
      }

      const data = body as MoxfieldSearchResponse;
      totalPages = data.totalPages;

      const decks: MoxfieldDeckSummary[] = data.data.map((d) => ({
        publicId: d.publicId,
        name: d.name,
        format: d.format || 'commander',
        publicUrl: d.publicUrl || `https://moxfield.com/decks/${d.publicId}`,
        createdAtUtc: d.createdAtUtc,
        lastUpdatedAtUtc: d.lastUpdatedAtUtc,
      }));
      allDecks.push(...decks);
      pageNumber++;
    } while (pageNumber <= totalPages);

    return allDecks;
  }

  async function fetchDeckDetail(publicId: string): Promise<MoxfieldDeckDetail> {
    const url = `${config.moxfieldBaseUrl}/decks/all/${encodeURIComponent(publicId)}`;
    const { status, body } = await browserFetch(url);

    if (status === 404) {
      throw new MoxfieldAPIError(404);
    }
    if (status < 200 || status >= 300) {
      throw new MoxfieldAPIError(status);
    }

    return body as MoxfieldDeckDetail;
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
    fetchUserDecks,
    fetchDeckDetail,
    isReady: () => ready,
    initialize,
    shutdown,
  };
}
