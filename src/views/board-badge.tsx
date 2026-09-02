/**
 * Board provenance badge — a small inline label shown next to an owned card
 * when the user has it only on their sideboard or maybeboard ("considering"),
 * so it's clear the match may not be a card they truly own/run.
 *
 * Mainboard cards render no badge (they're normal owned cards). Shared by the
 * cEDH-match and Build-a-Commander views so the labelling is consistent.
 */

import type { CardBoard } from '../types.js';

const BADGE_LABEL: Record<Exclude<CardBoard, 'mainboard'>, string> = {
  sideboard: 'Sideboard',
  maybeboard: 'Considering',
};

export function BoardBadge({ board }: { board: CardBoard | null }) {
  if (!board || board === 'mainboard') return null;
  const label = BADGE_LABEL[board];
  return (
    <span class={`board-badge board-badge-${board}`} title={`In your ${label.toLowerCase()}`}>
      {label}
    </span>
  );
}
