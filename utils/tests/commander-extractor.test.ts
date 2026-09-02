import { describe, it, expect } from 'vitest';
import { extractCommanders } from '../src/domain/commander-extractor.js';
import type { MoxfieldDeckDetail } from '../src/types.js';

describe('extractCommanders', () => {
  it('extracts a single commander with valid image', () => {
    const deck: MoxfieldDeckDetail = {
      id: 'deck-1',
      publicId: 'pub-1',
      name: 'Mono White Aggro',
      format: 'commander',
      commanders: {
        'giada-font-of-hope': {
          quantity: 1,
          card: {
            name: 'Giada, Font of Hope',
            color_identity: ['W'],
            set: 'snc',
            cn: '14',
            image_uris: {
              normal: 'https://cards.scryfall.io/normal/front/snc/14.jpg',
              large: 'https://cards.scryfall.io/large/front/snc/14.jpg',
            },
          },
        },
      },
      mainboard: {},
    };

    const result = extractCommanders(deck);

    expect(result.skipped).toBe(false);
    expect(result.deckName).toBe('Mono White Aggro');
    expect(result.deckId).toBe('pub-1');
    expect(result.commanders).toHaveLength(1);
    expect(result.commanders[0]).toEqual({
      name: 'Giada, Font of Hope',
      colorIdentity: ['W'],
      imageUrl: 'https://cards.scryfall.io/normal/front/snc/14.jpg',
      setCode: 'snc',
      collectorNumber: '14',
    });
  });

  it('extracts partner commanders (two entries)', () => {
    const deck: MoxfieldDeckDetail = {
      id: 'deck-2',
      publicId: 'pub-2',
      name: 'Simic Partners',
      format: 'commander',
      commanders: {
        'thrasios-triton-hero': {
          quantity: 1,
          card: {
            name: 'Thrasios, Triton Hero',
            color_identity: ['U', 'G'],
            set: 'c16',
            cn: '46',
            image_uris: {
              normal: 'https://cards.scryfall.io/normal/front/c16/46.jpg',
            },
          },
        },
        'tymna-the-weaver': {
          quantity: 1,
          card: {
            name: 'Tymna the Weaver',
            color_identity: ['W', 'B'],
            set: 'c16',
            cn: '48',
            image_uris: {
              normal: 'https://cards.scryfall.io/normal/front/c16/48.jpg',
            },
          },
        },
      },
      mainboard: {},
    };

    const result = extractCommanders(deck);

    expect(result.skipped).toBe(false);
    expect(result.deckName).toBe('Simic Partners');
    expect(result.deckId).toBe('pub-2');
    expect(result.commanders).toHaveLength(2);
    expect(result.commanders[0].name).toBe('Thrasios, Triton Hero');
    expect(result.commanders[0].colorIdentity).toEqual(['U', 'G']);
    expect(result.commanders[1].name).toBe('Tymna the Weaver');
    expect(result.commanders[1].colorIdentity).toEqual(['W', 'B']);
  });

  it('marks deck as skipped when commander zone is empty', () => {
    const deck: MoxfieldDeckDetail = {
      id: 'deck-3',
      publicId: 'pub-3',
      name: 'Empty Commander Zone',
      format: 'commander',
      commanders: {},
      mainboard: {},
    };

    const result = extractCommanders(deck);

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('No commander found in deck "Empty Commander Zone"');
    expect(result.commanders).toHaveLength(0);
    expect(result.deckName).toBe('Empty Commander Zone');
    expect(result.deckId).toBe('pub-3');
  });

  it('returns null imageUrl when image_uris is missing and no card_faces', () => {
    const deck: MoxfieldDeckDetail = {
      id: 'deck-4',
      publicId: 'pub-4',
      name: 'No Image Commander',
      format: 'commander',
      commanders: {
        'mystery-commander': {
          quantity: 1,
          card: {
            name: 'Mystery Commander',
            color_identity: ['R'],
            set: 'unk',
            cn: '1',
            image_uris: undefined,
            card_faces: undefined,
          },
        },
      },
      mainboard: {},
    };

    const result = extractCommanders(deck);

    expect(result.skipped).toBe(false);
    expect(result.commanders).toHaveLength(1);
    expect(result.commanders[0].name).toBe('Mystery Commander');
    expect(result.commanders[0].imageUrl).toBeNull();
    expect(result.commanders[0].colorIdentity).toEqual(['R']);
    expect(result.commanders[0].setCode).toBe('unk');
    expect(result.commanders[0].collectorNumber).toBe('1');
  });

  it('falls back to card_faces[0] image when card-level image_uris is missing', () => {
    const deck: MoxfieldDeckDetail = {
      id: 'deck-5',
      publicId: 'pub-5',
      name: 'Double-Faced Commander',
      format: 'commander',
      commanders: {
        'double-face': {
          quantity: 1,
          card: {
            name: 'Esika, God of the Tree // The Prismatic Bridge',
            color_identity: ['W', 'U', 'B', 'R', 'G'],
            set: 'khm',
            cn: '168',
            image_uris: undefined,
            card_faces: [
              {
                name: 'Esika, God of the Tree',
                image_uris: {
                  normal: 'https://cards.scryfall.io/normal/front/khm/168a.jpg',
                },
              },
              {
                name: 'The Prismatic Bridge',
                image_uris: {
                  normal: 'https://cards.scryfall.io/normal/front/khm/168b.jpg',
                },
              },
            ],
          },
        },
      },
      mainboard: {},
    };

    const result = extractCommanders(deck);

    expect(result.skipped).toBe(false);
    expect(result.commanders).toHaveLength(1);
    expect(result.commanders[0].name).toBe('Esika, God of the Tree // The Prismatic Bridge');
    expect(result.commanders[0].imageUrl).toBe(
      'https://cards.scryfall.io/normal/front/khm/168a.jpg'
    );
  });
});
