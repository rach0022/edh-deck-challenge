/**
 * Browser-based Moxfield API client using Puppeteer.
 * 
 * Moxfield's API is behind Cloudflare bot protection which blocks
 * automated HTTP requests. This client uses a headless browser to
 * solve the Cloudflare challenge, then makes API requests through
 * the browser's page context (which has valid cookies/clearance).
 */

import puppeteer, { type Browser, type Page } from 'puppeteer';
import type {
  MoxfieldDeckSummary,
  MoxfieldDeckDetail,
} from '../types.js';
import {
  MoxfieldUserNotFoundError,
  MoxfieldAPIError,
  MoxfieldTimeoutError,
  type MoxfieldClient,
} from './moxfield-client.js';

export interface BrowserClientConfig {
  baseUrl: string;
  timeoutMs: number;
  headless?: boolean;
}

interface MoxfieldSearchResponse {
  pageNumber: number;
  pageSize: number;
  totalResults: number;
  totalPages: number;
  data: MoxfieldSearchDeck[];
}

interface MoxfieldSearchDeck {
  publicId: string;
  name: string;
  format: string;
  publicUrl: string;
  createdAtUtc: string;
  lastUpdatedAtUtc: string;
}

/**
 * Creates a browser-based Moxfield client that bypasses Cloudflare protection.
 * 
 * Launches a headless Chrome instance, navigates to moxfield.com to get
 * Cloudflare clearance cookies, then uses page.evaluate(fetch(...)) to make
 * API requests from within the browser context.
 */
export async function createBrowserClient(config: BrowserClientConfig): Promise<MoxfieldClient & { close(): Promise<void> }> {
  const { baseUrl, timeoutMs, headless = true } = config;

  let browser: Browser;
  let page: Page;

  // Launch browser and get Cloudflare clearance
  try {
    browser = await puppeteer.launch({
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();

    // Set a realistic viewport and user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 720 });

    // Navigate to Moxfield to get Cloudflare clearance
    console.error('Connecting to Moxfield (solving Cloudflare challenge)...');
    await page.goto('https://moxfield.com', {
      waitUntil: 'networkidle2',
      timeout: timeoutMs,
    });

    // Wait for Cloudflare challenge to resolve (look for page content)
    await page.waitForFunction(
      () => !document.title.includes('Just a moment'),
      { timeout: timeoutMs }
    );
    console.error('Connected to Moxfield.');
  } catch (error: unknown) {
    throw new MoxfieldTimeoutError();
  }

  /**
   * Makes a fetch request from within the browser page context.
   * This uses the browser's cookies (including cf_clearance) automatically.
   */
  async function browserFetch(url: string): Promise<{ status: number; body: unknown }> {
    try {
      const result = await page.evaluate(async (fetchUrl: string) => {
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
    } catch (error: unknown) {
      throw new MoxfieldTimeoutError();
    }
  }

  async function fetchUserDecks(username: string): Promise<MoxfieldDeckSummary[]> {
    // First, verify the user exists via v1 profile endpoint
    const profileUrl = `${baseUrl.replace('/v2', '/v1')}/users/${encodeURIComponent(username)}`;
    const profileResult = await browserFetch(profileUrl);

    if (profileResult.status === 404) {
      throw new MoxfieldUserNotFoundError(username);
    }

    if (profileResult.status < 200 || profileResult.status >= 300) {
      throw new MoxfieldAPIError(profileResult.status);
    }

    // Fetch user's decks via the search endpoint with authorUserNames filter
    // Only fetch commander format decks
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

      // Map search results to deck summaries
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
    const url = `${baseUrl}/decks/all/${encodeURIComponent(publicId)}`;
    const { status, body } = await browserFetch(url);

    if (status === 404) {
      throw new MoxfieldAPIError(404);
    }

    if (status < 200 || status >= 300) {
      throw new MoxfieldAPIError(status);
    }

    return body as MoxfieldDeckDetail;
  }

  async function close(): Promise<void> {
    await browser.close();
  }

  return {
    fetchUserDecks,
    fetchDeckDetail,
    close,
  };
}
