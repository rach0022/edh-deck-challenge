/**
 * Color identity resolution for EDH commanders.
 * Computes the combined color identity from one or more commanders,
 * sorts in WUBRG order, and converts to a slot key.
 */

import type { Color, ColorIdentity } from '../types.js';

/** Canonical WUBRG color ordering */
const WUBRG_ORDER: readonly Color[] = ['W', 'U', 'B', 'R', 'G'];

/**
 * Minimal interface for a commander's color identity.
 * Compatible with the full ExtractedCommander interface from commander-extractor.
 */
export interface CommanderColorSource {
  colorIdentity: Color[];
}

/**
 * Resolves the combined color identity from one or more commanders.
 * Computes the union of all commanders' color identities,
 * deduplicates, and sorts in WUBRG order.
 */
export function resolveColorIdentity(commanders: CommanderColorSource[]): ColorIdentity {
  const colorSet = new Set<Color>();

  for (const commander of commanders) {
    for (const color of commander.colorIdentity) {
      colorSet.add(color);
    }
  }

  // Sort in WUBRG order by filtering the canonical order
  return WUBRG_ORDER.filter((c) => colorSet.has(c));
}

/**
 * Converts a color identity array to a string key.
 * An empty identity (colorless) returns "C".
 * Otherwise returns the concatenation of colors in WUBRG order.
 *
 * @example
 * colorIdentityToKey(['W', 'U']) // "WU"
 * colorIdentityToKey([])         // "C"
 */
export function colorIdentityToKey(identity: ColorIdentity): string {
  if (identity.length === 0) {
    return 'C';
  }
  return identity.join('');
}
