/**
 * User collection provenance — pure, side-effect-free logic for tracking which
 * Moxfield board each card the user has was found on.
 *
 * Ownership for the cEDH-match and Build-a-Commander features is derived from
 * the cards across a user's decks. A card can appear on different boards in
 * different decks (mainboard in one, sideboard in another); we keep the
 * strongest signal via a fixed precedence:
 *
 *     mainboard  >  sideboard  >  maybeboard
 *
 * A mainboard match means the card is actively played (definitely owned, no
 * badge). A sideboard/maybeboard-only match still counts as owned but is
 * badged ("Sideboard" / "Considering") so it's clear the user may not own it.
 */

import type { CardBoard } from '../types.js';
import { normalizeCardName } from './deck-similarity.js';

/** Board precedence — lower number wins when a card appears on several boards. */
const BOARD_RANK: Record<CardBoard, number> = {
  mainboard: 0,
  sideboard: 1,
  maybeboard: 2,
};

/** Returns the stronger (higher-precedence) of two boards. */
export function strongerBoard(a: CardBoard, b: CardBoard): CardBoard {
  return BOARD_RANK[a] <= BOARD_RANK[b] ? a : b;
}

/** A single card the user has, tagged with the board it came from. */
export interface CollectionEntry {
  /** Raw card name. */
  name: string;
  /** The board this occurrence was found on. */
  board: CardBoard;
}

/**
 * Merges board-tagged card occurrences into a provenance map keyed by
 * normalized card name. When the same card appears on multiple boards (across
 * decks or within one deck), the strongest board is kept. Names that normalize
 * to empty are dropped.
 */
export function buildCollectionProvenance(
  entries: Iterable<CollectionEntry>,
): Map<string, CardBoard> {
  const provenance = new Map<string, CardBoard>();
  for (const { name, board } of entries) {
    const key = normalizeCardName(name);
    if (!key) continue;
    const existing = provenance.get(key);
    provenance.set(key, existing ? strongerBoard(existing, board) : board);
  }
  return provenance;
}

/**
 * A read-only view over the collection provenance used by the matchers. The
 * key set doubles as the "owned" set (any board counts as owned).
 */
export interface Collection {
  /** True when the user owns the (normalized) card on any board. */
  has(normalizedName: string): boolean;
  /** The board the card was found on, or null when not owned. */
  boardOf(normalizedName: string): CardBoard | null;
  /** Number of distinct owned cards. */
  readonly size: number;
}

/** Wraps a provenance map in the read-only `Collection` view. */
export function toCollection(provenance: Map<string, CardBoard>): Collection {
  return {
    has: (name) => provenance.has(name),
    boardOf: (name) => provenance.get(name) ?? null,
    get size() {
      return provenance.size;
    },
  };
}
