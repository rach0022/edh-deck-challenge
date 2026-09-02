/**
 * Moxfield scraping service.
 *
 * Fetches a user's commander decks and deck details from Moxfield's API
 * through a shared Puppeteer browser (see `services/browser.ts`) that
 * handles the Cloudflare challenge. The browser lifecycle is owned by the
 * injected `BrowserService`; this service only translates HTTP responses
 * and browser failures into Moxfield-specific results and errors.
 */

import type { AppConfig } from '../config.js';
import type { BrowserService } from './browser.js';
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

export function createMoxfieldService(
  config: AppConfig,
  browser: BrowserService,
): MoxfieldService {
  async function browserFetch(url: string): Promise<{ status: number; body: unknown }> {
    try {
      return await browser.browserFetch(url);
    } catch (error) {
      // The shared browser could not complete the fetch (stale context,
      // navigation timeout, or unreachable) — surface it as a Moxfield timeout.
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

  return {
    fetchUserDecks,
    fetchDeckDetail,
    // Lifecycle delegates to the shared browser service.
    isReady: () => browser.isReady(),
    initialize: () => browser.initialize(),
    shutdown: () => browser.shutdown(),
  };
}
