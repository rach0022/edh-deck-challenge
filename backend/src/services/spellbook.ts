/**
 * Commander Spellbook service — finds combos in a deck using the
 * Commander Spellbook public API (https://backend.commanderspellbook.com).
 *
 * Uses the POST /find-my-combos endpoint which accepts a list of commanders
 * and mainboard cards, and returns combos fully present in the deck as well
 * as "almost included" combos (missing one card).
 */

import type {
  MoxfieldDeckDetail,
  SpellbookCombo,
  SpellbookFindCombosResult,
  DeckCombosData,
} from '../types.js';

const SPELLBOOK_API_BASE = 'https://backend.commanderspellbook.com';

export interface SpellbookService {
  /** Find combos present in the given deck */
  findCombosForDeck(deck: MoxfieldDeckDetail): Promise<DeckCombosData>;
}

export function createSpellbookService(): SpellbookService {

  /**
   * Calls the Commander Spellbook find-my-combos endpoint.
   * Sends all commander and mainboard card names and receives
   * combos categorized by inclusion level.
   */
  async function findCombos(
    commanderNames: string[],
    mainboardNames: string[],
  ): Promise<SpellbookFindCombosResult> {
    const body = {
      commanders: commanderNames.map((name) => ({ card: name })),
      main: mainboardNames.map((name) => ({ card: name })),
    };

    const response = await fetch(`${SPELLBOOK_API_BASE}/find-my-combos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(`Spellbook API error: ${response.status} ${response.statusText}`);
      return { identity: 'C', included: [], almostIncluded: [] };
    }

    const data = await response.json() as {
      results: {
        identity: string;
        included: RawSpellbookVariant[];
        almostIncluded: RawSpellbookVariant[];
        [key: string]: unknown;
      };
    };

    const results = data.results;

    return {
      identity: results.identity,
      included: results.included.map(transformVariant),
      almostIncluded: results.almostIncluded.map(transformVariant),
    };
  }

  /**
   * Transforms a raw Spellbook API variant into our clean combo type.
   */
  function transformVariant(variant: RawSpellbookVariant): SpellbookCombo {
    return {
      id: variant.id,
      cards: variant.uses.map((use) => ({
        id: use.card.id,
        name: use.card.name,
        typeLine: use.card.typeLine,
        imageUriFrontNormal: use.card.imageUriFrontNormal ?? null,
        imageUriFrontSmall: use.card.imageUriFrontSmall ?? null,
      })),
      produces: variant.produces.map((p) => ({
        id: p.feature.id,
        name: p.feature.name,
      })),
      requires: variant.requires.map((r) => ({
        id: r.template.id,
        name: r.template.name,
      })),
      description: variant.description ?? '',
      identity: variant.identity ?? '',
      popularity: variant.popularity ?? 0,
      prices: variant.prices ?? {},
      cardCount: variant.uses.length + variant.requires.length,
      bracketTag: variant.bracketTag ?? '',
      easyPrerequisites: variant.easyPrerequisites ?? '',
      spellbookUrl: `https://commanderspellbook.com/combo/${variant.id}/`,
    };
  }

  return {
    async findCombosForDeck(deck: MoxfieldDeckDetail): Promise<DeckCombosData> {
      try {
        // Extract commander names
        const commanderNames = Object.values(deck.commanders).map((entry) => entry.card.name);

        // Extract mainboard card names (including commanders since they're part of the 99 conceptually)
        const mainboardNames = Object.values(deck.mainboard).map((entry) => entry.card.name);

        const result = await findCombos(commanderNames, mainboardNames);

        return {
          comboCount: result.included.length,
          combos: result.included,
        };
      } catch (error) {
        console.error('Spellbook combo lookup failed:', error);
        // Return empty on failure — combos are a nice-to-have, not critical
        return { comboCount: 0, combos: [] };
      }
    },
  };
}

// ─── Raw API response types (internal) ──────────────────────────────────────

interface RawSpellbookCard {
  id: number;
  name: string;
  typeLine: string;
  imageUriFrontNormal?: string | null;
  imageUriFrontSmall?: string | null;
  [key: string]: unknown;
}

interface RawSpellbookUse {
  card: RawSpellbookCard;
  quantity: number;
  [key: string]: unknown;
}

interface RawSpellbookFeature {
  feature: {
    id: number;
    name: string;
    [key: string]: unknown;
  };
  quantity: number;
}

interface RawSpellbookRequires {
  template: {
    id: number;
    name: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface RawSpellbookVariant {
  id: string;
  uses: RawSpellbookUse[];
  produces: RawSpellbookFeature[];
  requires: RawSpellbookRequires[];
  description?: string;
  identity?: string;
  popularity?: number;
  prices?: { tcgplayer?: string; cardmarket?: string; cardkingdom?: string };
  bracketTag?: string;
  easyPrerequisites?: string;
  [key: string]: unknown;
}
