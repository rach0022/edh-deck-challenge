/**
 * Find-a-Commander page (`GET /find-commander/:deckId`).
 *
 * Lists the legal commanders found inside a deck, ranked by how many of the
 * deck's cards support them per EDHREC (with a combo boost). Each candidate is
 * a collapsible section showing its stats and a text decklist of the deck's
 * supporting cards + their synergy. Mirrors the deck-analysis page's Layout +
 * side-nav + styling conventions.
 */

import { Layout } from './layout.js';
import { SideNav, type SideNavItem } from './side-nav.js';
import type {
  FindCommanderResponse,
  CommanderCandidate,
  CommanderSupportCard,
  Color,
} from '../types.js';

interface FindCommanderPageProps {
  result: FindCommanderResponse;
  cached: boolean;
}

function scryfallUrl(id: string): string {
  return `https://scryfall.com/card/${id}`;
}

function colorSymbolUrl(color: string): string {
  return `https://svgs.scryfall.io/card-symbols/${color.toUpperCase()}.svg`;
}

/** Formats an EDHREC inclusion fraction as a percentage. */
function pct(value: number | null): string {
  if (value == null) return '—';
  return `${Math.round(value * 100)}%`;
}

/** Formats a synergy score as a signed percentage (EDHREC synergy is ~-0.2..0.3). */
function synergyPct(value: number | null): string {
  if (value == null) return '—';
  const p = Math.round(value * 100);
  return `${p > 0 ? '+' : ''}${p}%`;
}

/** Stable, unique-ish anchor id for a candidate section. */
function candidateAnchor(name: string, index: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `commander-${index}-${slug}`.slice(0, 60);
}

function CardName({ name, scryfallId }: { name: string; scryfallId: string | null }) {
  if (!scryfallId) return <>{name}</>;
  return (
    <a href={scryfallUrl(scryfallId)} target="_blank" rel="noopener" class="analyze-card-link">
      {name}
    </a>
  );
}

function SupportRow({ card }: { card: CommanderSupportCard }) {
  return (
    <li class="analyze-row">
      <span class="analyze-row-name">
        <CardName name={card.name} scryfallId={card.scryfallId} />
        <span class="analyze-row-tag">{card.cardType}</span>
      </span>
      <span class="analyze-row-metric">
        {synergyPct(card.synergy)} syn · {pct(card.inclusion)} incl
      </span>
    </li>
  );
}

function CandidateSection({
  candidate,
  anchor,
  rank,
}: {
  candidate: CommanderCandidate;
  anchor: string;
  rank: number;
}) {
  const {
    name,
    scryfallId,
    imageUrl,
    colorIdentity,
    edhrecRank,
    edhrecNumDecks,
    supportCount,
    inCombo,
    comboFeatures,
    noEdhrecData,
    supportCards,
  } = candidate;

  return (
    <section class="build-section find-commander-candidate" id={anchor}>
      <details class="collapsible-section" open={rank === 1}>
        <summary class="collapsible-summary">
          <span class="find-commander-rank">#{rank}</span>
          <span class="collapsible-title">{name}</span>
          {inCombo && (
            <span class="find-commander-combo-flag" title={comboFeatures.join(', ')}>
              ♾️ combo
            </span>
          )}
          <span class="collapsible-count">
            {supportCount} supporting card{supportCount === 1 ? '' : 's'}
          </span>
        </summary>

        <div class="find-commander-body">
          <div class="find-commander-header">
            <div class="find-commander-art-col">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={name}
                  width="220"
                  loading="lazy"
                  class="find-commander-art"
                />
              ) : (
                <div class="find-commander-art find-commander-art-empty">No image</div>
              )}
              {scryfallId && (
                <a
                  href={scryfallUrl(scryfallId)}
                  target="_blank"
                  rel="noopener"
                  class="find-commander-scryfall-link"
                >
                  View on Scryfall ↗
                </a>
              )}
            </div>
            <div class="find-commander-stats">
              {colorIdentity.length > 0 && (
                <div class="build-color-identity" aria-label="Color identity">
                  {colorIdentity.map((color: Color) => (
                    <img src={colorSymbolUrl(color)} alt={color} width="22" height="22" />
                  ))}
                </div>
              )}
              <div class="build-summary">
                <div class="build-summary-stat">
                  <span class="build-summary-num">{supportCount}</span>
                  <span class="build-summary-label">supporting cards</span>
                </div>
                <div class="build-summary-stat">
                  <span class="build-summary-num">
                    {edhrecRank != null ? `#${edhrecRank.toLocaleString('en-US')}` : '—'}
                  </span>
                  <span class="build-summary-label">EDHREC rank</span>
                </div>
                <div class="build-summary-stat">
                  <span class="build-summary-num">
                    {edhrecNumDecks != null ? edhrecNumDecks.toLocaleString('en-US') : '—'}
                  </span>
                  <span class="build-summary-label">decks</span>
                </div>
                <div class="build-summary-stat">
                  <span class="build-summary-num">{inCombo ? 'Yes' : 'No'}</span>
                  <span class="build-summary-label">in a deck combo</span>
                </div>
              </div>
            </div>
          </div>

          {inCombo && comboFeatures.length > 0 && (
            <p class="analyze-estimate-note">
              ♾️ This commander is part of a combo already in your deck
              {comboFeatures.length > 0 && (
                <> — produces <strong>{comboFeatures.join(', ')}</strong></>
              )}
              .
            </p>
          )}

          {noEdhrecData ? (
            <p class="build-section-empty">
              EDHREC has no recommendation page for this commander yet, so we
              can't measure how well your cards support it.
            </p>
          ) : supportCards.length === 0 ? (
            <p class="build-section-empty">
              None of your other cards are EDHREC picks for this commander — it
              would be a from-scratch build.
            </p>
          ) : (
            <>
              <p class="analyze-estimate-note">
                Cards already in your deck that EDHREC recommends for{' '}
                <strong>{name}</strong>, best synergy first.
              </p>
              <ul class="analyze-list">
                {supportCards.map((card) => (
                  <SupportRow card={card} />
                ))}
              </ul>
            </>
          )}
        </div>
      </details>
    </section>
  );
}

export function FindCommanderPage({ result, cached }: FindCommanderPageProps) {
  const { deckId, deckName, moxfieldUrl, scannedCardCount, candidates } = result;

  const anchors = candidates.map((c, i) => candidateAnchor(c.name, i));

  const navItems: SideNavItem[] = candidates.map((c, i) => ({
    id: anchors[i],
    label: c.name,
    meta: c.inCombo ? `♾️ ${c.supportCount}` : String(c.supportCount),
  }));

  return (
    <Layout title={`${deckName} — Find a Commander`}>
      <div class="progress-section">
        <h1>{deckName}</h1>
        <p class="build-selection">Find a Commander</p>
        <p class="progress-text">
          Scanned <strong>{scannedCardCount}</strong> cards ·{' '}
          <strong>{candidates.length}</strong> legal commander
          {candidates.length === 1 ? '' : 's'} found.{' '}
          <a href={moxfieldUrl} target="_blank" rel="noopener">
            View on Moxfield ↗
          </a>
          {cached && (
            <span style="margin-left: 1rem; color: var(--text-muted); font-size: 0.8rem;">
              (cached)
            </span>
          )}
        </p>
        <p class="analyze-estimate-note" style="max-width: 640px; margin: 0.75rem auto 0;">
          Each legal commander in your deck is ranked by how many of your other
          cards EDHREC recommends for it (its "support"), plus a boost when the
          commander is part of a combo already in your deck.
        </p>
      </div>

      {candidates.length === 0 ? (
        <div class="glass-card" style="padding: 1.5rem;">
          <p>
            No legal commanders were found among this deck's cards. A commander
            must be a legendary creature (or a card that says it can be your
            commander).
          </p>
        </div>
      ) : (
        <div class="page-with-sidenav">
          <SideNav items={navItems} />
          <div class="page-with-sidenav-content">
            <div class="build-sections">
              {candidates.map((candidate, i) => (
                <CandidateSection
                  candidate={candidate}
                  anchor={anchors[i]}
                  rank={i + 1}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div style="margin-top: 2rem; display: flex; gap: 1rem; align-items: center;">
        <a href={`/deck/${encodeURIComponent(deckId)}`} class="back-link" id="back-link">
          ← Back to deck
        </a>
        <form method="post" action={`/find-commander/refresh/${encodeURIComponent(deckId)}`} style="margin: 0;">
          <button type="submit" class="secondary-button">↻ Refresh</button>
        </form>
      </div>
      <script dangerouslySetInnerHTML={{ __html: "var b=document.getElementById('back-link');if(b&&window.history.length>1){b.addEventListener('click',function(e){e.preventDefault();window.history.back();});}" }} />
    </Layout>
  );
}
