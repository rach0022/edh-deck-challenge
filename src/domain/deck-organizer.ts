/**
 * Deck organizer for the EDH 32 Deck Challenge.
 * Maps extraction results to the 32 color combination slots.
 */

import type { ColorIdentity, ChallengeProgress, ColorSlot } from '../types.js';
import { COLOR_COMBINATIONS } from './color-combinations.js';
import { resolveColorIdentity, colorIdentityToKey } from './color-identity.js';
import type { ExtractionResult } from './commander-extractor.js';

/**
 * Organizes extraction results into the 32 color combination slots.
 */
export function organizeDecks(extractions: ExtractionResult[], username: string): ChallengeProgress {
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
    if (extraction.skipped) {
      skippedDecks.push({
        deckName: extraction.deckName,
        reason: extraction.skipReason ?? 'Unknown reason',
      });
      continue;
    }

    const colorIdentity = resolveColorIdentity(extraction.commanders);
    const key = colorIdentityToKey(colorIdentity);
    const slot = slotMap.get(key);

    if (slot) {
      slot.decks.push({
        deckName: extraction.deckName,
        deckId: extraction.deckId,
        commanderNames: extraction.commanders.map((c) => c.name),
        commanderImages: extraction.commanders.map((c) => c.imageUrl),
        commanders: extraction.commanders.map((c) => ({
          name: c.name,
          imageUrl: c.imageUrl,
          setCode: c.setCode,
          collectorNumber: c.collectorNumber,
        })),
      });
    }
  }

  const slots = COLOR_COMBINATIONS.map((combo) => slotMap.get(combo.key)!);
  const filledCount = slots.filter((slot) => slot.decks.length > 0).length;

  return {
    username,
    slots,
    filledCount,
    totalSlots: 32,
    skippedDecks,
  };
}
