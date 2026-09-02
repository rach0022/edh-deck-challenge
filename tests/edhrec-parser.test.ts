import { describe, it, expect } from 'vitest';
import {
  parseEdhrecRecommendations,
  parseCommanderRank,
  applyCompanionConstraint,
  parseRecommendationsForSelection,
} from '../src/domain/edhrec-parser.js';
import type { CommanderSelection, EdhrecRecommendation } from '../src/types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/**
 * A realistic slice of EDHREC's commander JSON: the recommendation panels live
 * under `container.json_dict.cardlists`, each with a `header` (category) and a
 * `cardviews` array of per-card entries.
 */
function realisticPayload() {
  return {
    container: {
      json_dict: {
        cardlists: [
          {
            header: 'High Synergy Cards',
            tag: 'highsynergycards',
            cardviews: [
              {
                id: 'scry-sol-ring',
                name: 'Sol Ring',
                synergy: 0.42,
                num_decks: 37478,
                potential_decks: 44077,
                slug: 'sol-ring',
                url: '/cards/sol-ring',
              },
              {
                id: 'scry-arcane-signet',
                name: 'Arcane Signet',
                synergy: -0.0195,
                num_decks: 20000,
                potential_decks: 40000,
              },
            ],
          },
          {
            header: 'Top Cards',
            tag: 'topcards',
            cardviews: [
              {
                id: 'scry-command-tower',
                name: 'Command Tower',
                synergy: 0.1,
                num_decks: 30000,
                potential_decks: 44077,
              },
            ],
          },
        ],
      },
    },
  };
}

const selection = (over: Partial<CommanderSelection> = {}): CommanderSelection => ({
  commander: 'Krenko, Mob Boss',
  partner: null,
  companion: null,
  ...over,
});

// ─── parseEdhrecRecommendations ────────────────────────────────────────────────

describe('parseEdhrecRecommendations', () => {
  it('parses a realistic payload into a flat recommendation list', () => {
    const recs = parseEdhrecRecommendations(realisticPayload());

    expect(recs).toHaveLength(3);
    expect(recs.map((r) => r.name)).toEqual([
      'Sol Ring',
      'Arcane Signet',
      'Command Tower',
    ]);
  });

  it('carries the panel header through as the category', () => {
    const recs = parseEdhrecRecommendations(realisticPayload());

    expect(recs[0].category).toBe('High Synergy Cards');
    expect(recs[1].category).toBe('High Synergy Cards');
    expect(recs[2].category).toBe('Top Cards');
  });

  it('computes inclusion as num_decks / potential_decks', () => {
    const recs = parseEdhrecRecommendations(realisticPayload());

    // 37478 / 44077 ≈ 0.85028...
    expect(recs[0].inclusion).toBeCloseTo(37478 / 44077, 10);
    expect(recs[1].inclusion).toBeCloseTo(0.5, 10);
  });

  it('extracts synergy and scryfallId, and leaves printing hints null', () => {
    const [solRing] = parseEdhrecRecommendations(realisticPayload());

    expect(solRing).toEqual<EdhrecRecommendation>({
      name: 'Sol Ring',
      category: 'High Synergy Cards',
      inclusion: 37478 / 44077,
      synergy: 0.42,
      scryfallId: 'scry-sol-ring',
      setCode: null,
      collectorNumber: null,
    });
  });

  it('returns [] for an empty object payload', () => {
    expect(parseEdhrecRecommendations({})).toEqual([]);
  });

  it('returns [] for null / undefined / non-object payloads', () => {
    expect(parseEdhrecRecommendations(null)).toEqual([]);
    expect(parseEdhrecRecommendations(undefined)).toEqual([]);
    expect(parseEdhrecRecommendations('not-json')).toEqual([]);
    expect(parseEdhrecRecommendations(42)).toEqual([]);
    expect(parseEdhrecRecommendations([])).toEqual([]);
  });

  it('returns [] when cardlists is missing or malformed', () => {
    expect(parseEdhrecRecommendations({ container: {} })).toEqual([]);
    expect(
      parseEdhrecRecommendations({ container: { json_dict: {} } }),
    ).toEqual([]);
    expect(
      parseEdhrecRecommendations({ container: { json_dict: { cardlists: 'nope' } } }),
    ).toEqual([]);
  });

  it('reads a directly-embedded json_dict.cardlists fallback shape', () => {
    const payload = {
      json_dict: {
        cardlists: [
          {
            header: 'Fallback Panel',
            cardviews: [{ id: 'x', name: 'Fallback Card', num_decks: 1, potential_decks: 2 }],
          },
        ],
      },
    };

    const recs = parseEdhrecRecommendations(payload);

    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ name: 'Fallback Card', category: 'Fallback Panel' });
  });

  it('reads a top-level cardlists fallback shape', () => {
    const payload = {
      cardlists: [
        {
          header: 'Top-level Panel',
          cardviews: [{ id: 'y', name: 'Top Card', num_decks: 3, potential_decks: 4 }],
        },
      ],
    };

    const recs = parseEdhrecRecommendations(payload);

    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ name: 'Top Card', category: 'Top-level Panel' });
  });

  it('skips malformed cardviews (missing/blank name) but keeps valid siblings', () => {
    const payload = {
      container: {
        json_dict: {
          cardlists: [
            {
              header: 'Mixed',
              cardviews: [
                { id: 'a', name: 'Good Card', num_decks: 1, potential_decks: 2 },
                { id: 'b' }, // missing name → skipped
                { id: 'c', name: '   ' }, // blank name → skipped
                'not-an-object', // not a record → skipped
                null, // null → skipped
                { id: 'd', name: 'Another Good Card', num_decks: 1, potential_decks: 2 },
              ],
            },
          ],
        },
      },
    };

    const recs = parseEdhrecRecommendations(payload);

    expect(recs.map((r) => r.name)).toEqual(['Good Card', 'Another Good Card']);
  });

  it('skips panels that are not objects or whose cardviews is not an array', () => {
    const payload = {
      container: {
        json_dict: {
          cardlists: [
            'not-a-panel',
            null,
            { header: 'No cardviews' }, // cardviews missing → skipped
            { header: 'Bad cardviews', cardviews: 'nope' }, // not array → skipped
            {
              header: 'Valid',
              cardviews: [{ id: 'z', name: 'Kept Card', num_decks: 1, potential_decks: 2 }],
            },
          ],
        },
      },
    };

    const recs = parseEdhrecRecommendations(payload);

    expect(recs.map((r) => r.name)).toEqual(['Kept Card']);
  });

  it('trims the card name and defaults category to empty when header is absent', () => {
    const payload = {
      container: {
        json_dict: {
          cardlists: [
            {
              // no header
              cardviews: [{ id: 'p', name: '  Padded Name  ', num_decks: 1, potential_decks: 2 }],
            },
          ],
        },
      },
    };

    const [rec] = parseEdhrecRecommendations(payload);

    expect(rec.name).toBe('Padded Name');
    expect(rec.category).toBe('');
  });

  it('sets inclusion null when counts are missing', () => {
    const payload = {
      container: {
        json_dict: {
          cardlists: [
            { header: 'H', cardviews: [{ id: 'n1', name: 'No Counts' }] },
          ],
        },
      },
    };

    expect(parseEdhrecRecommendations(payload)[0].inclusion).toBeNull();
  });

  it('sets inclusion null when the denominator is 0 (or non-positive)', () => {
    const payload = {
      container: {
        json_dict: {
          cardlists: [
            {
              header: 'H',
              cardviews: [
                { id: 'z1', name: 'Zero Denom', num_decks: 5, potential_decks: 0 },
                { id: 'z2', name: 'Neg Denom', num_decks: 5, potential_decks: -10 },
              ],
            },
          ],
        },
      },
    };

    const recs = parseEdhrecRecommendations(payload);
    expect(recs[0].inclusion).toBeNull();
    expect(recs[1].inclusion).toBeNull();
  });

  it('clamps inclusion into the 0..1 range', () => {
    const payload = {
      container: {
        json_dict: {
          cardlists: [
            {
              header: 'H',
              cardviews: [
                { id: 'hi', name: 'Over One', num_decks: 100, potential_decks: 50 },
              ],
            },
          ],
        },
      },
    };

    expect(parseEdhrecRecommendations(payload)[0].inclusion).toBe(1);
  });

  it('sets synergy and scryfallId null when absent or non-finite', () => {
    const payload = {
      container: {
        json_dict: {
          cardlists: [
            {
              header: 'H',
              cardviews: [
                { name: 'No Extras', num_decks: 1, potential_decks: 2 },
                { name: 'Bad Synergy', synergy: 'high', id: 5, num_decks: 1, potential_decks: 2 },
              ],
            },
          ],
        },
      },
    };

    const recs = parseEdhrecRecommendations(payload);
    expect(recs[0].synergy).toBeNull();
    expect(recs[0].scryfallId).toBeNull();
    expect(recs[1].synergy).toBeNull();
    expect(recs[1].scryfallId).toBeNull();
  });
});

// ─── applyCompanionConstraint ──────────────────────────────────────────────────

describe('applyCompanionConstraint', () => {
  const recs: EdhrecRecommendation[] = [
    { name: 'Sol Ring', category: 'c', inclusion: null, synergy: null, scryfallId: null, setCode: null, collectorNumber: null },
    { name: 'Lightning Bolt', category: 'c', inclusion: null, synergy: null, scryfallId: null, setCode: null, collectorNumber: null },
    { name: 'Counterspell', category: 'c', inclusion: null, synergy: null, scryfallId: null, setCode: null, collectorNumber: null },
  ];

  it('returns the set unchanged when the legal names are null/undefined', () => {
    expect(applyCompanionConstraint(recs, null)).toBe(recs);
    expect(applyCompanionConstraint(recs, undefined)).toBe(recs);
  });

  it('keeps only recommendations whose normalized name is in the legal set', () => {
    const kept = applyCompanionConstraint(recs, ['Sol Ring', 'Counterspell']);
    expect(kept.map((r) => r.name)).toEqual(['Sol Ring', 'Counterspell']);
  });

  it('matches names case-insensitively and normalized', () => {
    const kept = applyCompanionConstraint(recs, ['sol ring', '  LIGHTNING BOLT  ']);
    expect(kept.map((r) => r.name)).toEqual(['Sol Ring', 'Lightning Bolt']);
  });

  it('constrains to nothing when the legal set is empty', () => {
    expect(applyCompanionConstraint(recs, [])).toEqual([]);
  });
});

// ─── parseRecommendationsForSelection ───────────────────────────────────────────

describe('parseRecommendationsForSelection', () => {
  it('does not apply the companion constraint when selection.companion is unset', () => {
    // legal names supplied but ignored because there is no companion
    const recs = parseRecommendationsForSelection(
      realisticPayload(),
      selection({ companion: null }),
      ['Sol Ring'],
    );

    expect(recs.map((r) => r.name)).toEqual([
      'Sol Ring',
      'Arcane Signet',
      'Command Tower',
    ]);
  });

  it('applies the companion constraint when selection.companion is set', () => {
    const recs = parseRecommendationsForSelection(
      realisticPayload(),
      selection({ companion: 'Lurrus of the Dream-Den' }),
      ['Sol Ring', 'Command Tower'],
    );

    expect(recs.map((r) => r.name)).toEqual(['Sol Ring', 'Command Tower']);
  });

  it('constrains to nothing when a companion is set but no legal names are provided', () => {
    const recs = parseRecommendationsForSelection(
      realisticPayload(),
      selection({ companion: 'Lurrus of the Dream-Den' }),
    );

    expect(recs).toEqual([]);
  });

  it('returns [] for a malformed payload regardless of companion', () => {
    expect(
      parseRecommendationsForSelection({}, selection({ companion: 'X' }), ['Sol Ring']),
    ).toEqual([]);
    expect(parseRecommendationsForSelection(null, selection())).toEqual([]);
  });
});

// ─── parseCommanderRank ─────────────────────────────────────────────────────

describe('parseCommanderRank', () => {
  it('extracts rank + num_decks from container.json_dict.card', () => {
    const payload = {
      container: { json_dict: { card: { name: 'X', rank: 135, num_decks: 14429 } } },
    };
    expect(parseCommanderRank(payload)).toEqual({ rank: 135, numDecks: 14429 });
  });

  it('reads a top-level card fallback', () => {
    expect(parseCommanderRank({ card: { rank: 7, num_decks: 500 } })).toEqual({
      rank: 7,
      numDecks: 500,
    });
  });

  it('returns nulls when the card block or fields are missing', () => {
    expect(parseCommanderRank({})).toEqual({ rank: null, numDecks: null });
    expect(parseCommanderRank({ container: { json_dict: {} } })).toEqual({
      rank: null,
      numDecks: null,
    });
    expect(
      parseCommanderRank({ container: { json_dict: { card: { name: 'X' } } } }),
    ).toEqual({ rank: null, numDecks: null });
  });

  it('returns nulls for malformed/non-object payloads', () => {
    expect(parseCommanderRank(null)).toEqual({ rank: null, numDecks: null });
    expect(parseCommanderRank('nope')).toEqual({ rank: null, numDecks: null });
    expect(parseCommanderRank(42)).toEqual({ rank: null, numDecks: null });
  });

  it('ignores non-numeric rank/num_decks values', () => {
    const payload = {
      container: { json_dict: { card: { rank: 'high', num_decks: null } } },
    };
    expect(parseCommanderRank(payload)).toEqual({ rank: null, numDecks: null });
  });
});
