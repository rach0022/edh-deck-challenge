import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMoxfieldClient,
  MoxfieldUserNotFoundError,
  MoxfieldAPIError,
  MoxfieldTimeoutError,
} from '../src/api/moxfield-client.js';
import type { MoxfieldDeckListResponse } from '../src/types.js';

const config = {
  baseUrl: 'https://api2.moxfield.com/v2',
  timeoutMs: 30000,
  userAgent: 'test-agent',
};

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: new Headers(),
    redirected: false,
    statusText: 'OK',
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

describe('MoxfieldClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchUserDecks', () => {
    it('should retrieve commander decks from a single page', async () => {
      const responseBody: MoxfieldDeckListResponse = {
        pageNumber: 1,
        pageSize: 100,
        totalResults: 2,
        totalPages: 1,
        data: [
          {
            publicId: 'abc123',
            name: 'Kozilek Deck',
            format: 'commander',
            publicUrl: 'https://moxfield.com/decks/abc123',
            createdAtUtc: '2024-01-01T00:00:00Z',
            lastUpdatedAtUtc: '2024-01-02T00:00:00Z',
          },
          {
            publicId: 'def456',
            name: 'Modern Deck',
            format: 'modern',
            publicUrl: 'https://moxfield.com/decks/def456',
            createdAtUtc: '2024-01-01T00:00:00Z',
            lastUpdatedAtUtc: '2024-01-02T00:00:00Z',
          },
        ],
      };

      fetchMock.mockResolvedValueOnce(mockResponse(responseBody));

      const client = createMoxfieldClient(config);
      const decks = await client.fetchUserDecks('testuser');

      expect(decks).toHaveLength(1);
      expect(decks[0].publicId).toBe('abc123');
      expect(decks[0].format).toBe('commander');
    });

    it('should handle pagination across multiple pages', async () => {
      const page1: MoxfieldDeckListResponse = {
        pageNumber: 1,
        pageSize: 100,
        totalResults: 150,
        totalPages: 2,
        data: [
          {
            publicId: 'deck1',
            name: 'Commander Deck 1',
            format: 'commander',
            publicUrl: 'https://moxfield.com/decks/deck1',
            createdAtUtc: '2024-01-01T00:00:00Z',
            lastUpdatedAtUtc: '2024-01-02T00:00:00Z',
          },
        ],
      };

      const page2: MoxfieldDeckListResponse = {
        pageNumber: 2,
        pageSize: 100,
        totalResults: 150,
        totalPages: 2,
        data: [
          {
            publicId: 'deck2',
            name: 'Commander Deck 2',
            format: 'commander',
            publicUrl: 'https://moxfield.com/decks/deck2',
            createdAtUtc: '2024-01-01T00:00:00Z',
            lastUpdatedAtUtc: '2024-01-02T00:00:00Z',
          },
        ],
      };

      fetchMock
        .mockResolvedValueOnce(mockResponse(page1))
        .mockResolvedValueOnce(mockResponse(page2));

      const client = createMoxfieldClient(config);
      const decks = await client.fetchUserDecks('testuser');

      expect(decks).toHaveLength(2);
      expect(decks[0].publicId).toBe('deck1');
      expect(decks[1].publicId).toBe('deck2');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should throw MoxfieldUserNotFoundError on 404', async () => {
      fetchMock.mockResolvedValue(mockResponse({}, 404));

      const client = createMoxfieldClient(config);

      await expect(client.fetchUserDecks('nonexistent')).rejects.toThrow(
        MoxfieldUserNotFoundError
      );
      await expect(client.fetchUserDecks('nonexistent')).rejects.toThrow(
        'Moxfield user "nonexistent" not found.'
      );
    });

    it('should throw MoxfieldAPIError on 500 response', async () => {
      fetchMock.mockResolvedValue(mockResponse({}, 500));

      const client = createMoxfieldClient(config);

      await expect(client.fetchUserDecks('testuser')).rejects.toThrow(
        MoxfieldAPIError
      );
      await expect(client.fetchUserDecks('testuser')).rejects.toThrow(
        'Moxfield API returned an error (500)'
      );
    });

    it('should throw MoxfieldTimeoutError when request times out', async () => {
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

      const client = createMoxfieldClient({
        ...config,
        timeoutMs: 1, // Very short timeout to trigger abort
      });

      await expect(client.fetchUserDecks('testuser')).rejects.toThrow(
        MoxfieldTimeoutError
      );
    });

    it('should throw MoxfieldTimeoutError on network error', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const client = createMoxfieldClient(config);

      await expect(client.fetchUserDecks('testuser')).rejects.toThrow(
        MoxfieldTimeoutError
      );
    });

    it('should construct correct URL with encoded username', async () => {
      const responseBody: MoxfieldDeckListResponse = {
        pageNumber: 1,
        pageSize: 100,
        totalResults: 0,
        totalPages: 1,
        data: [],
      };

      fetchMock.mockResolvedValueOnce(mockResponse(responseBody));

      const client = createMoxfieldClient(config);
      await client.fetchUserDecks('user name');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api2.moxfield.com/v2/users/user%20name/decks?pageNumber=1&pageSize=100',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'test-agent',
            Accept: 'application/json',
          }),
        })
      );
    });

    it('should send correct headers', async () => {
      const responseBody: MoxfieldDeckListResponse = {
        pageNumber: 1,
        pageSize: 100,
        totalResults: 0,
        totalPages: 1,
        data: [],
      };

      fetchMock.mockResolvedValueOnce(mockResponse(responseBody));

      const client = createMoxfieldClient(config);
      await client.fetchUserDecks('testuser');

      const callArgs = fetchMock.mock.calls[0];
      expect(callArgs[1].headers).toEqual({
        'User-Agent': 'test-agent',
        Accept: 'application/json',
      });
    });

    it('should filter out non-commander format decks', async () => {
      const responseBody: MoxfieldDeckListResponse = {
        pageNumber: 1,
        pageSize: 100,
        totalResults: 3,
        totalPages: 1,
        data: [
          {
            publicId: 'edh1',
            name: 'EDH Deck',
            format: 'commander',
            publicUrl: 'https://moxfield.com/decks/edh1',
            createdAtUtc: '2024-01-01T00:00:00Z',
            lastUpdatedAtUtc: '2024-01-02T00:00:00Z',
          },
          {
            publicId: 'mod1',
            name: 'Modern Deck',
            format: 'modern',
            publicUrl: 'https://moxfield.com/decks/mod1',
            createdAtUtc: '2024-01-01T00:00:00Z',
            lastUpdatedAtUtc: '2024-01-02T00:00:00Z',
          },
          {
            publicId: 'std1',
            name: 'Standard Deck',
            format: 'standard',
            publicUrl: 'https://moxfield.com/decks/std1',
            createdAtUtc: '2024-01-01T00:00:00Z',
            lastUpdatedAtUtc: '2024-01-02T00:00:00Z',
          },
        ],
      };

      fetchMock.mockResolvedValueOnce(mockResponse(responseBody));

      const client = createMoxfieldClient(config);
      const decks = await client.fetchUserDecks('testuser');

      expect(decks).toHaveLength(1);
      expect(decks[0].format).toBe('commander');
    });
  });

  describe('fetchDeckDetail', () => {
    it('should retrieve deck detail by public ID', async () => {
      const deckDetail = {
        id: 'internal-id',
        publicId: 'abc123',
        name: 'Kozilek Deck',
        format: 'commander',
        commanders: {
          'Kozilek, the Great Distortion': {
            quantity: 1,
            card: {
              name: 'Kozilek, the Great Distortion',
              color_identity: [],
              set: 'ogw',
              cn: '4',
              image_uris: {
                normal: 'https://example.com/kozilek.jpg',
              },
            },
          },
        },
        mainboard: {},
      };

      fetchMock.mockResolvedValueOnce(mockResponse(deckDetail));

      const client = createMoxfieldClient(config);
      const result = await client.fetchDeckDetail('abc123');

      expect(result.publicId).toBe('abc123');
      expect(result.name).toBe('Kozilek Deck');
      expect(Object.keys(result.commanders)).toHaveLength(1);
    });

    it('should construct correct URL for deck detail', async () => {
      const deckDetail = {
        id: 'id',
        publicId: 'abc123',
        name: 'Deck',
        format: 'commander',
        commanders: {},
        mainboard: {},
      };

      fetchMock.mockResolvedValueOnce(mockResponse(deckDetail));

      const client = createMoxfieldClient(config);
      await client.fetchDeckDetail('abc123');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api2.moxfield.com/v2/decks/all/abc123',
        expect.anything()
      );
    });

    it('should throw MoxfieldAPIError on 404 for deck detail', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({}, 404));

      const client = createMoxfieldClient(config);

      await expect(client.fetchDeckDetail('nonexistent')).rejects.toThrow(
        MoxfieldAPIError
      );
    });

    it('should throw MoxfieldAPIError on 500 for deck detail', async () => {
      fetchMock.mockResolvedValue(mockResponse({}, 500));

      const client = createMoxfieldClient(config);

      await expect(client.fetchDeckDetail('abc123')).rejects.toThrow(
        MoxfieldAPIError
      );
      await expect(client.fetchDeckDetail('abc123')).rejects.toThrow(
        'Moxfield API returned an error (500)'
      );
    });

    it('should throw MoxfieldTimeoutError on timeout for deck detail', async () => {
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

      const client = createMoxfieldClient({
        ...config,
        timeoutMs: 1,
      });

      await expect(client.fetchDeckDetail('abc123')).rejects.toThrow(
        MoxfieldTimeoutError
      );
    });
  });
});
