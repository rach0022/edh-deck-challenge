/**
 * Commander extractor for EDH decks.
 * Extracts commander card(s) from a Moxfield deck's commander zone,
 * handling single commanders and partner pairs.
 */

import type { Color, MoxfieldDeckDetail } from '../types.js';

/** Extracted commander data with name, color identity, and image info. */
export interface ExtractedCommander {
  name: string;
  colorIdentity: Color[];
  imageUrl: string | null;
  setCode: string;
  collectorNumber: string;
}

/** Result of extracting commanders from a deck. */
export interface ExtractionResult {
  deckName: string;
  deckId: string;
  commanders: ExtractedCommander[];
  skipped: boolean;
  skipReason?: string;
}

/**
 * Extracts commander card(s) from a Moxfield deck detail.
 *
 * Iterates over entries in `deck.commanders` to pull out commander info.
 * Handles single commanders and partner commanders (two entries).
 * Marks the deck as skipped if the commander zone is empty.
 *
 * For image URLs, prefers `card.image_uris.normal`, then falls back to
 * `card.card_faces[0].image_uris.normal`, and finally `null`.
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

    // Resolve image URL: prefer card.image_uris.normal, then card_faces[0].image_uris.normal, else null
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
