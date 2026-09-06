/**
 * Deck-selection ("character select") page for the Build-a-Commander flow.
 *
 * Modelled on a Super Smash Bros. character-select screen: the user's commander
 * decks form a dense, gapless roster mosaic of square portrait tiles — each
 * showing the deck's commander art (art_crop, so it reads as a character
 * portrait rather than a full card). Selected fighters glow in full colour with
 * a bright selection-cursor border; deselected ones dim to greyscale. The user
 * picks which decks seed the owned collection for the build, then locks in.
 *
 * The form is a GET to `/build/loading/:username`, carrying the commander
 * selection (commander/partner/companion) forward as hidden inputs plus one
 * `deck=<publicId>` param per selected deck. Selection state lives entirely in
 * the checkboxes; the inline script only mirrors checked-state onto the tile
 * for the visual treatment and keeps the running count + lock-in label in sync.
 */

import { Layout } from './layout.js';
import type { CommanderSelection, SelectableDeck } from '../types.js';

interface DeckSelectPageProps {
  username: string;
  selection: CommanderSelection;
  decks: SelectableDeck[];
}

export function DeckSelectPage({ username, selection, decks }: DeckSelectPageProps) {
  const title = `Select Decks — ${username} — Build a Commander`;
  const commanderLabel = [selection.commander, selection.partner]
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
    .join(' + ');

  return (
    <Layout title={title}>
      <div class="cselect">
        <div class="cselect-header">
          <h1 class="cselect-title">Choose Your Fighters</h1>
          <p class="cselect-subtitle">
            Building <strong>{commanderLabel}</strong> for{' '}
            <strong>{username}</strong>. Pick which commander decks seed your
            collection — only cards from lit-up decks count as “owned”.
          </p>
        </div>

        {decks.length === 0 ? (
          <div class="cselect-empty">
            <p>
              No commander decks were found for <strong>{username}</strong>. You
              can still build — every recommended card will be on the buy list.
            </p>
            <form action={`/build/loading/${encodeURIComponent(username)}`} method="get">
              <SelectionHiddenInputs selection={selection} />
              <input type="hidden" name="deck" value="" />
              <button type="submit" class="cselect-go">
                Build with an empty collection →
              </button>
            </form>
          </div>
        ) : (
          <form
            id="deck-select-form"
            action={`/build/loading/${encodeURIComponent(username)}`}
            method="get"
          >
            <SelectionHiddenInputs selection={selection} />

            <div class="cselect-toolbar">
              <span class="cselect-count" id="deck-select-count" aria-live="polite">
                {decks.length} / {decks.length} ready
              </span>
              <div class="cselect-actions">
                <button type="button" class="cselect-link" id="select-all-btn">
                  Select all
                </button>
                <button type="button" class="cselect-link" id="select-none-btn">
                  Clear
                </button>
              </div>
            </div>

            {/* The roster: a gapless mosaic of square portrait tiles. */}
            <div class="cselect-roster" role="group" aria-label="Your commander decks">
              {decks.map((deck) => (
                <FighterTile deck={deck} />
              ))}
            </div>

            <div class="cselect-footer">
              <a href="/" class="back-link">
                ← Back to home
              </a>
              <button type="submit" class="cselect-go" id="deck-select-submit">
                Fight! Build from 1 deck →
              </button>
            </div>
          </form>
        )}
      </div>

      <script dangerouslySetInnerHTML={{ __html: deckSelectScript(decks.length) }} />
    </Layout>
  );
}

/** Hidden inputs that carry the commander selection through the form submit. */
function SelectionHiddenInputs({ selection }: { selection: CommanderSelection }) {
  return (
    <>
      <input type="hidden" name="commander" value={selection.commander} />
      {selection.partner ? (
        <input type="hidden" name="partner" value={selection.partner} />
      ) : null}
      {selection.companion ? (
        <input type="hidden" name="companion" value={selection.companion} />
      ) : null}
    </>
  );
}

/** A single roster tile — a selectable "fighter" (one of the user's decks). */
function FighterTile({ deck }: { deck: SelectableDeck }) {
  const primary = deck.commanders[0];
  // Prefer the frameless art_crop so the tile reads as a character portrait;
  // fall back to the full card image, then to a placeholder glyph.
  const art = primary?.artCrop ?? primary?.imageUrl ?? null;
  const commanderNames =
    deck.commanders.map((c) => c.name).join(' + ') || 'Unknown commander';

  return (
    <label class="fighter selected" data-deck-card title={`${deck.name} — ${commanderNames}`}>
      {/* Checked by default — every fighter is in the fight until dropped. */}
      <input
        type="checkbox"
        name="deck"
        value={deck.publicId}
        checked
        class="fighter-checkbox"
        data-deck-checkbox
      />
      <span
        class="fighter-art"
        style={art ? `background-image: url(${cssUrl(art)});` : ''}
        aria-hidden="true"
      >
        {art ? null : <span class="fighter-noart">🃏</span>}
      </span>
      {/* Soft selection glow overlay drawn on top of the tile. */}
      <span class="fighter-cursor" aria-hidden="true" />
      <span class="fighter-banner">
        <span class="fighter-name">{commanderNames}</span>
        <span class="fighter-deck">{deck.name}</span>
      </span>
    </label>
  );
}

/** Safely embeds a URL inside a CSS url() by escaping quotes/backslashes. */
function cssUrl(url: string): string {
  return `"${url.replace(/["\\]/g, '\\$&')}"`;
}

/**
 * Inline, dependency-free enhancement: mirror each checkbox's checked state
 * onto its tile (for the greyscale/glow treatment), keep the running count and
 * lock-in label in sync, and wire select-all / clear. Works without JS too —
 * the checkboxes and native form submission still carry the selection.
 */
function deckSelectScript(deckCount: number): string {
  return `
(function() {
  var form = document.getElementById('deck-select-form');
  if (!form) return;

  var tiles = Array.prototype.slice.call(
    form.querySelectorAll('[data-deck-card]')
  );
  var countEl = document.getElementById('deck-select-count');
  var submitEl = document.getElementById('deck-select-submit');
  var total = ${JSON.stringify(deckCount)};

  function checkboxOf(tile) {
    return tile.querySelector('[data-deck-checkbox]');
  }

  function syncTile(tile) {
    var cb = checkboxOf(tile);
    if (!cb) return;
    tile.classList.toggle('selected', cb.checked);
  }

  function updateSummary() {
    var selected = tiles.filter(function(tile) {
      var cb = checkboxOf(tile);
      return cb && cb.checked;
    }).length;
    if (countEl) countEl.textContent = selected + ' / ' + total + ' ready';
    if (submitEl) {
      submitEl.textContent = selected > 0
        ? 'Fight! Build from ' + selected + ' deck' + (selected === 1 ? '' : 's') + ' →'
        : 'Build with an empty collection →';
    }
  }

  tiles.forEach(function(tile) {
    var cb = checkboxOf(tile);
    if (!cb) return;
    cb.addEventListener('change', function() {
      syncTile(tile);
      updateSummary();
    });
  });

  var selectAll = document.getElementById('select-all-btn');
  var selectNone = document.getElementById('select-none-btn');
  if (selectAll) selectAll.addEventListener('click', function() {
    tiles.forEach(function(tile) {
      var cb = checkboxOf(tile);
      if (cb) cb.checked = true;
      syncTile(tile);
    });
    updateSummary();
  });
  if (selectNone) selectNone.addEventListener('click', function() {
    tiles.forEach(function(tile) {
      var cb = checkboxOf(tile);
      if (cb) cb.checked = false;
      syncTile(tile);
    });
    updateSummary();
  });

  // Submitting with zero decks must still carry an explicit empty selection
  // (an absent 'deck' param falls back to "all decks"). Append a hidden empty
  // deck input so the server sees an explicit empty pick.
  form.addEventListener('submit', function() {
    var anyChecked = tiles.some(function(tile) {
      var cb = checkboxOf(tile);
      return cb && cb.checked;
    });
    if (!anyChecked) {
      var hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'deck';
      hidden.value = '';
      form.appendChild(hidden);
    }
  });

  tiles.forEach(syncTile);
  updateSummary();
})();
`;
}
