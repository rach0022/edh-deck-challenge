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

const CATEGORY_LABELS: Record<SlotCategory, string> = {
  colorless: 'Colorless',
  mono: 'Mono Color',
  'two-color': 'Two Color (Guilds)',
  'three-color': 'Three Color (Shards & Wedges)',
  'four-color': 'Four Color',
  'five-color': 'Five Color',
};

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

function SlotCard({ slot }: { slot: ColorSlot }) {
  const filled = slot.decks.length > 0;
  const deckCount = slot.decks.length;
  const isSplit = deckCount === 2;
  const isMulti = deckCount > 2;

  // For 3+ decks, each deck gets equal time in the fade animation cycle
  const cycleDuration = deckCount * 4; // 4 seconds per deck

  return (
    <div class={`slot-card ${filled ? 'filled' : 'empty'} ${isSplit ? 'slot-card-split' : ''}`}>
      {filled && slot.decks.map((deck, index) => {
        const commander = deck.commanders[0];
        const hasArt = commander?.setCode && commander?.collectorNumber;
        if (!hasArt) return null;

        // Two-deck slots: diagonal split (no animation).
        // The first deck fills the top-left half, the second the bottom-right.
        if (isSplit) {
          return (
            <div
              class={`slot-art slot-art-split slot-art-split-${index === 0 ? 'left' : 'right'}`}
              style={`background-image: url('${artCropUrl(commander.setCode, commander.collectorNumber)}')`}
            />
          );
        }

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

      {isSplit && <span class="slot-split-divider" />}

      {(isSplit || isMulti) && (
        <span class="multi-deck-badge">{deckCount} decks</span>
      )}

      {filled && (() => {
        const totalCombos = slot.decks.reduce((sum, d) => sum + (d.comboCount ?? 0), 0);
        return totalCombos > 0 ? (
          <span class="combo-count-badge">♾️ {totalCombos} combo{totalCombos > 1 ? 's' : ''}</span>
        ) : null;
      })()}

      <div class="slot-content">
        <div class="slot-colors">
          {slot.colors.map((color) => (
            <img src={manaSymbolUrl(color)} alt={color} width="18" height="18" />
          ))}
        </div>
        <div class="slot-name">{slot.name}</div>

        {filled ? (
          <div class={isMulti ? 'deck-info-carousel' : isSplit ? 'deck-info-split' : ''}>
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
                <div class="deck-name">{deck.deckName}</div>
                {deck.deckId && (
                  <a
                    href={`/deck/${deck.deckId}`}
                    class="slot-link"
                    aria-label={`View details for ${deck.deckName}`}
                  >
                    View details →
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div class="empty-label">Empty slot</div>
        )}
      </div>
    </div>
  );
}

export function ChallengePage({ challenge, cached }: ChallengePageProps) {
  const { username, progress, summary } = challenge;

  // Group slots by category
  const slotsByCategory = new Map<SlotCategory, ColorSlot[]>();
  for (const category of CATEGORY_ORDER) {
    slotsByCategory.set(
      category,
      progress.slots.filter((s) => s.category === category)
    );
  }

  return (
    <Layout title={`${username} — EDH 32 Deck Challenge`}>
      <div class="progress-section">
        <h1>{username}'s Challenge</h1>
        <div class="progress-bar-container">
          <div
            class="progress-bar"
            style={`width: ${summary.percentComplete}%`}
          />
        </div>
        <div class="progress-text">
          {summary.filledCount} / {summary.totalSlots} slots filled ({summary.percentComplete}%)
          {cached && <span style="margin-left: 1rem; color: #666; font-size: 0.8rem;">(cached)</span>}
        </div>
      </div>

      {CATEGORY_ORDER.map((category) => {
        const slots = slotsByCategory.get(category)!;
        const categoryCount = summary.categoryCounts[category];
        return (
          <div class="category-section">
            <h2 class="category-header">
              {CATEGORY_LABELS[category]}
              <span class="count"> — {categoryCount.filled}/{categoryCount.total}</span>
            </h2>
            <div class="slots-grid">
              {slots.map((slot) => (
                <SlotCard slot={slot} />
              ))}
            </div>
          </div>
        );
      })}

      {progress.skippedDecks.length > 0 && (
        <div class="category-section">
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
