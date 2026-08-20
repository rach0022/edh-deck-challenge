/**
 * Deck detail page — shows commanders, color identity, and all cards grouped by type.
 */

import { Layout } from './layout.js';
import type { DeckDetailResponse, CardTypeGroup, DeckCardInfo, Color } from '../types.js';

interface DeckDetailPageProps {
  deck: DeckDetailResponse;
  cached: boolean;
}

function manaSymbolUrl(color: string): string {
  return `https://svgs.scryfall.io/card-symbols/${color}.svg`;
}

function cardImageUrl(setCode: string, collectorNumber: string): string {
  return `https://api.scryfall.com/cards/${setCode}/${collectorNumber}?format=image&version=normal`;
}

/** Renders mana cost string like "{2}{W}{U}" into images */
function ManaCost({ cost }: { cost: string }) {
  if (!cost) return null;
  // Parse mana symbols from {X} notation
  const symbols = cost.match(/\{[^}]+\}/g) ?? [];
  return (
    <span class="mana-cost">
      {symbols.map((sym) => {
        // Scryfall expects uppercase symbols without braces
        const code = sym.replace(/[{}]/g, '');
        return (
          <img
            src={`https://svgs.scryfall.io/card-symbols/${code}.svg`}
            alt={sym}
            width="16"
            height="16"
          />
        );
      })}
    </span>
  );
}

function CardRow({ card }: { card: DeckCardInfo }) {
  return (
    <div class="card-row">
      <span class="card-quantity">{card.quantity}x</span>
      <span class="card-name">{card.name}</span>
      <ManaCost cost={card.manaCost} />
    </div>
  );
}

function CardTypeSection({ group }: { group: CardTypeGroup }) {
  return (
    <div class="card-type-section">
      <h3 class="card-type-header">
        {typeEmoji(group.type)} {group.type}s
        <span class="card-type-count">({group.count})</span>
      </h3>
      <div class="card-list">
        {group.cards.map((card) => (
          <CardRow card={card} />
        ))}
      </div>
    </div>
  );
}

function typeEmoji(type: string): string {
  switch (type) {
    case 'Creature': return '👾';
    case 'Planeswalker': return '🌟';
    case 'Instant': return '⚡';
    case 'Sorcery': return '🔮';
    case 'Artifact': return '⚙️';
    case 'Enchantment': return '✨';
    case 'Land': return '🏔️';
    case 'Battle': return '⚔️';
    default: return '📦';
  }
}

export function DeckDetailPage({ deck, cached }: DeckDetailPageProps) {
  const colors = deck.colorIdentityKey === 'C'
    ? []
    : deck.colorIdentityKey.split('') as Color[];

  return (
    <Layout title={`${deck.name} — EDH Deck Challenge`}>
      <div class="deck-header">
        <h1>{deck.name}</h1>
        <div class="deck-meta">
          <span style="display: inline-flex; align-items: center; gap: 4px; margin-right: 1rem;">
            {colors.map((color) => (
              <img src={manaSymbolUrl(color)} alt={color} width="18" height="18" />
            ))}
            {colors.length === 0 && <span>Colorless</span>}
          </span>
          <span>{deck.colorSlotName}</span>
          {' • '}
          <span>{deck.cardCount} cards</span>
          {' • '}
          <a href={deck.moxfieldUrl} target="_blank" rel="noopener">
            View on Moxfield ↗
          </a>
          {cached && <span style="margin-left: 1rem; color: #666; font-size: 0.8rem;">(cached)</span>}
        </div>
      </div>

      <h2 style="color: #ccc; margin-bottom: 1rem;">
        Commander{deck.commanders.length > 1 ? 's' : ''}
      </h2>

      <div class="commanders-display">
        {deck.commanders.map((commander) => (
          <div class="commander-card">
            {commander.setCode && commander.collectorNumber ? (
              <img
                src={cardImageUrl(commander.setCode, commander.collectorNumber)}
                alt={commander.name}
                width="200"
                loading="lazy"
              />
            ) : (
              <div style="width: 200px; height: 280px; background: #3a3a5a; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #666;">
                No image
              </div>
            )}
            <div class="name">{commander.name}</div>
          </div>
        ))}
      </div>

      {deck.cardsByType.length > 0 && (
        <div class="decklist-section">
          <h2 style="color: #ccc; margin-bottom: 1.5rem; margin-top: 2.5rem;">
            Decklist
          </h2>
          <div class="decklist-grid">
            {deck.cardsByType.map((group) => (
              <CardTypeSection group={group} />
            ))}
          </div>
        </div>
      )}

      <div style="margin-top: 2rem;">
        <a href="javascript:history.back()" style="color: #80b0ff;">← Back</a>
      </div>
    </Layout>
  );
}
