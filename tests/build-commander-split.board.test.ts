import { describe, it, expect } from 'vitest';
import {
  buildOwnedCardIndex,
  partitionRecommendations,
  type UserDeckCards,
} from '../src/domain/build-commander-split.js';
import type { EdhrecRecommendation } from '../src/types.js';

function rec(name: string): EdhrecRecommendation {
  return {
    name,
    category: 'Top Cards',
    inclusion: null,
    synergy: null,
    scryfallId: null,
    setCode: null,
    collectorNumber: null,
  };
}

describe('build-commander-split board provenance', () => {
  it('records the strongest board per card across decks', () => {
    const decks: UserDeckCards[] = [
      {
        name: 'Deck A',
        cardNames: [],
        boardCards: [
          { name: 'Sol Ring', board: 'maybeboard' },
          { name: 'Rhystic Study', board: 'sideboard' },
        ],
      },
      {
        name: 'Deck B',
        cardNames: [],
        boardCards: [
          { name: 'Sol Ring', board: 'mainboard' }, // upgrades Sol Ring to mainboard
          { name: 'Cyclonic Rift', board: 'maybeboard' },
        ],
      },
    ];

    const index = buildOwnedCardIndex(decks);
    expect(index.board.get('sol ring')).toBe('mainboard');
    expect(index.board.get('rhystic study')).toBe('sideboard');
    expect(index.board.get('cyclonic rift')).toBe('maybeboard');
  });

  it('classifies mainboard as owned, sideboard/maybeboard as considering, absent as to-buy', () => {
    const decks: UserDeckCards[] = [
      {
        name: 'Deck A',
        cardNames: [],
        boardCards: [
          { name: 'Sol Ring', board: 'mainboard' },
          { name: 'Rhystic Study', board: 'sideboard' },
          { name: 'Smothering Tithe', board: 'maybeboard' },
        ],
      },
    ];
    const index = buildOwnedCardIndex(decks);
    const split = partitionRecommendations(
      [rec('Sol Ring'), rec('Rhystic Study'), rec('Smothering Tithe'), rec('Mana Crypt')],
      index,
    );

    // Mainboard match → owned.
    const solRing = split.ownedCards.find((c) => c.name === 'Sol Ring')!;
    expect(solRing).toBeDefined();
    expect(solRing.owned).toBe(true);
    expect(solRing.board).toBe('mainboard');

    // Sideboard/maybeboard matches → considering (not owned), with their board.
    const considering = (n: string) =>
      split.consideringCards.find((c) => c.name === n);
    expect(considering('Rhystic Study')?.board).toBe('sideboard');
    expect(considering('Rhystic Study')?.owned).toBe(false);
    expect(considering('Smothering Tithe')?.board).toBe('maybeboard');
    expect(considering('Smothering Tithe')?.owned).toBe(false);

    // Considering cards keep their source decks so provenance still shows.
    expect(considering('Rhystic Study')?.sourceDecks).toEqual(['Deck A']);

    // Sideboard/maybeboard cards are NOT in the owned list.
    expect(split.ownedCards.map((c) => c.name)).toEqual(['Sol Ring']);

    // Mana Crypt isn't in the collection → to-buy with null board.
    const manaCrypt = split.toBuyCards.find((c) => c.name === 'Mana Crypt')!;
    expect(manaCrypt.board).toBeNull();
    expect(manaCrypt.owned).toBe(false);

    // Three-way counts add up.
    expect(split.ownedCount).toBe(1);
    expect(split.consideringCount).toBe(2);
    expect(split.toBuyCount).toBe(1);
  });

  it('defaults cardNames-only decks to mainboard (back-compat)', () => {
    const index = buildOwnedCardIndex([
      { name: 'Legacy Deck', cardNames: ['Sol Ring', 'Command Tower'] },
    ]);
    expect(index.board.get('sol ring')).toBe('mainboard');
    expect(index.board.get('command tower')).toBe('mainboard');
  });
});
