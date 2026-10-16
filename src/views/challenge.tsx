/**
 * Challenge progress page — 32-slot grid grouped by category.
 */

import { Layout } from './layout.js';
import { BRACKET_LABELS } from '../domain/deck-bracket.js';
import type {
  ChallengeResponse,
  ColorSlot,
  DeckSlotEntry,
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

/** Per-bracket accent colour (1 Exhibition → 5 cEDH). Matches the CSS. */
const BRACKET_COLORS: Record<number, string> = {
  1: '#34d399', // green
  2: '#60a5fa', // blue
  3: '#a855f7', // purple
  4: '#fb923c', // orange
  5: '#f87171', // red
};

/**
 * Commander bracket gauge icon: a ring split into 5 segments, the first
 * `bracket` of them filled in the bracket colour (the rest a muted track),
 * with the bracket number in the centre. Pure inline SVG so it stays crisp at
 * the small roster-tile size and needs no external assets. An estimated
 * bracket renders the filled arcs dashed to read as approximate.
 */
function BracketIcon({ bracket, estimated }: { bracket: number; estimated: boolean }) {
  const size = 18;
  const center = size / 2;
  const radius = 6.5;
  const circumference = 2 * Math.PI * radius;
  const segments = 5;
  const gap = 2.2; // px gap between segments along the arc
  const segLen = circumference / segments - gap;
  const color = BRACKET_COLORS[bracket] ?? '#a855f7';

  // Start at 12 o'clock and go clockwise.
  const rotate = `rotate(-90 ${center} ${center})`;

  return (
    <svg
      class="bracket-gauge"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      focusable="false"
    >
      <g transform={rotate}>
        {Array.from({ length: segments }, (_, i) => {
          const filled = i < bracket;
          const offset = -(i * (segLen + gap));
          return (
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={filled ? color : 'rgba(255,255,255,0.18)'}
              stroke-width={2.2}
              stroke-linecap="round"
              stroke-dasharray={`${segLen} ${circumference - segLen}`}
              stroke-dashoffset={offset}
              opacity={filled ? 1 : 0.9}
            />
          );
        })}
      </g>
      <text
        x={center}
        y={center}
        text-anchor="middle"
        dominant-baseline="central"
        class="bracket-gauge-num"
        fill="#fff"
      >
        {estimated ? '~' : ''}{bracket}
      </text>
    </svg>
  );
}

/**
 * The bottom-right badge cluster for a single deck: its combo count (left) and
 * its bracket gauge (right). Rendered once per deck in a slot so that, when a
 * slot holds multiple decks, each deck's badges cross-fade in sync with the
 * art/info carousel (via the `cycle` + `style` animation props) — the badges
 * always match the deck currently on screen rather than showing an aggregate.
 */
function DeckBadges({
  deck,
  cycle,
  style,
}: {
  deck: DeckSlotEntry;
  cycle: boolean;
  style: string;
}) {
  const combos = deck.comboCount ?? 0;
  const hasBracket = typeof deck.bracket === 'number';

  let bracketBadge = null;
  if (hasBracket) {
    const bracket = deck.bracket as number;
    const label = BRACKET_LABELS[bracket] ?? '';
    const estimated = deck.bracketSource !== 'moxfield';
    const title = estimated
      ? `Estimated Commander bracket ${bracket}${label ? ` — ${label}` : ''} (heuristic)`
      : `Commander bracket ${bracket}${label ? ` — ${label}` : ''} (from Moxfield)`;
    bracketBadge = (
      <span
        class={`bracket-badge bracket-badge-${bracket}${estimated ? ' bracket-badge-estimated' : ''}`}
        title={title}
      >
        <BracketIcon bracket={bracket} estimated={estimated} />
      </span>
    );
  }

  return (
    <div class={`roster-badges ${cycle ? 'roster-badges-cycle' : ''}`} style={style}>
      {combos > 0 && (
        <span
          class="combo-count-badge"
          title={`${combos} combo${combos === 1 ? '' : 's'} in this deck`}
        >
          ♾️ {combos}
        </span>
      )}
      {bracketBadge}
    </div>
  );
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

      {/* Bottom-right badge cluster: combo count (left) + bracket gauge
          (right), PER DECK. For a multi-deck slot the clusters cross-fade in
          lock-step with the art/info carousel, so the badges always reflect the
          deck currently on screen (not an aggregate). */}
      {filled && slot.decks.some((d) => (d.comboCount ?? 0) > 0 || typeof d.bracket === 'number') && (
        <div class={isMulti ? 'roster-badges-carousel' : ''}>
          {slot.decks.map((deck, index) => (
            <DeckBadges
              deck={deck}
              cycle={isMulti}
              style={isMulti ? [
                `animation-duration: ${cycleDuration}s`,
                `animation-delay: ${index * 4}s`,
                index > 0 ? 'opacity: 0' : '',
              ].filter(Boolean).join('; ') : ''}
            />
          ))}
        </div>
      )}

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
