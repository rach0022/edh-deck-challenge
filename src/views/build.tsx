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
import { SideNav, type SideNavItem } from './side-nav.js';
import type {
  BuildCommanderResponse,
  BuildSection,
  BuildTypeGroup,
  BuildCommanderCard,
  CommanderImage,
  MyDeckComparison,
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

/** Scryfall mana-symbol SVG URL for a WUBRG color letter. */
function colorSymbolUrl(color: string): string {
  return `https://svgs.scryfall.io/card-symbols/${color.toUpperCase()}.svg`;
}

/** Anchor id for the "Your Deck vs EDHREC" section. */
const MY_DECK_ANCHOR = 'section-your-deck';

/**
 * Turns a section name into a stable, URL-safe anchor id (e.g.
 * "High Synergy Cards" → "section-high-synergy-cards"). Non-alphanumerics
 * collapse to single hyphens so the side-nav links and section ids always
 * agree. An index suffix keeps ids unique if two panels share a name.
 */
function sectionAnchorId(name: string, index: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `section-${slug || 'panel'}-${index}`;
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
    <div
      class={
        card.usedInThisCommanderDeck
          ? 'build-owned-card build-owned-card--in-deck'
          : 'build-owned-card'
      }
      title={
        card.usedInThisCommanderDeck
          ? 'Already in your deck for this commander'
          : undefined
      }
    >
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

function Section({ section, anchorId }: { section: BuildSection; anchorId: string }) {
  return (
    <section class="build-section" id={anchorId}>
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

// ─── "Your Deck vs EDHREC" comparison (Feature 2a) ───────────────────────────

function MyDeckSection({ myDeck }: { myDeck: MyDeckComparison }) {
  const uniquenessPct = Math.round(myDeck.uniqueness * 100);
  const overlapPct =
    myDeck.deckCardCount === 0
      ? 0
      : Math.round((myDeck.edhrecCardsUsed / myDeck.deckCardCount) * 100);
  const deckUrl = myDeck.publicId
    ? `https://www.moxfield.com/decks/${myDeck.publicId}`
    : null;

  return (
    <section class="build-section build-mydeck" id={MY_DECK_ANCHOR}>
      <h2 class="build-section-header">
        Your Deck vs EDHREC
        <span class="build-section-meta">
          {deckUrl ? (
            <a href={deckUrl} target="_blank" rel="noopener" class="build-mydeck-link">
              {myDeck.deckName}
            </a>
          ) : (
            myDeck.deckName
          )}
        </span>
      </h2>
      <p class="build-mydeck-intro">
        You already have a deck for this commander. Here's how your build
        compares to EDHREC's aggregate recommendations.
      </p>
      <div class="build-summary build-mydeck-stats">
        <div class="build-summary-stat">
          <span class="build-summary-num">{uniquenessPct}%</span>
          <span class="build-summary-label">uniqueness</span>
        </div>
        <div class="build-summary-stat">
          <span class="build-summary-num">
            {myDeck.edhrecCardsUsed}
            <span class="build-mydeck-denom">/{myDeck.deckCardCount}</span>
          </span>
          <span class="build-summary-label">EDHREC cards used ({overlapPct}%)</span>
        </div>
        <div class="build-summary-stat">
          <span class="build-summary-num">{myDeck.deckCardCount}</span>
          <span class="build-summary-label">cards in your deck</span>
        </div>
        <div class="build-summary-stat">
          <span class="build-summary-num">{myDeck.edhrecTotal}</span>
          <span class="build-summary-label">EDHREC recommendations</span>
        </div>
      </div>
      <p class="build-mydeck-note">
        Uniqueness is the share of your deck's cards that <em>aren't</em> in
        EDHREC's recommendation set — higher means a spicier, more off-meta
        build. Cards you already run appear with a{' '}
        <span class="build-mydeck-swatch" aria-hidden="true"></span> gold border
        in the sections below.
      </p>
    </section>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function BuildPage({ result, cached }: BuildPageProps) {
  const {
    username,
    selection,
    myDeck,
    sections,
    commanderImages,
    colorIdentity,
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

  // Precompute stable anchor ids so the side nav and the sections agree.
  const sectionAnchors = sections.map((section, i) => sectionAnchorId(section.name, i));

  // Side-nav items: the "Your Deck" comparison (when present) followed by each
  // EDHREC section, each annotated with its owned count.
  const navItems: SideNavItem[] = [];
  if (myDeck) navItems.push({ id: MY_DECK_ANCHOR, label: 'Your Deck vs EDHREC' });
  sections.forEach((section, i) => {
    navItems.push({
      id: sectionAnchors[i],
      label: section.name,
      meta: `${section.ownedCount}/${section.ownedCount + section.consideringCount + section.toBuyCount}`,
    });
  });

  return (
    <Layout title={`${username} — Build a Commander`}>
      <div class="progress-section">
        {colorIdentity && colorIdentity.length > 0 && (
          <div class="build-color-identity" aria-label="Color identity">
            {colorIdentity.map((color) => (
              <img src={colorSymbolUrl(color)} alt={color} width="26" height="26" />
            ))}
          </div>
        )}
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
        <div class="page-with-sidenav">
          <SideNav items={navItems} />
          <div class="page-with-sidenav-content">
            {myDeck && <MyDeckSection myDeck={myDeck} />}
            <div class="build-sections">
              {sections.map((section, i) => (
                <Section section={section} anchorId={sectionAnchors[i]} />
              ))}
            </div>
          </div>
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
