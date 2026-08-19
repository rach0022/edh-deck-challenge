import { describe, it, expect } from 'vitest';
import { renderASCII, truncateName } from '../src/renderers/ascii-renderer.js';
import { organizeDecks } from '../src/domain/deck-organizer.js';
import type { ChallengeProgress } from '../src/domain/deck-organizer.js';
import type { ExtractionResult } from '../src/domain/commander-extractor.js';

describe('truncateName', () => {
  it('returns the original string when exactly 30 characters', () => {
    const name = 'A'.repeat(30); // exactly 30 chars
    expect(truncateName(name, 30)).toBe(name);
    expect(truncateName(name, 30).length).toBe(30);
  });

  it('truncates and appends "..." when string is 31 characters', () => {
    const name = 'A'.repeat(31); // 31 chars
    const result = truncateName(name, 30);
    expect(result).toBe('A'.repeat(30) + '...');
    expect(result.length).toBe(33);
  });

  it('returns unchanged short string', () => {
    expect(truncateName('Giada', 30)).toBe('Giada');
  });

  it('returns empty string unchanged', () => {
    expect(truncateName('', 30)).toBe('');
  });
});

describe('renderASCII', () => {
  /** Helper to build a set of extraction results for testing */
  function buildExtractions(): ExtractionResult[] {
    return [
      {
        deckName: 'Colorless Deck',
        deckId: 'deck-c',
        commanders: [{ name: 'Kozilek, the Great Distortion', colorIdentity: [], imageUrl: null, setCode: 'ogw', collectorNumber: '4' }],
        skipped: false,
      },
      {
        deckName: 'White Deck',
        deckId: 'deck-w',
        commanders: [{ name: 'Giada, Font of Hope', colorIdentity: ['W'], imageUrl: null, setCode: 'snc', collectorNumber: '14' }],
        skipped: false,
      },
      {
        deckName: 'Azorius Deck',
        deckId: 'deck-wu',
        commanders: [{ name: 'Brago, King Eternal', colorIdentity: ['W', 'U'], imageUrl: null, setCode: 'ema', collectorNumber: '198' }],
        skipped: false,
      },
      {
        deckName: 'Skipped Deck',
        deckId: 'deck-skip',
        commanders: [],
        skipped: true,
        skipReason: 'No commander found',
      },
    ];
  }

  it('renders header with username', () => {
    const progress = organizeDecks(buildExtractions(), 'testuser');
    const output = renderASCII(progress);

    expect(output).toContain('EDH 32 Deck Challenge - testuser');
  });

  it('renders all category headers', () => {
    const progress = organizeDecks(buildExtractions(), 'testuser');
    const output = renderASCII(progress);

    expect(output).toContain('Colorless');
    expect(output).toContain('Mono Color');
    expect(output).toContain('Two Color');
    expect(output).toContain('Three Color');
    expect(output).toContain('Four Color');
    expect(output).toContain('Five Color');
  });

  it('renders all 32 color combination names', () => {
    const progress = organizeDecks([], 'testuser');
    const output = renderASCII(progress);

    const expectedNames = [
      'Colorless', 'Mono White', 'Mono Blue', 'Mono Black', 'Mono Red', 'Mono Green',
      'Azorius', 'Orzhov', 'Boros', 'Selesnya', 'Dimir', 'Izzet', 'Simic', 'Rakdos', 'Golgari', 'Gruul',
      'Esper', 'Jeskai', 'Bant', 'Mardu', 'Abzan', 'Naya', 'Grixis', 'Sultai', 'Temur', 'Jund',
      'Yore-Tiller', 'Witch-Maw', 'Ink-Treader', 'Dune-Brood', 'Glint-Eye',
      '5-Color',
    ];

    for (const name of expectedNames) {
      expect(output).toContain(name);
    }
  });

  it('shows commander names for filled slots', () => {
    const progress = organizeDecks(buildExtractions(), 'testuser');
    const output = renderASCII(progress);

    expect(output).toContain('Kozilek, the Great Distortion');
    expect(output).toContain('Giada, Font of Hope');
    expect(output).toContain('Brago, King Eternal');
  });

  it('shows [empty] for unfilled slots', () => {
    const progress = organizeDecks(buildExtractions(), 'testuser');
    const output = renderASCII(progress);

    expect(output).toContain('[empty]');
  });

  it('renders progress summary line', () => {
    const progress = organizeDecks(buildExtractions(), 'testuser');
    const output = renderASCII(progress);

    // 3 non-skipped decks fill 3 slots
    expect(output).toContain('Progress: 3/32 slots filled');
  });

  it('shows 0/32 when no decks are provided', () => {
    const progress = organizeDecks([], 'emptyuser');
    const output = renderASCII(progress);

    expect(output).toContain('Progress: 0/32 slots filled');
  });

  it('renders multiple decks in one slot on separate lines', () => {
    const extractions: ExtractionResult[] = [
      {
        deckName: 'Azorius Deck 1',
        deckId: 'deck-wu1',
        commanders: [{ name: 'Brago, King Eternal', colorIdentity: ['W', 'U'], imageUrl: null, setCode: 'ema', collectorNumber: '198' }],
        skipped: false,
      },
      {
        deckName: 'Azorius Deck 2',
        deckId: 'deck-wu2',
        commanders: [{ name: 'Shorikai, Genesis Engine', colorIdentity: ['W', 'U'], imageUrl: null, setCode: 'nec', collectorNumber: '4' }],
        skipped: false,
      },
    ];

    const progress = organizeDecks(extractions, 'multiuser');
    const output = renderASCII(progress);

    // Both commanders should appear in the output
    expect(output).toContain('Brago, King Eternal');
    expect(output).toContain('Shorikai, Genesis Engine');

    // They should be on different lines
    const lines = output.split('\n');
    const bragoLine = lines.findIndex((l) => l.includes('Brago, King Eternal'));
    const shorikaiLine = lines.findIndex((l) => l.includes('Shorikai, Genesis Engine'));

    expect(bragoLine).toBeGreaterThan(-1);
    expect(shorikaiLine).toBeGreaterThan(-1);
    expect(bragoLine).not.toBe(shorikaiLine);
  });

  it('truncates long commander names in the output', () => {
    const longName = 'Selvala, Heart of the Wilds and More Text';
    const extractions: ExtractionResult[] = [
      {
        deckName: 'Long Name Deck',
        deckId: 'deck-g',
        commanders: [{ name: longName, colorIdentity: ['G'], imageUrl: null, setCode: 'cn2', collectorNumber: '70' }],
        skipped: false,
      },
    ];

    const progress = organizeDecks(extractions, 'truncateuser');
    const output = renderASCII(progress);

    // The full name should NOT appear (it's over 30 chars)
    expect(output).not.toContain(longName);
    // The truncated version should appear with "..."
    expect(output).toContain(longName.slice(0, 30) + '...');
  });

  it('renders partner commanders joined with " & "', () => {
    const extractions: ExtractionResult[] = [
      {
        deckName: 'Partner Deck',
        deckId: 'deck-partners',
        commanders: [
          { name: 'Thrasios', colorIdentity: ['U', 'G'], imageUrl: null, setCode: 'c16', collectorNumber: '46' },
          { name: 'Tymna', colorIdentity: ['W', 'B'], imageUrl: null, setCode: 'c16', collectorNumber: '48' },
        ],
        skipped: false,
      },
    ];

    const progress = organizeDecks(extractions, 'partneruser');
    const output = renderASCII(progress);

    expect(output).toContain('Thrasios & Tymna');
  });
});
