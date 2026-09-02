/**
 * "Build a cEDH Deck" page.
 *
 * Shows, for a given Moxfield user:
 *   - a summary of the decks that make up their "collection"
 *   - the single closest matching cEDH deck (hero card)
 *   - the top 5 matches ranked by how much of each they already own
 *   - the missing cards for each match (a buy list)
 */

import { Layout } from './layout.js';
import { BoardBadge } from './board-badge.js';
import type {
  CedhMatchResponse,
  CedhMatch,
  ReferenceCardGroup,
  UserDeckSummary,
  Color,
} from '../types.js';

interface CedhMatchPageProps {
  result: CedhMatchResponse;
  cached: boolean;
}

/** Formats a CAD amount, or a dash when unknown. */
function cad(amount: number | null): string {
  return amount == null ? '—' : `CA$${amount.toFixed(2)}`;
}

/** cEDH DB color letters are lowercase wubrg; Scryfall symbols are uppercase. */
function colorSymbolUrl(color: string): string {
  return `https://svgs.scryfall.io/card-symbols/${color.toUpperCase()}.svg`;
}

function manaSymbolUrl(color: Color): string {
  return `https://svgs.scryfall.io/card-symbols/${color}.svg`;
}

function artCropUrl(setCode: string, collectorNumber: string): string {
  return `https://api.scryfall.com/cards/${setCode}/${collectorNumber}?format=image&version=art_crop`;
}

function pct(fraction: number): number {
  return Math.round(fraction * 100);
}

// ─── User's collection decks ─────────────────────────────────────────────────

function UserDeckCard({ deck }: { deck: UserDeckSummary }) {
  const commander = deck.commanders[0];
  const hasArt = commander?.setCode && commander?.collectorNumber;

  return (
    <a
      href={`/deck/${deck.publicId}`}
      class="cedh-userdeck"
      aria-label={`View details for ${deck.name}`}
    >
      {hasArt && (
        <div
          class="cedh-userdeck-art"
          style={`background-image: url('${artCropUrl(commander.setCode, commander.collectorNumber)}')`}
        />
      )}
      <div class="cedh-userdeck-body">
        <div class="cedh-userdeck-colors">
          {deck.colors.length === 0 ? (
            <img src={colorSymbolUrl('C')} alt="Colorless" width="16" height="16" />
          ) : (
            deck.colors.map((c) => (
              <img src={manaSymbolUrl(c)} alt={c} width="16" height="16" />
            ))
          )}
        </div>
        <div class="cedh-userdeck-name">{deck.name}</div>
        <div class="cedh-userdeck-cmdr">
          {deck.commanders.map((c) => c.name).join(' & ') || 'Unknown commander'}
        </div>
        <div class="cedh-userdeck-count">{deck.cardCount} cards</div>
      </div>
    </a>
  );
}

/** Renders a mana cost string like "{1}{G}{W}" into small symbol images. */
function ManaCost({ cost }: { cost: string }) {
  if (!cost) return null;
  const symbols = cost.match(/\{[^}]+\}/g) ?? [];
  if (symbols.length === 0) return null;
  return (
    <span class="cedh-mana-cost">
      {symbols.map((sym) => {
        // Scryfall symbol filenames strip the braces and the "/" separator:
        // {B} → B, {B/P} → BP (Phyrexian), {W/U} → WU (hybrid), {2/W} → 2W.
        const code = sym.replace(/[{}]/g, '').replace(/\//g, '');
        return (
          <img
            src={`https://svgs.scryfall.io/card-symbols/${code}.svg`}
            alt={sym}
            width="13"
            height="13"
          />
        );
      })}
    </span>
  );
}

// ─── One card-type group within a match's decklist ───────────────────────────

function CardGroup({ group }: { group: ReferenceCardGroup }) {
  return (
    <div class="cedh-group">
      <div class="cedh-group-header">
        <span class="cedh-group-type">{group.type}</span>
        <span class="cedh-group-counts">
          {group.missingCount > 0 && (
            <span class="cedh-group-missing">{group.missingCount} missing</span>
          )}
          {group.missingCount > 0 && group.ownedCount > 0 && ' · '}
          {group.ownedCount > 0 && (
            <span class="cedh-group-owned">{group.ownedCount} owned</span>
          )}
        </span>
      </div>
      <ul class="cedh-card-list">
        {group.cards.map((card) => (
          <li class={`cedh-card-row ${card.owned ? 'is-owned' : 'is-missing'}`}>
            <span class="cedh-card-name">
              {card.owned && <span class="cedh-card-check" aria-hidden="true">✓ </span>}
              {card.scryfallId ? (
                <a
                  href={`https://scryfall.com/card/${card.scryfallId}`}
                  target="_blank"
                  rel="noopener"
                  class="cedh-card-link"
                >
                  {card.name}
                </a>
              ) : (
                card.name
              )}
              <ManaCost cost={card.manaCost} />
              {card.owned && <BoardBadge board={card.board} />}
            </span>
            <span class="cedh-card-price">{cad(card.cad)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── A single reference-deck match ───────────────────────────────────────────

function MatchCard({ match, rank }: { match: CedhMatch; rank: number }) {
  const { deck } = match;
  const percent = pct(match.ownedFraction);
  const commanderImage = deck.commanderImages.find((img) => !!img) ?? null;
  const isHero = rank === 1;

  return (
    <div class={`cedh-match ${isHero ? 'cedh-match-hero' : ''}`}>
      <div class="cedh-match-rank">#{rank}</div>

      {commanderImage && (
        <img
          class="cedh-match-img"
          src={commanderImage}
          alt={deck.commanders.join(' & ')}
          loading="lazy"
        />
      )}

      <div class="cedh-match-body">
        <div class="cedh-match-colors">
          {deck.colors.length === 0 ? (
            <img src={colorSymbolUrl('C')} alt="Colorless" width="18" height="18" />
          ) : (
            deck.colors.map((c) => (
              <img src={colorSymbolUrl(c)} alt={c} width="18" height="18" />
            ))
          )}
        </div>

        <h3 class="cedh-match-title">{deck.title}</h3>
        <div class="cedh-match-subtitle">
          {deck.commanders.join(' & ')}
          {deck.deckTitle && deck.deckTitle !== deck.title ? ` · ${deck.deckTitle}` : ''}
        </div>

        <div class="cedh-match-bar-container" role="progressbar"
          aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}
          aria-label={`You own ${percent}% of this deck`}>
          <div class="cedh-match-bar" style={`width: ${percent}%`} />
        </div>
        <div class="cedh-match-stats">
          <strong>{percent}%</strong> owned
          {' · '}
          {match.ownedCount}/{match.totalCount} cards
          {' · '}
          <span class="cedh-match-missing-count">{match.missingCount} to buy</span>
          {match.missingCount > 0 && (
            <>
              {' · '}
              <span class="cedh-match-price">
                ≈ {cad(match.missingTotalCad)}
              </span>
            </>
          )}
        </div>

        <div class="cedh-match-actions">
          <a href={deck.moxfieldUrl} target="_blank" rel="noopener" class="cedh-match-link">
            View decklist on Moxfield →
          </a>
        </div>

        <details class="cedh-missing">
          <summary>
            Full decklist — {match.ownedCount} owned, {match.missingCount} to buy
            {match.missingCount > 0 && <> ({cad(match.missingTotalCad)})</>}
            {match.missingUnpricedCount > 0 && (
              <span class="cedh-missing-note">
                {' '}· {match.missingUnpricedCount} without a price
              </span>
            )}
          </summary>

          <div class="cedh-legend">
            <span class="cedh-legend-item is-missing">■ Missing (buy)</span>
            <span class="cedh-legend-item is-owned">✓ Owned</span>
          </div>

          <div class="cedh-groups">
            {match.cardGroups.map((group) => (
              <CardGroup group={group} />
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function CedhMatchPage({ result, cached }: CedhMatchPageProps) {
  const { username, userDecks, collectionSize, matches, fx } = result;
  const hasMatches = matches.length > 0;

  const fxDate = fx.fetchedAt ? new Date(fx.fetchedAt).toISOString().slice(0, 10) : '';

  return (
    <Layout title={`${username} — Build a cEDH Deck`}>
      <div class="progress-section">
        <h1>{username}'s Closest cEDH Decks</h1>
        <p class="progress-text">
          Built from <strong>{userDecks.length}</strong> commander deck
          {userDecks.length === 1 ? '' : 's'} ({collectionSize} distinct cards).
          Ranked by how much of each competitive deck you already own, with the
          cost of the cards you're missing shown in CAD.
          {cached && (
            <span style="margin-left: 1rem; color: var(--text-muted); font-size: 0.8rem;">
              (cached)
            </span>
          )}
        </p>
        <p class="cedh-fx-note">
          Prices are for the printing used in each reference decklist (via Moxfield),
          converted at <strong>1 USD ≈ CA${fx.usdToCad.toFixed(4)}</strong>
          {fx.live
            ? <> (rate as of {fxDate}, cached daily)</>
            : <> (live rate unavailable — using an approximate fallback)</>}.
        </p>
      </div>

      {!hasMatches ? (
        <div class="cedh-empty glass-card" style="padding: 2rem; text-align: center;">
          <p>
            No cEDH matches could be computed. This usually means the reference
            corpus hasn't been generated yet (run <code>npm run build:cedh</code>)
            or the user has no public commander decks.
          </p>
        </div>
      ) : (
        <div class="cedh-matches">
          {matches.map((match, i) => (
            <MatchCard match={match} rank={i + 1} />
          ))}
        </div>
      )}

      {userDecks.length > 0 && (
        <div class="cedh-collection-section">
          <h2 class="category-header">Your Decks Used for Matching</h2>
          <div class="cedh-userdecks-grid">
            {userDecks.map((deck) => (
              <UserDeckCard deck={deck} />
            ))}
          </div>
        </div>
      )}

      <div style="text-align: center; margin-top: 2.5rem;">
        <form action={`/cedh/refresh/${encodeURIComponent(username)}`} method="post" style="display: inline;">
          <button type="submit" style="background: #3a3a5a; color: #ccc; border: 1px solid #5a5a7a; padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer; font-size: 0.85rem;">
            🔄 Force Refresh
          </button>
        </form>
      </div>
    </Layout>
  );
}
