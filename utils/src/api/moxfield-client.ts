/**
 * Moxfield API client for fetching user decks and deck details.
 * Uses native fetch (Node.js 18+) with timeout support via AbortController.
 */

import type {
  MoxfieldDeckListResponse,
  MoxfieldDeckSummary,
  MoxfieldDeckDetail,
} from '../types.js';

/** Configuration for the Moxfield API client */
export interface MoxfieldClientConfig {
  baseUrl: string; // e.g., "https://api2.moxfield.com/v2"
  timeoutMs: number; // e.g., 30000
  userAgent: string;
}

/** Client interface for interacting with the Moxfield API */
export interface MoxfieldClient {
  fetchUserDecks(username: string): Promise<MoxfieldDeckSummary[]>;
  fetchDeckDetail(publicId: string): Promise<MoxfieldDeckDetail>;
}

/** Error thrown when the Moxfield API returns a 404 (user not found) */
export class MoxfieldUserNotFoundError extends Error {
  constructor(username: string) {
    super(`Moxfield user "${username}" not found.`);
    this.name = 'MoxfieldUserNotFoundError';
  }
}

/** Error thrown when the Moxfield API returns a non-404 error */
export class MoxfieldAPIError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number) {
    super(
      `Moxfield API returned an error (${statusCode}). Please try again later.`
    );
    this.name = 'MoxfieldAPIError';
    this.statusCode = statusCode;
  }
}

/** Error thrown when a request times out or a network error occurs */
export class MoxfieldTimeoutError extends Error {
  constructor() {
    super(
      'Could not reach Moxfield. The service may be temporarily unavailable.'
    );
    this.name = 'MoxfieldTimeoutError';
  }
}

/**
 * Creates a Moxfield API client with the given configuration.
 */
export function createMoxfieldClient(config: MoxfieldClientConfig): MoxfieldClient {
  const { baseUrl, timeoutMs, userAgent } = config;

  async function fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': userAgent,
          Accept: 'application/json',
        },
      });
      return response;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new MoxfieldTimeoutError();
      }
      // Network errors (DNS failure, connection refused, etc.)
      throw new MoxfieldTimeoutError();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function fetchUserDecks(username: string): Promise<MoxfieldDeckSummary[]> {
    const allDecks: MoxfieldDeckSummary[] = [];
    let pageNumber = 1;
    let totalPages = 1;

    do {
      const url = `${baseUrl}/users/${encodeURIComponent(username)}/decks?pageNumber=${pageNumber}&pageSize=100`;
      const response = await fetchWithTimeout(url);

      if (response.status === 404) {
        throw new MoxfieldUserNotFoundError(username);
      }

      if (!response.ok) {
        throw new MoxfieldAPIError(response.status);
      }

      const data = (await response.json()) as MoxfieldDeckListResponse;
      totalPages = data.totalPages;

      // Filter to only commander format decks
      const commanderDecks = data.data.filter(
        (deck) => deck.format === 'commander'
      );
      allDecks.push(...commanderDecks);

      pageNumber++;
    } while (pageNumber <= totalPages);

    return allDecks;
  }

  async function fetchDeckDetail(publicId: string): Promise<MoxfieldDeckDetail> {
    const url = `${baseUrl}/decks/all/${encodeURIComponent(publicId)}`;
    const response = await fetchWithTimeout(url);

    if (response.status === 404) {
      throw new MoxfieldAPIError(404);
    }

    if (!response.ok) {
      throw new MoxfieldAPIError(response.status);
    }

    const data = (await response.json()) as MoxfieldDeckDetail;
    return data;
  }

  return {
    fetchUserDecks,
    fetchDeckDetail,
  };
}
