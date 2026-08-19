/**
 * Deck organizer for the EDH 32 Deck Challenge.
 * Maps extraction results to the 32 color combination slots
 * and builds the overall challenge progress summary.
 */

import type { ColorIdentity } from '../types.js';
import { COLOR_COMBINATIONS, type SlotCategory } from './color-combinations.js';
import { resolveColorIdentity, colorIdentityToKey } from './color-identity.js';
import type { ExtractionResult } from './commander-extractor.js';

/** A deck entry within a color combination slot. */
export interface DeckSlotEntry {
  deckName: string;
  deckId: string;
  commanderNames: string[];
  commanderImages: (string | null)[];
}

/** A single color combination slot with its assigned decks. */
export interface ColorSlot {
  key: string;
  name: string;
  category: SlotCategory;
  colors: ColorIdentity;
  decks: DeckSlotEntry[];
}

/** Overall challenge progress for a user. */
export interface ChallengeProgress {
  username: string;
  slots: ColorSlot[];
  filledCount: number;
  totalSlots: 32;
  skippedDecks: { deckName: string; reason: string }[];
}

/**
 * Organizes extraction results into the 32 color combination slots.
 *
 * For each non-skipped extraction result, resolves the combined color identity,
 * converts it to a slot key, and places the deck into the matching slot.
 * Skipped decks are collected separately with their skip reasons.
 *
 * @param extractions - Array of extraction results from commander-extractor
 * @param username - The Moxfield username for the progress object
 * @returns ChallengeProgress with all 32 slots populated
 */
export function organizeDecks(extractions: ExtractionResult[], username: string): ChallengeProgress {
  // Initialize all 32 slots from the color combinations definition
  const slotMap = new Map<string, ColorSlot>();

  for (const combo of COLOR_COMBINATIONS) {
    slotMap.set(combo.key, {
      key: combo.key,
      name: combo.name,
      category: combo.category,
      colors: [...combo.colors],
      decks: [],
    });
  }

  const skippedDecks: { deckName: string; reason: string }[] = [];

  for (const extraction of extractions) {
    // Collect skipped decks
    if (extraction.skipped) {
      skippedDecks.push({
        deckName: extraction.deckName,
        reason: extraction.skipReason ?? 'Unknown reason',
      });
      continue;
    }

    // Resolve combined color identity from all commanders
    const colorIdentity = resolveColorIdentity(extraction.commanders);
    const key = colorIdentityToKey(colorIdentity);

    // Find the matching slot and add the deck entry
    const slot = slotMap.get(key);
    if (slot) {
      slot.decks.push({
        deckName: extraction.deckName,
        deckId: extraction.deckId,
        commanderNames: extraction.commanders.map((c) => c.name),
        commanderImages: extraction.commanders.map((c) => c.imageUrl),
      });
    }
  }

  // Build the ordered slots array (preserves COLOR_COMBINATIONS order)
  const slots = COLOR_COMBINATIONS.map((combo) => slotMap.get(combo.key)!);

  // Count filled slots (at least one deck assigned)
  const filledCount = slots.filter((slot) => slot.decks.length > 0).length;

  return {
    username,
    slots,
    filledCount,
    totalSlots: 32,
    skippedDecks,
  };
}
