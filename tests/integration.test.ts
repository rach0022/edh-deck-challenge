/**
 * Integration tests for the EDH 32 Deck Challenge Checker pipeline.
 *
 * Tests the full pipeline from validation through rendering with mocked Moxfield API.
 * Requirements: 1.1, 1.2, 1.3, 2.2, 2.3, 2.4, 2.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateUsername } from '../src/validator.js';
import {
  createMoxfieldClient,
  MoxfieldUserNotFoundError,
  MoxfieldAPIError,
  MoxfieldTimeoutError,
} from '../src/api/moxfield-client.js';
import { extractCommanders } from '../src/domain/commander-extractor.js';
import { organizeDecks } from '../src/domain/deck-organizer.js';
import { renderASCII } from '../src/renderers/ascii-renderer.js';
import { generateHTMLContent } from '../src/renderers/html-renderer.js';
import type { MoxfieldDeckListResponse, MoxfieldDeckDetail } from '../src/types.js';

// --- Test fixtures ---

const CLIENT_CONFIG = {
  baseUrl: 'https://api2.moxfield.com/v2',
  timeoutMs: 30000,
  userAgent: 'test-integration/1.0',
};

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: new Headers(),
    redirected: false,
    statusText: status === 200 ? 'OK' : 'Error',
    type: 'basic',
    url: '',
    clone: () => mockResponse(body, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    text: async () => JSON.stringify(body),
    bytes: async () => new Uint8Array(),
  } as Response;
}

/** Creates a mock deck list response with commander decks */
function createDeckListResponse(decks: { publicId: string; name: string; format: string }[]): MoxfieldDeckListResponse {
  return {
    pageNumber: 1,
    pageSize: 100,
    totalResults: decks.length,
    totalPages: 1,
    data: decks.map((d) => ({
      publicId: d.publicId,
      name: d.name,
      format: d.format,
      publicUrl: `https://moxfield.com/decks/${d.publicId}`,
      createdAtUtc: '2024-01-01T00:00:00Z',
      lastUpdatedAtUtc: '2024-06-01T00:00:00Z',
    })),
  };
}

/** Creates a mock deck detail with commanders */
function createDeckDetail(
  publicId: string,
  name: string,
  commanders: { name: string; colorIdentity: string[]; set: string; cn: string; imageUrl?: string }[]
): MoxfieldDeckDetail {
  const commandersRecord: Record<string, { quantity: number; card: any }> = {};
  for (const cmd of commanders) {
    commandersRecord[cmd.name] = {
      quantity: 1,
      card: {
        name: cmd.name,
        color_identity: cmd.colorIdentity,
        set: cmd.set,
        cn: cmd.cn,
        image_uris: cmd.imageUrl ? { normal: cmd.imageUrl } : undefined,
      },
    };
  }

  return {
    id: `internal-${publicId}`,
    publicId,
    name,
    format: 'commander',
    commanders: commandersRecord,
    mainboard: {},
  };
}

// --- Tests ---

describe('Integration: Full Pipeline', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Happy path: full pipeline execution', () => {
    it('should process multiple commander decks and produce correct ASCII and HTML output', async () => {
      // Setup mock data: 3 commander decks covering different color identities
      const deckList = createDeckListResponse([
        { publicId: 'deck-kozilek', name: 'Kozilek Eldrazi', format: 'commander' },
        { publicId: 'deck-brago', name: 'Brago Blink', format: 'commander' },
        { publicId: 'deck-jund', name: 'Jund Dragons', format: 'commander' },
      ]);

      const kozilekDetail = createDeckDetail('deck-kozilek', 'Kozilek Eldrazi', [
        { name: 'Kozilek, the Great Distortion', colorIdentity: [], set: 'ogw', cn: '4', imageUrl: 'https://cards.example.com/kozilek.jpg' },
      ]);

      const bragoDetail = createDeckDetail('deck-brago', 'Brago Blink', [
        { name: 'Brago, King Eternal', colorIdentity: ['W', 'U'], set: 'ema', cn: '198', imageUrl: 'https://cards.example.com/brago.jpg' },
      ]);

      const jundDetail = createDeckDetail('deck-jund', 'Jund Dragons', [
        { name: 'Wasitora, Nekoru Queen', colorIdentity: ['B', 'R', 'G'], set: 'c17', cn: '49', imageUrl: 'https://cards.example.com/wasitora.jpg' },
      ]);

      // Mock fetch: first call returns deck list, subsequent calls return details
      fetchMock
        .mockResolvedValueOnce(mockResponse(deckList))
        .mockResolvedValueOnce(mockResponse(kozilekDetail))
        .mockResolvedValueOnce(mockResponse(bragoDetail))
        .mockResolvedValueOnce(mockResponse(jundDetail));

      // 1. Validate username
      const validation = validateUsername('testuser');
      expect(validation.valid).toBe(true);
      if (!validation.valid) return;

      // 2. Fetch decks via client
      const client = createMoxfieldClient(CLIENT_CONFIG);
      const deckSummaries = await client.fetchUserDecks(validation.username);
      expect(deckSummaries).toHaveLength(3);

      // 3. Fetch details for each deck
      const deckDetails = [];
      for (const summary of deckSummaries) {
        const detail = await client.fetchDeckDetail(summary.publicId);
        deckDetails.push(detail);
      }

      // 4. Extract commanders
      const extractions = deckDetails.map((deck) => extractCommanders(deck));
      expect(extractions).toHaveLength(3);
      expect(extractions.every((e) => !e.skipped)).toBe(true);

      // 5. Organize into slots
      const progress = organizeDecks(extractions, validation.username);
      expect(progress.filledCount).toBe(3);
      expect(progress.totalSlots).toBe(32);
      expect(progress.skippedDecks).toHaveLength(0);

      // 6. Render ASCII
      const asciiOutput = renderASCII(progress);
      expect(asciiOutput).toContain('Kozilek, the Great Distortion');
      expect(asciiOutput).toContain('Brago, King Eternal');
      expect(asciiOutput).toContain('Wasitora, Nekoru Queen');
      expect(asciiOutput).toContain('Progress: 3/32 slots filled');
      expect(asciiOutput).toContain('testuser');

      // 7. Generate HTML content
      const htmlOutput = generateHTMLContent(progress);
      expect(htmlOutput).toContain('<img');
      expect(htmlOutput).toContain('https://cards.example.com/kozilek.jpg');
      expect(htmlOutput).toContain('https://cards.example.com/brago.jpg');
      expect(htmlOutput).toContain('https://cards.example.com/wasitora.jpg');
      expect(htmlOutput).toContain('onerror');
      expect(htmlOutput).toContain('3 / 32 slots filled');
    });

    it('should handle partner commanders and union their color identities', async () => {
      const deckList = createDeckListResponse([
        { publicId: 'deck-partners', name: 'Partner Power', format: 'commander' },
      ]);

      // Partners: Thrasios (UG) + Tymna (WB) → combined WUBG
      const partnerDetail = createDeckDetail('deck-partners', 'Partner Power', [
        { name: 'Thrasios, Triton Hero', colorIdentity: ['U', 'G'], set: 'c16', cn: '46', imageUrl: 'https://cards.example.com/thrasios.jpg' },
        { name: 'Tymna the Weaver', colorIdentity: ['W', 'B'], set: 'c16', cn: '48', imageUrl: 'https://cards.example.com/tymna.jpg' },
      ]);

      fetchMock
        .mockResolvedValueOnce(mockResponse(deckList))
        .mockResolvedValueOnce(mockResponse(partnerDetail));

      const client = createMoxfieldClient(CLIENT_CONFIG);
      const deckSummaries = await client.fetchUserDecks('partneruser');
      const detail = await client.fetchDeckDetail(deckSummaries[0].publicId);
      const extraction = extractCommanders(detail);
      const progress = organizeDecks([extraction], 'partneruser');

      // WUBG = Witch-Maw (four-color slot)
      const witchMawSlot = progress.slots.find((s) => s.key === 'WUBG');
      expect(witchMawSlot).toBeDefined();
      expect(witchMawSlot!.decks).toHaveLength(1);
      expect(witchMawSlot!.decks[0].commanderNames).toContain('Thrasios, Triton Hero');
      expect(witchMawSlot!.decks[0].commanderNames).toContain('Tymna the Weaver');
    });
  });

  describe('Input validation errors', () => {
    it('should reject undefined username with usage message', () => {
      const result = validateUsername(undefined);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe('Usage: edh-challenge <moxfield-username>');
      }
    });

    it('should reject whitespace-only username', () => {
      const result = validateUsername('   ');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Username is invalid');
      }
    });

    it('should reject empty string username', () => {
      const result = validateUsername('');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Username is invalid');
      }
    });

    it('should accept and trim valid username', () => {
      const result = validateUsername('  myuser  ');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.username).toBe('myuser');
      }
    });
  });

  describe('API error scenarios', () => {
    it('should throw MoxfieldTimeoutError when fetch aborts', async () => {
      fetchMock.mockImplementationOnce(
        (_url: string, options: { signal: AbortSignal }) => {
          return new Promise((_resolve, reject) => {
            const abortHandler = () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            };
            if (options.signal.aborted) {
              abortHandler();
            } else {
              options.signal.addEventListener('abort', abortHandler);
            }
          });
        }
      );

      const client = createMoxfieldClient({ ...CLIENT_CONFIG, timeoutMs: 1 });
      await expect(client.fetchUserDecks('testuser')).rejects.toThrow(MoxfieldTimeoutError);
    });

    it('should throw MoxfieldUserNotFoundError when API returns 404', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({}, 404));

      const client = createMoxfieldClient(CLIENT_CONFIG);
      await expect(client.fetchUserDecks('nonexistent_user')).rejects.toThrow(MoxfieldUserNotFoundError);
    });

    it('should throw MoxfieldAPIError when API returns 500', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({}, 500));

      const client = createMoxfieldClient(CLIENT_CONFIG);
      await expect(client.fetchUserDecks('testuser')).rejects.toThrow(MoxfieldAPIError);
    });
  });

  describe('Empty and edge-case responses', () => {
    it('should return empty array when user has no public decks', async () => {
      const emptyDeckList = createDeckListResponse([]);

      fetchMock.mockResolvedValueOnce(mockResponse(emptyDeckList));

      const client = createMoxfieldClient(CLIENT_CONFIG);
      const decks = await client.fetchUserDecks('emptyuser');
      expect(decks).toHaveLength(0);
    });

    it('should handle mix of decks with some having no commanders (skipped)', async () => {
      const deckList = createDeckListResponse([
        { publicId: 'deck-valid', name: 'Valid EDH', format: 'commander' },
        { publicId: 'deck-nocommander', name: 'Missing Commander', format: 'commander' },
      ]);

      const validDetail = createDeckDetail('deck-valid', 'Valid EDH', [
        { name: 'Giada, Font of Hope', colorIdentity: ['W'], set: 'snc', cn: '14', imageUrl: 'https://cards.example.com/giada.jpg' },
      ]);

      // Deck with empty commanders zone
      const noCommanderDetail: MoxfieldDeckDetail = {
        id: 'internal-deck-nocommander',
        publicId: 'deck-nocommander',
        name: 'Missing Commander',
        format: 'commander',
        commanders: {},
        mainboard: {},
      };

      fetchMock
        .mockResolvedValueOnce(mockResponse(deckList))
        .mockResolvedValueOnce(mockResponse(validDetail))
        .mockResolvedValueOnce(mockResponse(noCommanderDetail));

      const client = createMoxfieldClient(CLIENT_CONFIG);
      const deckSummaries = await client.fetchUserDecks('mixeduser');

      const deckDetails = [];
      for (const summary of deckSummaries) {
        const detail = await client.fetchDeckDetail(summary.publicId);
        deckDetails.push(detail);
      }

      const extractions = deckDetails.map((deck) => extractCommanders(deck));

      // One should be skipped
      expect(extractions.filter((e) => e.skipped)).toHaveLength(1);
      expect(extractions.filter((e) => !e.skipped)).toHaveLength(1);

      const progress = organizeDecks(extractions, 'mixeduser');

      // Only the valid deck fills a slot
      expect(progress.filledCount).toBe(1);
      expect(progress.skippedDecks).toHaveLength(1);
      expect(progress.skippedDecks[0].deckName).toBe('Missing Commander');

      // ASCII output reflects skipped deck doesn't appear in slots
      const asciiOutput = renderASCII(progress);
      expect(asciiOutput).toContain('Giada, Font of Hope');
      expect(asciiOutput).toContain('Progress: 1/32 slots filled');
    });

    it('should filter out non-commander format decks from API response', async () => {
      const mixedFormatList = createDeckListResponse([
        { publicId: 'edh1', name: 'Commander Deck', format: 'commander' },
        { publicId: 'mod1', name: 'Modern Deck', format: 'modern' },
        { publicId: 'std1', name: 'Standard Deck', format: 'standard' },
      ]);

      fetchMock.mockResolvedValueOnce(mockResponse(mixedFormatList));

      const client = createMoxfieldClient(CLIENT_CONFIG);
      const decks = await client.fetchUserDecks('multiformat');

      // Only commander format decks should be returned
      expect(decks).toHaveLength(1);
      expect(decks[0].name).toBe('Commander Deck');
    });
  });
});
