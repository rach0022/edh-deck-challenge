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
  scryfall_id?: string;
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
  prices?: {
    usd?: number | string | null;
    usd_foil?: number | string | null;
    [key: string]: unknown;
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
  /** Number of complete combos (present in the deck) this card is part of */
  comboCount?: number;
  /** Number of potential/almost-included combos this card is part of */
  potentialComboCount?: number;
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

// ─── cEDH match feature types ───────────────────────────────────────────────

/**
 * A single card in a reference deck's decklist, captured at corpus-build time
 * from Moxfield. Self-contained so it can be used for display, matching, and
 * cross-referencing (via scryfallId) without extra lookups.
 */
export interface DecklistCard {
  /** Display name, e.g. "Faeburrow Elder" */
  name: string;
  /**
   * Cheapest known price for the printing in this decklist, in USD
   * (Moxfield's prices.usd, falling back to usd_foil). null if unavailable.
   */
  value: number | null;
  /**
   * All types parsed from the card's type line, in order — supertypes and
   * types before the em-dash, then subtypes. For DFCs/split cards only the
   * front face is used. e.g. "Legendary Creature — Merfolk Wizard" →
   * ["Legendary", "Creature", "Merfolk", "Wizard"].
   */
  types: string[];
  /** Mana cost string, e.g. "{1}{G}{W}" ("" for lands / no cost). */
  manaCost: string;
  /** Scryfall card id for cross-referencing, or null if unknown. */
  scryfallId: string | null;
}

/**
 * A reference cEDH deck from the cEDH Decklist Database, enriched with the
 * full decklist fetched from Moxfield. This is what the build script produces
 * and what gets stored in the cache as the reference corpus.
 */
export interface CedhReferenceDeck {
  /** Moxfield public id */
  publicId: string;
  /** Archetype title from the database (e.g. "Thrasios Tymna Midrange") */
  title: string;
  /** Individual decklist title from the database (e.g. "Turtleguide") */
  deckTitle: string;
  /** Commander names */
  commanders: string[];
  /** Commander card image URLs (from the database, Scryfall-hosted) */
  commanderImages: (string | null)[];
  /** Color identity letters from the database, e.g. ["b","g","u","w"] */
  colors: string[];
  /** Moxfield URL */
  moxfieldUrl: string;
  /** The full decklist (commanders + mainboard), one entry per distinct card. */
  decklist: DecklistCard[];
}

/** The full reference corpus produced by the build script. */
export interface CedhCorpus {
  /** ISO timestamp of when the corpus was generated */
  generatedAt: string;
  /** Number of reference decks */
  deckCount: number;
  decks: CedhReferenceDeck[];
}

/** A summary of one of the user's own decks, used in the cEDH match page. */
export interface UserDeckSummary {
  publicId: string;
  name: string;
  commanders: CommanderSlotInfo[];
  colors: Color[];
  moxfieldUrl: string;
  cardCount: number;
}

/**
 * A card the user is missing from a reference deck, with pricing.
 * Prices are for the printing used in the reference decklist.
 */
/**
 * A single card in a reference deck, annotated with whether the user owns it,
 * its type category, and its price. Prices are for the printing used in the
 * reference decklist.
 */
export interface ReferenceCard {
  /** Display name */
  name: string;
  /** Front-side type category (Creature, Artifact, ...) */
  type: string;
  /** All parsed types (supertypes, types, subtypes) */
  types: string[];
  /** Mana cost string, e.g. "{1}{G}{W}" */
  manaCost: string;
  /** Scryfall id for cross-referencing, or null */
  scryfallId: string | null;
  /** Whether the user already owns this card (in any of their decks) */
  owned: boolean;
  /** Known price for this printing, in USD. null if unknown. */
  usd: number | null;
  /** Converted price in CAD using the cached FX rate. null if usd is null. */
  cad: number | null;
}

/** Cards of one type category within a match, split into missing/owned. */
export interface ReferenceCardGroup {
  /** Type category name (Creature, Artifact, ...) */
  type: string;
  /** All cards of this type in the reference deck, missing first then owned */
  cards: ReferenceCard[];
  /** Count of cards the user is missing in this group */
  missingCount: number;
  /** Count of cards the user owns in this group */
  ownedCount: number;
}

/** A single scored match between the user's collection and a reference deck. */
export interface CedhMatch {
  deck: CedhReferenceDeck;
  /** Fraction of the reference deck's cards the user already owns (0..1) */
  ownedFraction: number;
  /** Number of reference-deck cards the user owns */
  ownedCount: number;
  /** Total cards in the reference deck */
  totalCount: number;
  /**
   * The full reference decklist, grouped by card type in canonical order.
   * Each card is flagged owned/missing and priced.
   */
  cardGroups: ReferenceCardGroup[];
  /** Sum of known missing-card prices in USD */
  missingTotalUsd: number;
  /** Sum of known missing-card prices in CAD */
  missingTotalCad: number;
  /** Number of missing cards */
  missingCount: number;
  /** Number of missing cards with no known price (excluded from the totals) */
  missingUnpricedCount: number;
}

/** FX conversion metadata shown on the page. */
export interface FxInfo {
  /** USD → CAD multiplier used for all conversions on this response */
  usdToCad: number;
  /** ISO timestamp of when the rate was last fetched */
  fetchedAt: string;
  /** Whether a live rate was available (false = fell back to a default) */
  live: boolean;
}

/** Full response for the "Build a cEDH Deck" page. */
export interface CedhMatchResponse {
  username: string;
  /** The user's legal commander decks used to build their collection */
  userDecks: UserDeckSummary[];
  /** Total distinct cards across all the user's decks */
  collectionSize: number;
  /** Top matches, best first */
  matches: CedhMatch[];
  /** FX rate info used to convert all prices to CAD */
  fx: FxInfo;
}

/** Combo data attached to a deck */
export interface DeckCombosData {
  /** Number of complete combos found in the deck */
  comboCount: number;
  /** The actual combos present in the deck */
  combos: SpellbookCombo[];
  /** Combos missing exactly one card (potential combos) */
  almostIncluded?: SpellbookCombo[];
  /** Cards that could be added to enable new combos (within color identity) */
  potentialCards: PotentialComboCard[];
}

// ─── Build a Commander feature types ────────────────────────────────────────

/** The user's commander choice for a Build-a-Commander request. */
export interface CommanderSelection {
  /** Required primary commander (exact card name). */
  commander: string;
  /** Optional partner commander. */
  partner: string | null;
  /** Optional companion. */
  companion: string | null;
}

/** A single recommended card from EDHREC (raw, pre-ownership). */
export interface EdhrecRecommendation {
  name: string;
  /** The EDHREC panel/section this card came from (e.g. "High Synergy Cards"). */
  category: string;
  inclusion: number | null;
  synergy: number | null;
  scryfallId: string | null;
  setCode: string | null;
  collectorNumber: string | null;
}

/** A recommended card annotated with ownership, source decks, and pricing. */
export interface BuildCommanderCard {
  name: string;
  /** EDHREC category/panel this card came from. */
  category: string;
  /** True when the card is in the user's owned set. */
  owned: boolean;
  /** Deck names containing this card (Source_Decks); empty for to-buy cards. */
  sourceDecks: string[];
  /** Card art (art_crop) for compact display; null if unknown. */
  art: string | null;
  /** Full card image (normal) for the owned-card gallery; null if unknown. */
  imageUrl: string | null;
  /**
   * Canonical card type used to sub-group within a section
   * (Creature/Artifact/Enchantment/Instant/Sorcery/Land/Planeswalker/Battle/Other).
   */
  cardType: string;
  /** Scryfall id for linking, or null. */
  scryfallId: string | null;
  /** Known USD price for the printing, or null. */
  usd: number | null;
  /** CAD-converted price, or null when usd is null. */
  cad: number | null;
}

/** A card-type sub-group within a section (e.g. "Creature" cards). */
export interface BuildTypeGroup {
  /** Canonical card type (matches CARD_TYPE_ORDER). */
  type: string;
  cards: BuildCommanderCard[];
}

/**
 * One EDHREC section (panel) of recommendations, split into the cards the user
 * already owns and the cards they'd need to buy, each sub-grouped by card type.
 */
export interface BuildSection {
  /** EDHREC panel header, e.g. "High Synergy Cards", "Top Cards", "Creatures". */
  name: string;
  /** Owned cards in this section, grouped by card type (shown as images). */
  ownedGroups: BuildTypeGroup[];
  /** To-buy cards in this section, grouped by card type (shown as a card list). */
  toBuyGroups: BuildTypeGroup[];
  /** Count of owned cards in this section. */
  ownedCount: number;
  /** Count of to-buy cards in this section. */
  toBuyCount: number;
  /** Sum of CAD prices of priced to-buy cards in this section. */
  toBuyTotalCad: number;
}

/** A selected commander with its full card image, for the results header. */
export interface CommanderImage {
  name: string;
  /** Full card image (normal); null when Scryfall couldn't resolve it. */
  imageUrl: string | null;
  /** Scryfall id for linking, or null. */
  scryfallId: string | null;
}

/** Full response for the Build-a-Commander results page. */
export interface BuildCommanderResponse {
  username: string;
  selection: CommanderSelection;
  /**
   * Recommendations grouped by EDHREC section (panel), each split into owned /
   * to-buy and sub-grouped by card type. This is what the results page renders.
   */
  sections: BuildSection[];
  /**
   * The selected commander(s) with full card images for the page header — the
   * primary commander first, then the partner when present. Entries whose card
   * image couldn't be resolved from Scryfall are omitted.
   */
  commanderImages: CommanderImage[];
  /** Flat list of owned recommendations (across all sections, de-duplicated). */
  ownedCards: BuildCommanderCard[];
  /** Flat list of to-buy recommendations (across all sections, de-duplicated). */
  toBuyCards: BuildCommanderCard[];
  ownedCount: number;
  toBuyCount: number;
  /** Sum of CAD prices of priced to-buy cards. */
  buyListTotalCad: number;
  /** Number of the user's decks used to build the owned set. */
  deckCount: number;
  /** FX rate info used for CAD conversion. */
  fx: FxInfo;
  /** True when the user had no commander decks (all cards to-buy). */
  noDecks: boolean;
  /**
   * The commander's overall EDHREC popularity rank (1 = most-played commander),
   * or null when EDHREC doesn't provide it.
   */
  edhrecRank: number | null;
  /** How many EDHREC decks run this commander, or null. */
  edhrecNumDecks: number | null;
}
