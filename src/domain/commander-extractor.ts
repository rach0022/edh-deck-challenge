/**
 * Commander extractor for EDH decks.
 * Extracts commander card(s) from a Moxfield deck's commander zone.
 */

import type { Color, MoxfieldDeckDetail } from '../types.js';

export interface ExtractedCommander {
  name: string;
  colorIdentity: Color[];
  imageUrl: string | null;
  setCode: string;
  collectorNumber: string;
}

export interface ExtractionResult {
  deckName: string;
  deckId: string;
  commanders: ExtractedCommander[];
  skipped: boolean;
  skipReason?: string;
}

/**
 * Extracts commander card(s) from a Moxfield deck detail.
 */
export function extractCommanders(deck: MoxfieldDeckDetail): ExtractionResult {
  const commanderEntries = Object.values(deck.commanders);

  if (commanderEntries.length === 0) {
    return {
      deckName: deck.name,
      deckId: deck.publicId,
      commanders: [],
      skipped: true,
      skipReason: `No commander found in deck "${deck.name}"`,
    };
  }

  const commanders: ExtractedCommander[] = commanderEntries.map((entry) => {
    const { card } = entry;
    const imageUrl =
      card.image_uris?.normal ??
      card.card_faces?.[0]?.image_uris?.normal ??
      null;

    return {
      name: card.name,
      colorIdentity: card.color_identity as Color[],
      imageUrl,
      setCode: card.set,
      collectorNumber: card.cn,
    };
  });

  return {
    deckName: deck.name,
    deckId: deck.publicId,
    commanders,
    skipped: false,
  };
}
