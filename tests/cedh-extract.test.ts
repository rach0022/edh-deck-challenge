import { describe, it, expect } from 'vitest';
import { extractDeckBoardCards } from '../src/services/cedh.js';
import type { MoxfieldDeckDetail, MoxfieldCardEntry } from '../src/types.js';

/** Wraps a bare card name into a minimal Moxfield entry. */
function entry(name: string): MoxfieldCardEntry {
  return { quantity: 1, card: { name } } as MoxfieldCardEntry;
}

function zone(...names: string[]): Record<string, MoxfieldCardEntry> {
  const z: Record<string, MoxfieldCardEntry> = {};
  for (const n of names) z[n] = entry(n);
  return z;
}

describe('extractDeckBoardCards', () => {
  it('tags cards with their board and treats commanders as mainboard', () => {
    const deck = {
      id: 'x',
      publicId: 'p',
      name: 'Deck',
      format: 'commander',
      commanders: zone('Atraxa, Praetors Voice'),
      mainboard: zone('Sol Ring', 'Command Tower'),
      sideboard: zone('Cyclonic Rift'),
      maybeboard: zone('The Great Henge'),
    } as unknown as MoxfieldDeckDetail;

    const cards = extractDeckBoardCards(deck);
    const byName = new Map(cards.map((c) => [c.name, c.board]));

    expect(byName.get('Atraxa, Praetors Voice')).toBe('mainboard');
    expect(byName.get('Sol Ring')).toBe('mainboard');
    expect(byName.get('Command Tower')).toBe('mainboard');
    expect(byName.get('Cyclonic Rift')).toBe('sideboard');
    expect(byName.get('The Great Henge')).toBe('maybeboard');
    expect(cards).toHaveLength(5);
  });

  it('handles absent sideboard/maybeboard zones', () => {
    const deck = {
      id: 'x', publicId: 'p', name: 'Deck', format: 'commander',
      commanders: zone('Krenko, Mob Boss'),
      mainboard: zone('Sol Ring'),
    } as unknown as MoxfieldDeckDetail;

    const cards = extractDeckBoardCards(deck);
    expect(cards.map((c) => c.board).every((b) => b === 'mainboard')).toBe(true);
    expect(cards).toHaveLength(2);
  });
});
