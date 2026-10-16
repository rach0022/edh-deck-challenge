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

/** Coerces an unknown value to a 1–5 bracket number, or null. */
function coerceBracket(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

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

/** Moxfield's native Commander bracket info (from the v3 deck endpoint). */
export interface MoxfieldDeckBracket {
  /** Effective bracket Moxfield reports (1–5), or null when absent. */
  bracket: number | null;
  /** The bracket the author set manually, or null. */
  userBracket: number | null;
  /** Moxfield's auto-computed bracket, or null. */
  autoBracket: number | null;
  /** True when the author opted the deck out of the bracket system. */
  ignoreBrackets: boolean;
}

export interface MoxfieldService {
  fetchUserDecks(username: string): Promise<MoxfieldDeckSummary[]>;
  fetchDeckDetail(publicId: string): Promise<MoxfieldDeckDetail>;
  /**
   * Fetches a deck's Commander bracket from Moxfield's v3 deck endpoint (the
   * v2 endpoint we use for `fetchDeckDetail` does not expose brackets).
   * Best-effort: returns null on any failure or when no bracket is present, so
   * callers can fall back to an estimate without failing the whole request.
   */
  fetchDeckBracket(publicId: string): Promise<MoxfieldDeckBracket | null>;
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

  async function fetchDeckBracket(
    publicId: string,
  ): Promise<MoxfieldDeckBracket | null> {
    // Brackets live on the v3 deck endpoint; v2 (used by fetchDeckDetail) omits
    // them. Derive the v3 base from the configured v2 base.
    const v3Base = config.moxfieldBaseUrl.replace(/\/v\d+$/, '/v3');
    const url = `${v3Base}/decks/all/${encodeURIComponent(publicId)}`;

    try {
      const { status, body } = await browserFetch(url);
      if (status < 200 || status >= 300 || !body || typeof body !== 'object') {
        return null;
      }
      const b = body as Record<string, unknown>;
      return {
        bracket: coerceBracket(b.bracket),
        userBracket: coerceBracket(b.userBracket),
        autoBracket: coerceBracket(b.autoBracket),
        ignoreBrackets: b.ignoreBrackets === true,
      };
    } catch {
      // Best-effort — a bracket miss should never fail the challenge build.
      return null;
    }
  }

  return {
    fetchUserDecks,
    fetchDeckDetail,
    fetchDeckBracket,
    // Lifecycle delegates to the shared browser service.
    isReady: () => browser.isReady(),
    initialize: () => browser.initialize(),
    shutdown: () => browser.shutdown(),
  };
}
