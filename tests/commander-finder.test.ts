import { describe, it, expect } from 'vitest';
import {
  buildSupportCards,
  couldBeCommander,
  groupSupportByType,
  scoreCandidate,
  sumPositiveSynergy,
  rankCandidates,
  type FinderDeckCard,
} from '../src/domain/commander-finder.js';
import { parseTypeLine } from '../src/domain/card-type.js';
import type { CommanderCandidate, EdhrecRecommendation } from '../src/types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function rec(
  name: string,
  overrides: Partial<EdhrecRecommendation> = {},
): EdhrecRecommendation {
  return {
    name,
    category: 'High Synergy Cards',
    inclusion: null,
    synergy: null,
    scryfallId: `${name}-id`,
    setCode: null,
    collectorNumber: null,
    ...overrides,
  };
}

function card(name: string, types: string[]): FinderDeckCard {
  return { name, scryfallId: `${name}-id`, types };
}

function candidate(overrides: Partial<CommanderCandidate>): CommanderCandidate {
  return {
    name: 'X',
    scryfallId: null,
    imageUrl: null,
    colorIdentity: [],
    edhrecRank: null,
    edhrecNumDecks: null,
    supportCount: 0,
    synergyScore: 0,
    inCombo: false,
    comboFeatures: [],
    score: 0,
    noEdhrecData: false,
    supportCards: [],
    ...overrides,
  };
}

// ─── couldBeCommander ────────────────────────────────────────────────────────

describe('couldBeCommander', () => {
  it('accepts legendary creatures', () => {
    expect(couldBeCommander(parseTypeLine('Legendary Creature — Human Cleric'))).toBe(true);
  });

  it('accepts legendary planeswalkers (the "can be your commander" walkers)', () => {
    expect(couldBeCommander(parseTypeLine('Legendary Planeswalker — Teferi'))).toBe(true);
  });

  it('rejects non-legendary creatures', () => {
    expect(couldBeCommander(parseTypeLine('Creature — Zombie'))).toBe(false);
  });

  it('rejects legendary non-creatures (artifacts, enchantments, lands)', () => {
    expect(couldBeCommander(parseTypeLine('Legendary Artifact'))).toBe(false);
    expect(couldBeCommander(parseTypeLine('Legendary Enchantment'))).toBe(false);
    expect(couldBeCommander(parseTypeLine('Legendary Land'))).toBe(false);
  });

  it('rejects instants, sorceries, and plain lands', () => {
    expect(couldBeCommander(parseTypeLine('Instant'))).toBe(false);
    expect(couldBeCommander(parseTypeLine('Sorcery'))).toBe(false);
    expect(couldBeCommander(parseTypeLine('Basic Land — Swamp'))).toBe(false);
  });

  it('is case-insensitive and uses the front face of a DFC', () => {
    // parseTypeLine already reduces to the front face.
    expect(
      couldBeCommander(parseTypeLine('Legendary Creature — Human Wizard // Legendary Planeswalker')),
    ).toBe(true);
  });
});

// ─── buildSupportCards ───────────────────────────────────────────────────────

describe('buildSupportCards', () => {
  const recs = [
    rec('Sol Ring', { synergy: 0.05, inclusion: 0.9 }),
    rec('Goblin Bombardment', { synergy: 0.3, inclusion: 0.6 }),
  ];

  it('returns only deck cards that are EDHREC picks, annotated with synergy', () => {
    const deck = [
      card('Sol Ring', ['Artifact']),
      card('Goblin Bombardment', ['Enchantment']),
      card('Random Card', ['Instant']), // not a rec → excluded
    ];
    const support = buildSupportCards(deck, recs, 'Krenko, Mob Boss');
    expect(support.map((c) => c.name)).toEqual([
      'Goblin Bombardment', // highest synergy first
      'Sol Ring',
    ]);
    expect(support[0].synergy).toBe(0.3);
    expect(support[0].cardType).toBe('Enchantment');
  });

  it('excludes the candidate commander itself', () => {
    const deck = [card('Krenko, Mob Boss', ['Legendary', 'Creature'])];
    const withCmdr = [...recs, rec('Krenko, Mob Boss', { synergy: 0.5 })];
    const support = buildSupportCards(deck, withCmdr, 'Krenko, Mob Boss');
    expect(support).toEqual([]);
  });

  it('de-duplicates by normalized name, keeping the best-synergy rec', () => {
    const deck = [card('Sol Ring', ['Artifact'])];
    const dupes = [
      rec('Sol Ring', { synergy: 0.05 }),
      rec('Sol Ring', { synergy: 0.2 }),
    ];
    const support = buildSupportCards(deck, dupes, 'Krenko, Mob Boss');
    expect(support).toHaveLength(1);
    expect(support[0].synergy).toBe(0.2);
  });
});

// ─── groupSupportByType ──────────────────────────────────────────────────────

describe('groupSupportByType', () => {
  it('orders support cards by canonical card type', () => {
    const support = buildSupportCards(
      [
        card('Goblin Bombardment', ['Enchantment']),
        card('Krenko Aide', ['Creature']),
        card('Sol Ring', ['Artifact']),
      ],
      [
        rec('Goblin Bombardment', { synergy: 0.3 }),
        rec('Krenko Aide', { synergy: 0.1 }),
        rec('Sol Ring', { synergy: 0.2 }),
      ],
      'Krenko, Mob Boss',
    );
    const grouped = groupSupportByType(support);
    // Creature comes before Artifact before Enchantment in CARD_TYPE_ORDER.
    expect(grouped.map((c) => c.cardType)).toEqual([
      'Creature',
      'Artifact',
      'Enchantment',
    ]);
  });
});

// ─── scoreCandidate / sumPositiveSynergy ─────────────────────────────────────

describe('scoreCandidate', () => {
  it('blends support count and synergy, and boosts combo commanders', () => {
    expect(scoreCandidate(3, 0.6, false)).toBeCloseTo(3.6, 5);
    // Combo boost is +5.
    expect(scoreCandidate(3, 0.6, true)).toBeCloseTo(8.6, 5);
  });

  it('a combo commander outranks a better-supported non-combo commander', () => {
    const nonCombo = scoreCandidate(6, 0.5, false); // 6.5
    const combo = scoreCandidate(3, 0.5, true); // 8.5
    expect(combo).toBeGreaterThan(nonCombo);
  });
});

describe('sumPositiveSynergy', () => {
  it('sums only positive synergy, ignoring null and negatives', () => {
    const support = buildSupportCards(
      [card('A', ['Creature']), card('B', ['Creature']), card('C', ['Creature'])],
      [
        rec('A', { synergy: 0.3 }),
        rec('B', { synergy: -0.1 }),
        rec('C', { synergy: null }),
      ],
      'Cmd',
    );
    expect(sumPositiveSynergy(support)).toBeCloseTo(0.3, 5);
  });
});

// ─── rankCandidates ──────────────────────────────────────────────────────────

describe('rankCandidates', () => {
  it('sorts by score desc, then support count, then EDHREC rank, then name', () => {
    const list = [
      candidate({ name: 'Low', score: 2, supportCount: 2 }),
      candidate({ name: 'High', score: 9, supportCount: 3 }),
      candidate({ name: 'Mid', score: 5, supportCount: 5 }),
    ];
    rankCandidates(list);
    expect(list.map((c) => c.name)).toEqual(['High', 'Mid', 'Low']);
  });

  it('breaks score ties by support count then EDHREC popularity', () => {
    const list = [
      candidate({ name: 'A', score: 4, supportCount: 4, edhrecRank: 500 }),
      candidate({ name: 'B', score: 4, supportCount: 4, edhrecRank: 10 }),
      candidate({ name: 'C', score: 4, supportCount: 6, edhrecRank: 999 }),
    ];
    rankCandidates(list);
    // C has more support; then B outranks A on lower (more popular) rank.
    expect(list.map((c) => c.name)).toEqual(['C', 'B', 'A']);
  });
});
