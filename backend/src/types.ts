/**
 * Shared types for the EDH Deck Challenge API.
 * Re-exports domain types and defines API-specific response shapes.
 */

// ─── Core MTG color types ───────────────────────────────────────────────────

export type Color = 'W' | 'U' | 'B' | 'R' | 'G';
export type ColorIdentity = Color[];

// ─── Moxfield API response types ────────────────────────────────────────────

export interface MoxfieldDeckListResponse {
  pageNumber: number;
  pageSize: number;
  totalResults: number;
  totalPages: number;
  data: MoxfieldDeckSummary[];
}

export interface MoxfieldDeckSummary {
  publicId: string;
  name: string;
  format: string;
  publicUrl: string;
  createdAtUtc: string;
  lastUpdatedAtUtc: string;
}

export interface MoxfieldDeckDetail {
  id: string;
  publicId: string;
  name: string;
  format: string;
  commanders: Record<string, MoxfieldCardEntry>;
  mainboard: Record<string, MoxfieldCardEntry>;
}

export interface MoxfieldCardEntry {
  quantity: number;
  card: MoxfieldCard;
}

export interface MoxfieldCard {
  name: string;
  color_identity: string[];
  set: string;
  cn: string;
  type_line?: string;
  mana_cost?: string;
  cmc?: number;
  image_uris?: {
    normal?: string;
    large?: string;
    art_crop?: string;
  };
  card_faces?: MoxfieldCardFace[];
}

export interface MoxfieldCardFace {
  name: string;
  image_uris?: {
    normal?: string;
    large?: string;
  };
}

// ─── Domain types ───────────────────────────────────────────────────────────

export type SlotCategory = 'colorless' | 'mono' | 'two-color' | 'three-color' | 'four-color' | 'five-color';

export interface ColorCombinationDef {
  key: string;
  name: string;
  colors: Color[];
  category: SlotCategory;
}

export interface CommanderSlotInfo {
  name: string;
  imageUrl: string | null;
  setCode: string;
  collectorNumber: string;
}

export interface DeckSlotEntry {
  deckName: string;
  deckId: string;
  commanderNames: string[];
  commanderImages: (string | null)[];
  commanders: CommanderSlotInfo[];
  comboCount?: number;
}

export interface ColorSlot {
  key: string;
  name: string;
  category: SlotCategory;
  colors: ColorIdentity;
  decks: DeckSlotEntry[];
}

export interface ChallengeProgress {
  username: string;
  slots: ColorSlot[];
  filledCount: number;
  totalSlots: 32;
  skippedDecks: { deckName: string; reason: string }[];
}

// ─── API response types ─────────────────────────────────────────────────────

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  cached?: boolean;
  fetchedAt?: string;
}

export interface ChallengeResponse {
  username: string;
  progress: ChallengeProgress;
  summary: {
    filledCount: number;
    totalSlots: number;
    percentComplete: number;
    categoryCounts: Record<SlotCategory, { filled: number; total: number }>;
  };
}

export interface DecksResponse {
  username: string;
  decks: DeckSummaryResponse[];
  totalDecks: number;
}

export interface DeckSummaryResponse {
  id: string;
  name: string;
  commanders: CommanderSlotInfo[];
  colorIdentityKey: string;
  colorSlotName: string;
  moxfieldUrl: string;
  lastUpdated: string;
}

export interface DeckDetailResponse {
  id: string;
  name: string;
  commanders: CommanderSlotInfo[];
  colorIdentityKey: string;
  colorSlotName: string;
  moxfieldUrl: string;
  cardCount: number;
  cardsByType: CardTypeGroup[];
  combos?: DeckCombosData;
}

export interface CardTypeGroup {
  type: string;
  count: number;
  cards: DeckCardInfo[];
}

export interface DeckCardInfo {
  name: string;
  quantity: number;
  manaCost: string;
  cmc: number;
  typeLine: string;
  setCode: string;
  collectorNumber: string;
  imageUrl: string | null;
}

// ─── Commander Spellbook types ──────────────────────────────────────────────

/** POST body item for the find-my-combos endpoint */
export interface SpellbookCardInput {
  card: string;
}

/** POST body for the find-my-combos endpoint */
export interface SpellbookFindCombosRequest {
  commanders: SpellbookCardInput[];
  main: SpellbookCardInput[];
}

/** A card used in a combo (from Spellbook API response) */
export interface SpellbookComboCard {
  id: number;
  name: string;
  typeLine: string;
  imageUriFrontNormal: string | null;
  imageUriFrontSmall: string | null;
}

/** A feature (result) produced by a combo */
export interface SpellbookComboFeature {
  id: number;
  name: string;
}

/** A template requirement (generic card slot) */
export interface SpellbookComboTemplate {
  id: number;
  name: string;
}

/** A single combo variant from Spellbook */
export interface SpellbookCombo {
  id: string;
  /** Cards used in this combo */
  cards: SpellbookComboCard[];
  /** Results/features this combo produces */
  produces: SpellbookComboFeature[];
  /** Template requirements (e.g. "Permanent Castable for {C}") */
  requires: SpellbookComboTemplate[];
  /** Step-by-step description of how the combo works */
  description: string;
  /** Color identity of the combo */
  identity: string;
  /** Popularity score */
  popularity: number;
  /** Price info */
  prices: { tcgplayer?: string; cardmarket?: string; cardkingdom?: string };
  /** Number of cards in the combo */
  cardCount: number;
  /** Bracket tag */
  bracketTag: string;
  /** Prerequisites */
  easyPrerequisites: string;
  /** Spellbook URL */
  spellbookUrl: string;
}

/** Results from find-my-combos grouped by inclusion type */
export interface SpellbookFindCombosResult {
  identity: string;
  /** Combos fully present in the deck */
  included: SpellbookCombo[];
  /** Combos that could work with a different commander */
  almostIncluded: SpellbookCombo[];
}

/** A card that could be added to the deck to enable new combos */
export interface PotentialComboCard {
  /** Card name */
  name: string;
  /** Number of combos this card would enable */
  comboCount: number;
  /** Image URL for the card */
  imageUrl: string | null;
  /** The combos this card would enable (brief info) */
  enabledCombos: {
    id: string;
    produces: string[];
    spellbookUrl: string;
  }[];
}

/** Combo data attached to a deck */
export interface DeckCombosData {
  /** Number of complete combos found in the deck */
  comboCount: number;
  /** The actual combos present in the deck */
  combos: SpellbookCombo[];
  /** Cards that could be added to enable new combos (within color identity) */
  potentialCards: PotentialComboCard[];
}
