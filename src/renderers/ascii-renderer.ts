/**
 * ASCII renderer for the EDH 32 Deck Challenge.
 * Produces a formatted text diagram showing challenge progress
 * grouped by color combination category.
 */

import type { ChallengeProgress, ColorSlot } from '../domain/deck-organizer.js';
import type { SlotCategory } from '../domain/color-combinations.js';

export interface ASCIIRenderOptions {
  maxNameLength: number; // 30
}

const DEFAULT_OPTIONS: ASCIIRenderOptions = {
  maxNameLength: 30,
};

/** Category display configuration */
const CATEGORY_HEADERS: Record<SlotCategory, string> = {
  colorless: 'Colorless',
  mono: 'Mono Color',
  'two-color': 'Two Color',
  'three-color': 'Three Color',
  'four-color': 'Four Color',
  'five-color': 'Five Color',
};

/**
 * Truncates a name to the specified max length, appending "..." if truncated.
 *
 * @param name - The name string to truncate
 * @param maxLength - Maximum allowed length before truncation
 * @returns The original string if within limit, or truncated string with "..." appended
 */
export function truncateName(name: string, maxLength: number): string {
  if (name.length <= maxLength) {
    return name;
  }
  return name.slice(0, maxLength) + '...';
}

/**
 * Formats the slot label with color key suffix for multi-color slots.
 * Mono-color and colorless slots show only the name.
 * Multi-color slots show the name followed by the color key in parentheses.
 */
function formatSlotLabel(slot: ColorSlot): string {
  if (slot.category === 'colorless' || slot.category === 'mono') {
    return slot.name;
  }
  return `${slot.name} (${slot.key})`;
}

/**
 * Renders the full ASCII diagram for the EDH 32 Deck Challenge progress.
 *
 * Groups slots by category, displays filled slots with commander names
 * and empty slots with [empty]. Includes a progress summary line.
 *
 * @param progress - The challenge progress data to render
 * @param options - Optional rendering configuration (defaults to maxNameLength: 30)
 * @returns The formatted ASCII string
 */
export function renderASCII(progress: ChallengeProgress, options?: ASCIIRenderOptions): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines: string[] = [];

  // Header
  lines.push('═══════════════════════════════════════════════════');
  lines.push(`  EDH 32 Deck Challenge - ${progress.username}`);
  lines.push('═══════════════════════════════════════════════════');
  lines.push('');

  // Group slots by category
  const categories: SlotCategory[] = ['colorless', 'mono', 'two-color', 'three-color', 'four-color', 'five-color'];

  for (const category of categories) {
    const categorySlots = progress.slots.filter((slot) => slot.category === category);

    if (categorySlots.length === 0) continue;

    // Category header
    const headerText = CATEGORY_HEADERS[category];
    lines.push(`── ${headerText} ${'─'.repeat(Math.max(0, 46 - headerText.length))}`);

    // Compute label padding for alignment within this category
    const labels = categorySlots.map((slot) => formatSlotLabel(slot));
    const maxLabelLength = Math.max(...labels.map((l) => l.length));

    for (let i = 0; i < categorySlots.length; i++) {
      const slot = categorySlots[i];
      const label = labels[i];
      const padding = ' '.repeat(maxLabelLength - label.length);

      if (slot.decks.length === 0) {
        lines.push(`  ${label}${padding} : [empty]`);
      } else if (slot.decks.length === 1) {
        const commanderDisplay = slot.decks[0].commanderNames
          .map((name) => truncateName(name, opts.maxNameLength))
          .join(' & ');
        lines.push(`  ${label}${padding} : ${commanderDisplay}`);
      } else {
        // Multiple decks in the same slot - each on its own line
        for (let d = 0; d < slot.decks.length; d++) {
          const deck = slot.decks[d];
          const commanderDisplay = deck.commanderNames
            .map((name) => truncateName(name, opts.maxNameLength))
            .join(' & ');
          if (d === 0) {
            lines.push(`  ${label}${padding} : ${commanderDisplay}`);
          } else {
            lines.push(`  ${' '.repeat(maxLabelLength)}   ${commanderDisplay}`);
          }
        }
      }
    }

    lines.push('');
  }

  // Footer with progress summary
  lines.push('═══════════════════════════════════════════════════');
  lines.push(`  Progress: ${progress.filledCount}/32 slots filled`);
  lines.push('═══════════════════════════════════════════════════');

  return lines.join('\n');
}
