import { describe, it, expect } from 'vitest';
import {
  strongerBoard,
  buildCollectionProvenance,
  toCollection,
  type CollectionEntry,
} from '../src/domain/collection.js';

describe('strongerBoard', () => {
  it('ranks mainboard > sideboard > maybeboard', () => {
    expect(strongerBoard('mainboard', 'sideboard')).toBe('mainboard');
    expect(strongerBoard('sideboard', 'mainboard')).toBe('mainboard');
    expect(strongerBoard('sideboard', 'maybeboard')).toBe('sideboard');
    expect(strongerBoard('maybeboard', 'sideboard')).toBe('sideboard');
    expect(strongerBoard('maybeboard', 'maybeboard')).toBe('maybeboard');
  });
});

describe('buildCollectionProvenance', () => {
  it('keeps the strongest board when a card appears on several boards', () => {
    const entries: CollectionEntry[] = [
      { name: 'Sol Ring', board: 'maybeboard' },
      { name: 'Sol Ring', board: 'mainboard' },
      { name: 'Sol Ring', board: 'sideboard' },
      { name: 'Rhystic Study', board: 'sideboard' },
      { name: 'Rhystic Study', board: 'maybeboard' },
    ];
    const prov = buildCollectionProvenance(entries);
    expect(prov.get('sol ring')).toBe('mainboard');
    expect(prov.get('rhystic study')).toBe('sideboard');
  });

  it('normalizes names (case/whitespace/front-face) into one key', () => {
    const prov = buildCollectionProvenance([
      { name: '  SOL   Ring ', board: 'sideboard' },
      { name: 'Sol Ring // Something', board: 'maybeboard' },
    ]);
    expect(prov.size).toBe(1);
    expect(prov.get('sol ring')).toBe('sideboard'); // sideboard beats maybeboard
  });

  it('drops names that normalize to empty', () => {
    const prov = buildCollectionProvenance([
      { name: '   ', board: 'mainboard' },
      { name: '// x', board: 'mainboard' },
    ]);
    expect(prov.size).toBe(0);
  });
});

describe('toCollection', () => {
  it('exposes has / boardOf / size over the provenance map', () => {
    const prov = buildCollectionProvenance([
      { name: 'Sol Ring', board: 'mainboard' },
      { name: 'Rhystic Study', board: 'sideboard' },
    ]);
    const c = toCollection(prov);
    expect(c.size).toBe(2);
    expect(c.has('sol ring')).toBe(true);
    expect(c.has('command tower')).toBe(false);
    expect(c.boardOf('sol ring')).toBe('mainboard');
    expect(c.boardOf('rhystic study')).toBe('sideboard');
    expect(c.boardOf('command tower')).toBeNull();
  });
});
