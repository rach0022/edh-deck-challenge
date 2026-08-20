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
