/**
 * Shared TypeScript types for the EDH 32 Deck Challenge Checker.
 * Defines Moxfield API response shapes and core domain types.
 */

// Core color types
export type Color = 'W' | 'U' | 'B' | 'R' | 'G';
export type ColorIdentity = Color[]; // Always sorted in WUBRG order

// Moxfield API response types

/** Paginated deck list response from Moxfield API */
export interface MoxfieldDeckListResponse {
  pageNumber: number;
  pageSize: number;
  totalResults: number;
  totalPages: number;
  data: MoxfieldDeckSummary[];
}

/** Summary of a deck in the user's deck list */
export interface MoxfieldDeckSummary {
  publicId: string;
  name: string;
  format: string;
  publicUrl: string;
  createdAtUtc: string;
  lastUpdatedAtUtc: string;
}

/** Full deck detail including commander zone */
export interface MoxfieldDeckDetail {
  id: string;
  publicId: string;
  name: string;
  format: string;
  commanders: Record<string, MoxfieldCardEntry>;
  mainboard: Record<string, MoxfieldCardEntry>;
}

/** A card entry with quantity information */
export interface MoxfieldCardEntry {
  quantity: number;
  card: MoxfieldCard;
}

/** Card data from Moxfield */
export interface MoxfieldCard {
  name: string;
  color_identity: string[]; // e.g., ["W", "U"]
  set: string; // set code, e.g., "cmr"
  cn: string; // collector number
  image_uris?: {
    normal?: string;
    large?: string;
    art_crop?: string;
  };
  card_faces?: MoxfieldCardFace[];
}

/** Card face data for double-faced cards */
export interface MoxfieldCardFace {
  name: string;
  image_uris?: {
    normal?: string;
    large?: string;
  };
}
