/**
 * Defines the 32 color combination slots for the EDH Deck Challenge.
 */

import type { Color, SlotCategory, ColorCombinationDef } from '../types.js';

export const COLOR_COMBINATIONS: readonly ColorCombinationDef[] = [
  // Colorless (1)
  { key: 'C', name: 'Colorless', colors: [], category: 'colorless' },
  // Mono (5)
  { key: 'W', name: 'Mono White', colors: ['W'], category: 'mono' },
  { key: 'U', name: 'Mono Blue', colors: ['U'], category: 'mono' },
  { key: 'B', name: 'Mono Black', colors: ['B'], category: 'mono' },
  { key: 'R', name: 'Mono Red', colors: ['R'], category: 'mono' },
  { key: 'G', name: 'Mono Green', colors: ['G'], category: 'mono' },
  // Two-color guilds (10)
  { key: 'WU', name: 'Azorius', colors: ['W', 'U'], category: 'two-color' },
  { key: 'WB', name: 'Orzhov', colors: ['W', 'B'], category: 'two-color' },
  { key: 'WR', name: 'Boros', colors: ['W', 'R'], category: 'two-color' },
  { key: 'WG', name: 'Selesnya', colors: ['W', 'G'], category: 'two-color' },
  { key: 'UB', name: 'Dimir', colors: ['U', 'B'], category: 'two-color' },
  { key: 'UR', name: 'Izzet', colors: ['U', 'R'], category: 'two-color' },
  { key: 'UG', name: 'Simic', colors: ['U', 'G'], category: 'two-color' },
  { key: 'BR', name: 'Rakdos', colors: ['B', 'R'], category: 'two-color' },
  { key: 'BG', name: 'Golgari', colors: ['B', 'G'], category: 'two-color' },
  { key: 'RG', name: 'Gruul', colors: ['R', 'G'], category: 'two-color' },
  // Three-color shards/wedges (10)
  { key: 'WUB', name: 'Esper', colors: ['W', 'U', 'B'], category: 'three-color' },
  { key: 'WUR', name: 'Jeskai', colors: ['W', 'U', 'R'], category: 'three-color' },
  { key: 'WUG', name: 'Bant', colors: ['W', 'U', 'G'], category: 'three-color' },
  { key: 'WBR', name: 'Mardu', colors: ['W', 'B', 'R'], category: 'three-color' },
  { key: 'WBG', name: 'Abzan', colors: ['W', 'B', 'G'], category: 'three-color' },
  { key: 'WRG', name: 'Naya', colors: ['W', 'R', 'G'], category: 'three-color' },
  { key: 'UBR', name: 'Grixis', colors: ['U', 'B', 'R'], category: 'three-color' },
  { key: 'UBG', name: 'Sultai', colors: ['U', 'B', 'G'], category: 'three-color' },
  { key: 'URG', name: 'Temur', colors: ['U', 'R', 'G'], category: 'three-color' },
  { key: 'BRG', name: 'Jund', colors: ['B', 'R', 'G'], category: 'three-color' },
  // Four-color (5)
  { key: 'WUBR', name: 'Yore-Tiller', colors: ['W', 'U', 'B', 'R'], category: 'four-color' },
  { key: 'WUBG', name: 'Witch-Maw', colors: ['W', 'U', 'B', 'G'], category: 'four-color' },
  { key: 'WURG', name: 'Ink-Treader', colors: ['W', 'U', 'R', 'G'], category: 'four-color' },
  { key: 'WBRG', name: 'Dune-Brood', colors: ['W', 'B', 'R', 'G'], category: 'four-color' },
  { key: 'UBRG', name: 'Glint-Eye', colors: ['U', 'B', 'R', 'G'], category: 'four-color' },
  // Five-color (1)
  { key: 'WUBRG', name: '5-Color', colors: ['W', 'U', 'B', 'R', 'G'], category: 'five-color' },
] as const;
