/**
 * Challenge progress page — 32-slot grid grouped by category.
 */

import { Layout } from './layout.js';
import type {
  ChallengeResponse,
  ColorSlot,
  SlotCategory,
  Color,
} from '../types.js';

interface ChallengePageProps {
  challenge: ChallengeResponse;
  cached: boolean;
}

const CATEGORY_ORDER: SlotCategory[] = [
  'colorless',
  'mono',
  'two-color',
  'three-color',
  'four-color',
  'five-color',
];

function manaSymbolUrl(color: Color): string {
  return `https://svgs.scryfall.io/card-symbols/${color}.svg`;
}

function artCropUrl(setCode: string, collectorNumber: string): string {
  return `https://api.scryfall.com/cards/${setCode}/${collectorNumber}?format=image&version=art_crop`;
}

/**
 * A single roster tile for the 32-deck challenge — styled like a fighting-game
 * character-select slot. Filled slots show the commander art (colour, glowing);
 * empty slots show a "hidden character" placeholder (a big ? silhouette) like
 * an unlocked-fighter slot.
 */
function SlotCard({ slot }: { slot: ColorSlot }) {
  const filled = slot.decks.length > 0;
  const deckCount = slot.decks.length;
  // Any slot with 2+ decks cycles through them one at a time with a periodic
  // fade in / fade out (no more diagonal split for the 2-deck case).
  const isMulti = deckCount > 1;

  // Each deck gets equal time in the fade animation cycle.
  const cycleDuration = deckCount * 4; // 4 seconds per deck

  return (
    <div class={`roster-slot ${filled ? 'filled' : 'empty'}`}>
      {filled && slot.decks.map((deck, index) => {
        const commander = deck.commanders[0];
        const hasArt = commander?.setCode && commander?.collectorNumber;
        if (!hasArt) return null;

        return (
          <div
            class={`slot-art ${isMulti ? 'slot-art-cycle' : ''}`}
            style={[
              `background-image: url('${artCropUrl(commander.setCode, commander.collectorNumber)}')`,
              isMulti ? `animation-duration: ${cycleDuration}s` : '',
              isMulti ? `animation-delay: ${index * 4}s` : '',
              isMulti && index > 0 ? 'opacity: 0' : '',
            ].filter(Boolean).join('; ')}
          />
        );
      })}

      {/* Hidden-character placeholder for empty color identities. */}
      {!filled && (
        <div class="roster-slot-locked" aria-hidden="true">
          <span class="roster-locked-mark">?</span>
        </div>
      )}

      {filled && (() => {
        const totalCombos = slot.decks.reduce((sum, d) => sum + (d.comboCount ?? 0), 0);
        return totalCombos > 0 ? (
          <span class="combo-count-badge">♾️ {totalCombos}</span>
        ) : null;
      })()}

      <div class="roster-slot-content">
        <div class="slot-colors">
          {slot.colors.map((color) => (
            <img src={manaSymbolUrl(color)} alt={color} width="16" height="16" />
          ))}
        </div>
        <div class="roster-slot-name">{slot.name}</div>

        {filled ? (
          <div class={isMulti ? 'deck-info-carousel' : ''}>
            {slot.decks.map((deck, index) => (
              <div
                class={`deck-info ${isMulti ? 'deck-info-cycle' : ''}`}
                style={isMulti ? [
                  `animation-duration: ${cycleDuration}s`,
                  `animation-delay: ${index * 4}s`,
                  index > 0 ? 'opacity: 0' : '',
                ].filter(Boolean).join('; ') : ''}
              >
                <div class="commander-name">
                  {deck.commanderNames.join(' & ')}
                </div>
                {deck.deckId && (
                  <a
                    href={`/deck/${deck.deckId}`}
                    class="slot-link"
                    aria-label={`View details for ${deck.deckName}`}
                  >
                    View →
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div class="empty-label">Locked</div>
        )}
      </div>
    </div>
  );
}

export function ChallengePage({ challenge, cached }: ChallengePageProps) {
  const { username, progress, summary } = challenge;

  // Order all 32 slots by category (colorless → five-color) into one flat
  // roster, so they render as a continuous fighting-select grid (8 per row).
  const orderedSlots: ColorSlot[] = CATEGORY_ORDER.flatMap((category) =>
    progress.slots.filter((s) => s.category === category),
  );

  return (
    <Layout title={`${username} — The Command Crypt`}>
      <div class="progress-section">
        <h1>{username}'s Challenge</h1>
        <div class="progress-bar-container">
          <div
            class="progress-bar"
            style={`width: ${summary.percentComplete}%`}
            role="progressbar"
            aria-valuenow={summary.percentComplete}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Challenge progress: ${summary.filledCount} of ${summary.totalSlots} slots filled`}
          />
        </div>
        <div class="progress-text">
          {summary.filledCount} / {summary.totalSlots} slots filled ({summary.percentComplete}%)
          {cached && <span style="margin-left: 1rem; color: var(--text-muted); font-size: 0.8rem;">(cached)</span>}
        </div>
      </div>

      {/* One continuous roster: 32 slots, 8 per row (4 rows). */}
      <div class="roster-grid roster-grid-challenge">
        {orderedSlots.map((slot) => (
          <SlotCard slot={slot} />
        ))}
      </div>

      {progress.skippedDecks.length > 0 && (
        <div class="category-section" style="margin-top: 3rem;">
          <h2 class="category-header">Skipped Decks</h2>
          <ul style="list-style: none; padding: 0;">
            {progress.skippedDecks.map((deck) => (
              <li style="color: #888; padding: 0.25rem 0;">
                <span style="color: #ccc;">{deck.deckName}</span> — {deck.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style="text-align: center; margin-top: 2rem;">
        <form action={`/refresh/${username}`} method="post" style="display: inline;">
          <button type="submit" style="background: #3a3a5a; color: #ccc; border: 1px solid #5a5a7a; padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer; font-size: 0.85rem;">
            🔄 Force Refresh
          </button>
        </form>
      </div>
    </Layout>
  );
}
