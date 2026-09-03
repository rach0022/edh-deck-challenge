/**
 * "Build a Commander" results page.
 *
 * For a Moxfield user and a commander selection (Commander + optional Partner /
 * Companion), shows EDHREC's recommended cards grouped the way EDHREC groups
 * them — one section per EDHREC panel (New Cards, High Synergy Cards, Top
 * Cards, Game Changers, Creatures, Instants, …). Within each section:
 *
 *   • Owned cards are shown as full card images, sub-grouped by card type,
 *     each labelled with the user's deck(s) that contain it.
 *   • To-Buy cards are tucked into a collapsible <details> and listed as text
 *     Scryfall links, sub-grouped by card type with CAD prices — the same
 *     dropdown style as the cEDH match page's decklist.
 *
 * Modeled on `views/cedh-match.tsx` for Layout usage, CAD formatting, card
 * links, and the refresh form.
 */

import { Layout } from './layout.js';
import { BoardBadge } from './board-badge.js';
import type {
  BuildCommanderResponse,
  BuildSection,
  BuildTypeGroup,
  BuildCommanderCard,
  CommanderImage,
} from '../types.js';

interface BuildPageProps {
  result: BuildCommanderResponse;
  cached: boolean;
}

/** Formats a CAD amount, or a dash when unknown. */
function cad(amount: number | null): string {
  return amount == null ? '—' : `CA$${amount.toFixed(2)}`;
}

/** Scryfall card page URL for a card id. */
function scryfallUrl(id: string): string {
  return `https://scryfall.com/card/${id}`;
}

/** Header label shown under each commander/partner/companion card image. */
const ROLE_LABEL: Record<CommanderImage['role'], string> = {
  commander: 'Commander',
  partner: 'Partner',
  companion: 'Companion',
};

/**
 * Reconstructs the selection query string used by the results URL so the
 * refresh form posts to `/build/refresh/<username>?commander=…&partner=…&companion=…`.
 */
function selectionQuery(result: BuildCommanderResponse): string {
  const params = new URLSearchParams();
  params.set('commander', result.selection.commander);
  if (result.selection.partner) params.set('partner', result.selection.partner);
  if (result.selection.companion) params.set('companion', result.selection.companion);
  return params.toString();
}

// ─── Owned card: full image + source-deck caption ────────────────────────────

function OwnedCard({ card }: { card: BuildCommanderCard }) {
  const deckLabel =
    card.sourceDecks.length === 0
      ? ''
      : card.sourceDecks.length === 1
        ? card.sourceDecks[0]
        : `${card.sourceDecks[0]} +${card.sourceDecks.length - 1} more`;

  const inner = (
    <>
      <div class="build-owned-imgwrap">
        {card.imageUrl ? (
          <img
            class="build-owned-img"
            src={card.imageUrl}
            alt={card.name}
            loading="lazy"
          />
        ) : (
          <div class="build-owned-noimg">{card.name}</div>
        )}
        {card.board && card.board !== 'mainboard' && (
          <span class="build-owned-badge">
            <BoardBadge board={card.board} />
          </span>
        )}
      </div>
      <div class="build-owned-caption">
        <span class="build-owned-name">{card.name}</span>
        {deckLabel && (
          <span
            class="build-owned-decks"
            title={card.sourceDecks.join(', ')}
          >
            🗂 {deckLabel}
          </span>
        )}
      </div>
    </>
  );

  return (
    <div class="build-owned-card">
      {card.scryfallId ? (
        <a
          href={scryfallUrl(card.scryfallId)}
          target="_blank"
          rel="noopener"
          class="build-owned-link"
        >
          {inner}
        </a>
      ) : (
        inner
      )}
    </div>
  );
}

// ─── Owned type group: a labelled gallery of owned card images ───────────────

function OwnedTypeGroup({ group }: { group: BuildTypeGroup }) {
  return (
    <div class="build-owned-group">
      <h4 class="build-subtype-header">
        {group.type}
        <span class="build-subtype-count">{group.cards.length}</span>
      </h4>
      <div class="build-owned-grid">
        {group.cards.map((card) => (
          <OwnedCard card={card} />
        ))}
      </div>
    </div>
  );
}

// ─── To-buy type group: a text card list (cEDH decklist style) ───────────────

function ToBuyTypeGroup({ group }: { group: BuildTypeGroup }) {
  return (
    <div class="build-tobuy-group">
      <div class="build-tobuy-group-header">
        <span class="build-tobuy-group-type">{group.type}</span>
        <span class="build-tobuy-group-count">{group.cards.length}</span>
      </div>
      <ul class="build-tobuy-list">
        {group.cards.map((card) => (
          <li class="build-tobuy-row">
            <span class="build-tobuy-name">
              {card.scryfallId ? (
                <a
                  href={scryfallUrl(card.scryfallId)}
                  target="_blank"
                  rel="noopener"
                  class="build-tobuy-link"
                >
                  {card.name}
                </a>
              ) : (
                card.name
              )}
            </span>
            <span class="build-tobuy-price">{cad(card.cad)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── One EDHREC section ──────────────────────────────────────────────────────

function Section({ section }: { section: BuildSection }) {
  return (
    <section class="build-section">
      <h2 class="build-section-header">
        {section.name}
        <span class="build-section-meta">
          {section.ownedCount} owned
          {section.consideringCount > 0 && (
            <> · {section.consideringCount} considering</>
          )}{' '}
          · {section.toBuyCount} to buy
        </span>
      </h2>

      {/* Owned cards — shown as images, grouped by card type. */}
      {section.ownedCount > 0 ? (
        <div class="build-owned-groups">
          {section.ownedGroups.map((group) => (
            <OwnedTypeGroup group={group} />
          ))}
        </div>
      ) : (
        <p class="build-section-empty">
          You don't own any of the recommended cards in this section yet.
        </p>
      )}

      {/* Considering cards — in the user's sideboard/maybeboard, not counted as
          owned. Collapsible image gallery; each card badged. */}
      {section.consideringCount > 0 && (
        <details class="build-considering">
          <summary>
            Show {section.consideringCount} card
            {section.consideringCount === 1 ? '' : 's'} you're considering
            (sideboard / maybeboard)
          </summary>
          <div class="build-owned-groups">
            {section.consideringGroups.map((group) => (
              <OwnedTypeGroup group={group} />
            ))}
          </div>
        </details>
      )}

      {/* To-buy cards — collapsible text list, grouped by card type. */}
      {section.toBuyCount > 0 && (
        <details class="build-tobuy">
          <summary>
            Show {section.toBuyCount} card{section.toBuyCount === 1 ? '' : 's'} to
            buy
            {section.toBuyTotalCad > 0 && <> ({cad(section.toBuyTotalCad)})</>}
          </summary>
          <div class="build-tobuy-groups">
            {section.toBuyGroups.map((group) => (
              <ToBuyTypeGroup group={group} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function BuildPage({ result, cached }: BuildPageProps) {
  const {
    username,
    selection,
    sections,
    commanderImages,
    edhrecRank,
    edhrecNumDecks,
    ownedCount,
    consideringCount,
    toBuyCount,
    buyListTotalCad,
    deckCount,
    fx,
    noDecks,
  } = result;

  const fxDate = fx.fetchedAt ? new Date(fx.fetchedAt).toISOString().slice(0, 10) : '';

  const selectionNames = [selection.commander];
  if (selection.partner) selectionNames.push(selection.partner);

  return (
    <Layout title={`${username} — Build a Commander`}>
      <div class="progress-section">
        <h1>Build {selectionNames.join(' & ')}</h1>
        {commanderImages.length > 0 && (
          <div class="build-commander-art">
            {commanderImages.map((cmd: CommanderImage) => (
              <figure class={`build-commander-slot build-commander-${cmd.role}`}>
                {cmd.imageUrl ? (
                  cmd.scryfallId ? (
                    <a
                      href={`https://scryfall.com/card/${cmd.scryfallId}`}
                      target="_blank"
                      rel="noopener"
                      class="build-commander-art-link"
                      aria-label={cmd.name}
                    >
                      <img src={cmd.imageUrl} alt={cmd.name} loading="lazy" />
                    </a>
                  ) : (
                    <img src={cmd.imageUrl} alt={cmd.name} loading="lazy" />
                  )
                ) : (
                  <div class="build-commander-noimg">{cmd.name}</div>
                )}
                <figcaption class="build-commander-role">
                  {ROLE_LABEL[cmd.role]}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        <p class="build-selection">
          <strong>{selection.commander}</strong>
          {selection.partner && (
            <>
              {' '}
              + partner <strong>{selection.partner}</strong>
            </>
          )}
          {selection.companion && (
            <>
              {' '}
              · companion <strong>{selection.companion}</strong>
            </>
          )}
        </p>
                {edhrecRank != null && (
          <p class="build-edhrec-rank">
            EDHREC rank <strong>#{edhrecRank.toLocaleString('en-US')}</strong>
            {edhrecNumDecks != null && (
              <> · {edhrecNumDecks.toLocaleString('en-US')} decks</>
            )}
          </p>
        )}
        <p class="progress-text">
          EDHREC's recommendations for this commander, grouped by section. You
          own <strong>{ownedCount}</strong> of the recommended cards
          {consideringCount > 0 && (
            <>
              {' '}
              (with <strong>{consideringCount}</strong> more in your sideboard /
              maybeboard)
            </>
          )}{' '}
          and still need <strong>{toBuyCount}</strong>, built from{' '}
          <strong>{deckCount}</strong> commander deck
          {deckCount === 1 ? '' : 's'}.
          {cached && (
            <span style="margin-left: 1rem; color: var(--text-muted); font-size: 0.8rem;">
              (cached)
            </span>
          )}
        </p>
        <p class="cedh-fx-note">
          Buy-list prices are converted at{' '}
          <strong>1 USD ≈ CA${fx.usdToCad.toFixed(4)}</strong>
          {fx.live ? (
            <> (rate as of {fxDate}, cached daily)</>
          ) : (
            <> (live rate unavailable — using an approximate fallback)</>
          )}
          .
        </p>
      </div>

      {noDecks && (
        <div
          class="build-nodecks glass-card"
          style="padding: 1.25rem; margin-bottom: 1.5rem;"
        >
          <p>
            <strong>{username}</strong> has no commander decks on Moxfield, so
            there's no collection to compare against. Your owned collection is
            built from the cards across your decks — with none, every
            recommended card below is on the to-buy list.
          </p>
        </div>
      )}

      <div class="build-summary">
        <div class="build-summary-stat">
          <span class="build-summary-num">{ownedCount}</span>
          <span class="build-summary-label">owned</span>
        </div>
        {consideringCount > 0 && (
          <div class="build-summary-stat">
            <span class="build-summary-num">{consideringCount}</span>
            <span class="build-summary-label">considering</span>
          </div>
        )}
        <div class="build-summary-stat">
          <span class="build-summary-num">{toBuyCount}</span>
          <span class="build-summary-label">to buy</span>
        </div>
        <div class="build-summary-stat">
          <span class="build-summary-num">{deckCount}</span>
          <span class="build-summary-label">
            deck{deckCount === 1 ? '' : 's'} scanned
          </span>
        </div>
        <div class="build-summary-stat">
          <span class="build-summary-num">{cad(buyListTotalCad)}</span>
          <span class="build-summary-label">buy-list total</span>
        </div>
      </div>

      {sections.length === 0 ? (
        <div class="glass-card" style="padding: 2rem; text-align: center;">
          <p>
            No recommendations were found for this commander. EDHREC may not have
            a page for it yet.
          </p>
        </div>
      ) : (
        <div class="build-sections">
          {sections.map((section) => (
            <Section section={section} />
          ))}
        </div>
      )}

      <div style="text-align: center; margin-top: 2.5rem;">
        <form
          action={`/build/refresh/${encodeURIComponent(username)}?${selectionQuery(result)}`}
          method="post"
          style="display: inline;"
        >
          <button
            type="submit"
            style="background: #3a3a5a; color: #ccc; border: 1px solid #5a5a7a; padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer; font-size: 0.85rem;"
          >
            🔄 Force Refresh
          </button>
        </form>
      </div>
    </Layout>
  );
}
