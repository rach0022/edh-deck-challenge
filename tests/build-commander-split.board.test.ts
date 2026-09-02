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

  it('attaches board to owned recommendation cards; to-buy cards have null board', () => {
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

    const boardOf = (n: string) =>
      split.ownedCards.find((c) => c.name === n)?.board;
    expect(boardOf('Sol Ring')).toBe('mainboard');
    expect(boardOf('Rhystic Study')).toBe('sideboard');
    expect(boardOf('Smothering Tithe')).toBe('maybeboard');

    // Mana Crypt isn't owned → to-buy with null board.
    const manaCrypt = split.toBuyCards.find((c) => c.name === 'Mana Crypt')!;
    expect(manaCrypt.board).toBeNull();
  });

  it('defaults cardNames-only decks to mainboard (back-compat)', () => {
    const index = buildOwnedCardIndex([
      { name: 'Legacy Deck', cardNames: ['Sol Ring', 'Command Tower'] },
    ]);
    expect(index.board.get('sol ring')).toBe('mainboard');
    expect(index.board.get('command tower')).toBe('mainboard');
  });
});
