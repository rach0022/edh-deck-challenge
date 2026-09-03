/**
 * EDHREC slug building — pure, side-effect-free logic for turning a
 * commander selection into the slug EDHREC uses in its commander URLs
 * (e.g. `https://json.edhrec.com/commanders/<slug>.json`).
 *
 * EDHREC slugs are lowercase, ASCII, hyphen-separated: the card name is
 * lowercased, apostrophes and other punctuation are stripped, accented
 * characters are folded to their ASCII base, and runs of whitespace/hyphens
 * collapse to a single hyphen. A partnered pairing combines both commanders'
 * slugs in EDHREC's canonical order (the two slugs sorted alphabetically and
 * joined with a hyphen), so the pairing is stable regardless of which
 * commander the user typed first.
 */

import type { CommanderSelection } from '../types.js';

/**
 * Builds the EDHREC slug for a single commander name.
 *
 * The transform is deterministic and normalization-stable: names differing
 * only by case, surrounding/internal whitespace, or punctuation
 * (apostrophes, commas, etc.) produce the same slug.
 *
 * - Double-faced / transform / split names ("A // B") are reduced to their
 *   FRONT face first — EDHREC keys its commander pages off the front face only
 *   (e.g. "Liliana, Heretical Healer // Liliana, Defiant Necromancer" →
 *   "liliana-heretical-healer"). Slugging the full string would 404.
 * - Unicode is normalized (NFKD) and diacritics folded to ASCII.
 * - Everything except letters, digits, and spaces is removed.
 * - Whitespace runs collapse to single hyphens.
 * - Leading/trailing hyphens are trimmed.
 */
export function commanderSlug(name: string): string {
  // Reduce a double-faced / split name to its front face before slugging.
  const frontFace = name.split('//')[0];
  return frontFace
    .normalize('NFKD')
    // strip combining diacritical marks (accents)
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // drop apostrophes and their unicode variants outright so "Urza's"
    // and "Urzas" collapse to the same token rather than splitting.
    .replace(/['\u2018\u2019]/g, '')
    // any remaining non-alphanumeric becomes a separator
    .replace(/[^a-z0-9]+/g, '-')
    // collapse repeated separators and trim edges
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Builds the EDHREC commander slug for a selection.
 *
 * A single commander yields its own slug. When a partner is present, both
 * commanders' slugs are joined in EDHREC's canonical order — the two slugs
 * sorted alphabetically and joined with a hyphen — so the same pair always
 * produces the same slug regardless of input order.
 *
 * The companion is not part of the slug; it constrains the retrieved
 * recommendation set elsewhere (see the EDHREC parser layer).
 */
export function buildEdhrecSlug(selection: CommanderSelection): string {
  const commander = commanderSlug(selection.commander);

  const partner = selection.partner ? commanderSlug(selection.partner) : '';
  if (!partner) {
    return commander;
  }

  return [commander, partner].sort().join('-');
}
