import { describe, it, expect } from 'vitest';
import {
  findCutCandidates,
  findAddSuggestions,
  type SuggestionInputCard,
} from '../src/domain/deck-suggestions.js';
import type { EdhrecRecommendation } from '../src/types.js';

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

function card(name: string, types: string[], scryfallId: string | null = `${name}-id`): SuggestionInputCard {
  return { name, scryfallId, types };
}

// ─── findCutCandidates ───────────────────────────────────────────────────────

describe('findCutCandidates', () => {
  const recs = [rec('Sol Ring'), rec('Rhystic Study')];

  it('flags non-land, non-commander deck cards absent from the EDHREC recs', () => {
    const deck = [
      card('Sol Ring', ['Artifact']), // is a rec → kept
      card('Jhoira, Weatherlight Captain', ['Legendary', 'Creature']), // commander → excluded
      card('Some Spicy Tech', ['Instant']), // not a rec → CUT
      card('Command Tower', ['Land']), // land → excluded
    ];
    const cuts = findCutCandidates(deck, recs, ['Jhoira, Weatherlight Captain']);
    expect(cuts.map((c) => c.name)).toEqual(['Some Spicy Tech']);
    expect(cuts[0].reason).toMatch(/not an edhrec pick/i);
    expect(cuts[0].type).toBe('Instant');
  });

  it('excludes basic/utility lands via type classification', () => {
    const deck = [
      card('Island', ['Basic', 'Land', 'Island']),
      card('Reliquary Tower', ['Land']),
    ];
    const cuts = findCutCandidates(deck, recs, []);
    expect(cuts).toEqual([]);
  });

  it('keeps a card that IS a rec even with no synergy data', () => {
    const deck = [card('Rhystic Study', ['Enchantment'])];
    expect(findCutCandidates(deck, recs, [])).toEqual([]);
  });

  it('deduplicates by normalized name and matches "A // B" front faces', () => {
    const deck = [
      card('Fire // Ice', ['Instant']),
      card('Fire', ['Instant']), // same normalized key
    ];
    const cuts = findCutCandidates(deck, recs, []);
    expect(cuts).toHaveLength(1);
  });
});

// ─── findAddSuggestions ──────────────────────────────────────────────────────

describe('findAddSuggestions', () => {
  it('suggests missing recs above the synergy OR inclusion threshold, best first', () => {
    const recs = [
      rec('High Synergy Card', { synergy: 0.25, inclusion: 0.1 }), // synergy clears
      rec('Ubiquitous Staple', { synergy: 0.0, inclusion: 0.8 }), // inclusion clears
      rec('Meh Card', { synergy: 0.05, inclusion: 0.1 }), // neither clears → skip
    ];
    const deck: SuggestionInputCard[] = [];
    const adds = findAddSuggestions(deck, recs, []);
    expect(adds.map((a) => a.name)).toEqual(['High Synergy Card', 'Ubiquitous Staple']);
    // Sorted synergy desc first.
    expect(adds[0].name).toBe('High Synergy Card');
  });

  it('excludes cards already in the deck and the commanders', () => {
    const recs = [
      rec('Owned Synergy', { synergy: 0.25 }),
      rec('Commander Card', { synergy: 0.25 }),
      rec('Missing Synergy', { synergy: 0.25 }),
    ];
    const deck = [card('Owned Synergy', ['Artifact'])];
    const adds = findAddSuggestions(deck, recs, ['Commander Card']);
    expect(adds.map((a) => a.name)).toEqual(['Missing Synergy']);
  });

  it('deduplicates recs listed in multiple panels', () => {
    const recs = [
      rec('Dupe', { category: 'High Synergy Cards', synergy: 0.25 }),
      rec('Dupe', { category: 'Top Cards', synergy: 0.25 }),
    ];
    const adds = findAddSuggestions([], recs, []);
    expect(adds).toHaveLength(1);
  });

  it('returns an empty list when nothing clears the thresholds', () => {
    const recs = [rec('Weak', { synergy: 0.0, inclusion: 0.1 })];
    expect(findAddSuggestions([], recs, [])).toEqual([]);
  });
});
