/**
 * Deck analysis page — salt / power / bracket estimate (Feature #4) plus
 * cut candidates and add suggestions (Feature #2) for a single Moxfield deck.
 *
 * All figures are EDHREC-derived estimates, surfaced as guidance rather than
 * authoritative ratings. Mirrors the deck-detail page's Layout + side-nav +
 * styling conventions.
 */

import { Layout } from './layout.js';
import { SideNav, type SideNavItem } from './side-nav.js';
import type {
  DeckAnalysisResponse,
  CommanderImage,
  Color,
} from '../types.js';

interface DeckAnalysisPageProps {
  result: DeckAnalysisResponse;
  cached: boolean;
}

function scryfallUrl(id: string): string {
  return `https://scryfall.com/card/${id}`;
}

function colorSymbolUrl(color: string): string {
  return `https://svgs.scryfall.io/card-symbols/${color.toUpperCase()}.svg`;
}

/** Formats an EDHREC inclusion/synergy fraction as a signed-ish percentage. */
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

const BRACKET_LABEL: Record<number, string> = {
  1: 'Exhibition',
  2: 'Core',
  3: 'Upgraded',
  4: 'Optimized',
  5: 'cEDH',
};

function CardName({ name, scryfallId }: { name: string; scryfallId: string | null }) {
  if (!scryfallId) return <>{name}</>;
  return (
    <a href={scryfallUrl(scryfallId)} target="_blank" rel="noopener" class="analyze-card-link">
      {name}
    </a>
  );
}

export function DeckAnalysisPage({ result, cached }: DeckAnalysisPageProps) {
  const {
    deckName,
    moxfieldUrl,
    commanders,
    colorIdentity,
    edhrecRank,
    edhrecNumDecks,
    analyzedCardCount,
    salt,
    cutCandidates,
    addSuggestions,
    noEdhrecData,
  } = result;

  const navItems: SideNavItem[] = [
    { id: 'section-power', label: 'Power & Salt', meta: `B${salt.estimatedBracket}` },
    { id: 'section-adds', label: 'Suggested Adds', meta: String(addSuggestions.length) },
    { id: 'section-cuts', label: 'Cut Candidates', meta: String(cutCandidates.length) },
  ];

  return (
    <Layout title={`${deckName} — Deck Analysis`}>
      <div class="progress-section">
        {colorIdentity.length > 0 && (
          <div class="build-color-identity" aria-label="Color identity">
            {colorIdentity.map((color: Color) => (
              <img src={colorSymbolUrl(color)} alt={color} width="26" height="26" />
            ))}
          </div>
        )}
        <h1>{deckName}</h1>
        <p class="build-selection">
          Deck analysis ·{' '}
          {commanders.map((c: CommanderImage, i: number) => (
            <>
              {i > 0 ? ' & ' : ''}
              <strong>{c.name}</strong>
            </>
          ))}
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
          Analysing <strong>{analyzedCardCount}</strong> non-land cards against
          EDHREC data.{' '}
          <a href={moxfieldUrl} target="_blank" rel="noopener">
            View on Moxfield ↗
          </a>
          {cached && (
            <span style="margin-left: 1rem; color: var(--text-muted); font-size: 0.8rem;">
              (cached)
            </span>
          )}
        </p>
      </div>

      {noEdhrecData && (
        <div class="glass-card" style="padding: 1.25rem; margin-bottom: 1.5rem;">
          <p>
            EDHREC has no recommendation page for this commander, so add/cut
            suggestions are unavailable. The salt estimate below is still
            computed from EDHREC's global salt data.
          </p>
        </div>
      )}

      <div class="page-with-sidenav">
        <SideNav items={navItems} />
        <div class="page-with-sidenav-content">
          <div class="build-sections">
          {/* ── Power & Salt ─────────────────────────────────────────── */}
          <section class="build-section" id="section-power">
            <h2 class="build-section-header">Power &amp; Salt (estimate)</h2>

            <div class="build-summary">
              <div class="build-summary-stat">
                <span class="build-summary-num">{salt.estimatedBracket}</span>
                <span class="build-summary-label">
                  bracket · {BRACKET_LABEL[salt.estimatedBracket] ?? '—'}
                </span>
              </div>
              <div class="build-summary-stat">
                <span class="build-summary-num">{salt.averageSalt.toFixed(2)}</span>
                <span class="build-summary-label">avg salt</span>
              </div>
              <div class="build-summary-stat">
                <span class="build-summary-num">{salt.saltyCardCount}</span>
                <span class="build-summary-label">salty cards</span>
              </div>
              <div class="build-summary-stat">
                <span class="build-summary-num">{salt.gameChangerCount}</span>
                <span class="build-summary-label">game changers</span>
              </div>
            </div>

            <p class="analyze-estimate-note">
              ⚠️ This bracket is a rough <strong>estimate</strong> from EDHREC
              salt data and Game Changer presence — a conversation starter, not
              an official rating.
            </p>

            <ul class="analyze-rationale">
              {salt.bracketRationale.map((line: string) => (
                <li>{line}</li>
              ))}
            </ul>

            {salt.gameChangers.length > 0 && (
              <div class="analyze-subblock">
                <h3 class="build-subtype-header">Game Changers in deck</h3>
                <p class="analyze-inline-list">{salt.gameChangers.join(', ')}</p>
              </div>
            )}

            {salt.topSaltyCards.length > 0 && (
              <div class="analyze-subblock">
                <h3 class="build-subtype-header">Saltiest cards</h3>
                <ul class="analyze-list">
                  {salt.topSaltyCards.map((c) => (
                    <li class="analyze-row">
                      <span class="analyze-row-name">
                        <CardName name={c.name} scryfallId={c.scryfallId} />
                      </span>
                      <span class="analyze-row-metric">🧂 {c.salt.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* ── Suggested Adds ───────────────────────────────────────── */}
          <section class="build-section" id="section-adds">
            <h2 class="build-section-header">
              Suggested Adds
              <span class="build-section-meta">{addSuggestions.length} cards</span>
            </h2>
            {addSuggestions.length === 0 ? (
              <p class="build-section-empty">
                No high-synergy EDHREC cards are missing from this deck — nice.
              </p>
            ) : (
              <>
                <p class="analyze-estimate-note">
                  High-synergy EDHREC cards for this commander that your deck
                  doesn't run yet, best first.
                </p>
                <ul class="analyze-list">
                  {addSuggestions.map((c) => (
                    <li class="analyze-row">
                      <span class="analyze-row-name">
                        <CardName name={c.name} scryfallId={c.scryfallId} />
                        <span class="analyze-row-tag">{c.category}</span>
                      </span>
                      <span class="analyze-row-metric">
                        {synergyPct(c.synergy)} syn · {pct(c.inclusion)} incl
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* ── Cut Candidates ───────────────────────────────────────── */}
          <section class="build-section" id="section-cuts">
            <h2 class="build-section-header">
              Cut Candidates
              <span class="build-section-meta">{cutCandidates.length} cards</span>
            </h2>
            {cutCandidates.length === 0 ? (
              <p class="build-section-empty">
                Every non-land card in this deck is an EDHREC pick for this
                commander — no obvious off-meta cuts.
              </p>
            ) : (
              <>
                <p class="analyze-estimate-note">
                  Cards your deck runs that aren't among EDHREC's picks for this
                  commander. These may be spicy tech or personal choices — review
                  before cutting.
                </p>
                <ul class="analyze-list">
                  {cutCandidates.map((c) => (
                    <li class="analyze-row">
                      <span class="analyze-row-name">
                        <CardName name={c.name} scryfallId={c.scryfallId} />
                        <span class="analyze-row-tag">{c.type}</span>
                      </span>
                      <span class="analyze-row-metric analyze-row-muted">{c.reason}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          </div>
        </div>
      </div>

      <div style="margin-top: 2rem;">
        <a href="/" class="back-link" id="back-link">← Back</a>
      </div>
      <script dangerouslySetInnerHTML={{ __html: "var b=document.getElementById('back-link');if(b&&window.history.length>1){b.addEventListener('click',function(e){e.preventDefault();window.history.back();});}" }} />
    </Layout>
  );
}
