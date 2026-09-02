/**
 * Deck detail page — shows commanders, color identity, and all cards grouped by type.
 */

import { Layout } from './layout.js';
import type { DeckDetailResponse, CardTypeGroup, DeckCardInfo, Color, SpellbookCombo, PotentialComboCard } from '../types.js';

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
        // Scryfall symbol filenames strip the braces and the "/" separator:
        // {B} → B, {B/P} → BP (Phyrexian), {W/U} → WU (hybrid), {2/W} → 2W.
        const code = sym.replace(/[{}]/g, '').replace(/\//g, '');
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
  const comboCount = card.comboCount ?? 0;
  const potentialCount = card.potentialComboCount ?? 0;
  return (
    <div class="card-row">
      <span class="card-quantity">{card.quantity}x</span>
      <span class="card-name">{card.name}</span>
      {comboCount > 0 && (
        <span
          class="card-combo-badge"
          title={`In ${comboCount} combo${comboCount > 1 ? 's' : ''} in this deck`}
        >
          ♾️ {comboCount}
        </span>
      )}
      {potentialCount > 0 && (
        <span
          class="card-potential-badge"
          title={`In ${potentialCount} potential combo${potentialCount > 1 ? 's' : ''} (missing one card)`}
        >
          🧩 {potentialCount}
        </span>
      )}
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

function ComboCard({ combo }: { combo: SpellbookCombo }) {
  return (
    <div class="combo-card">
      <div class="combo-header">
        <div class="combo-cards-list">
          {combo.cards.map((card, i) => (
            <span class="combo-card-name">
              {card.name}{i < combo.cards.length - 1 ? ' + ' : ''}
            </span>
          ))}
          {combo.requires.length > 0 && (
            <span class="combo-template">
              {' + '}{combo.requires.map((r) => r.name).join(' + ')}
            </span>
          )}
        </div>
        <div class="combo-tags">
          {combo.bracketTag && (
            <span class="combo-bracket-tag">Bracket {combo.bracketTag}</span>
          )}
          <a href={combo.spellbookUrl} target="_blank" rel="noopener" class="combo-link">
            View on Spellbook ↗
          </a>
        </div>
      </div>
      <div class="combo-produces">
        {combo.produces.map((feature) => (
          <span class="combo-feature-badge">{feature.name}</span>
        ))}
      </div>
      {combo.easyPrerequisites && (
        <div class="combo-prereqs">
          <strong>Prerequisites:</strong> {combo.easyPrerequisites}
        </div>
      )}
      <div class="combo-description">
        {combo.description.split('\n').map((line) => (
          <p>{line}</p>
        ))}
      </div>
      <div class="combo-card-images">
        {combo.cards.map((card) => (
          card.imageUriFrontSmall && (
            <img
              src={card.imageUriFrontSmall}
              alt={card.name}
              class="combo-card-img"
              loading="lazy"
            />
          )
        ))}
      </div>
    </div>
  );
}

function CombosSection({ combos }: { combos: SpellbookCombo[] }) {
  if (combos.length === 0) return null;

  return (
    <div class="combos-section">
      <h2 style="color: #ccc; margin-bottom: 1.5rem; margin-top: 2.5rem;">
        ♾️ Combos Found
        <span style="font-size: 1rem; color: var(--text-muted); font-weight: 400; margin-left: 0.5rem;">
          ({combos.length})
        </span>
      </h2>
      <p style="color: var(--text-secondary); margin-bottom: 1.5rem; font-size: 0.9rem;">
        Combos detected via <a href="https://commanderspellbook.com" target="_blank" rel="noopener">Commander Spellbook</a>
      </p>
      <div class="combos-grid">
        {combos.map((combo) => (
          <ComboCard combo={combo} />
        ))}
      </div>
    </div>
  );
}

function PotentialCardRow({ card }: { card: PotentialComboCard }) {
  return (
    <div class="potential-card">
      <div class="potential-card-main">
        {card.imageUrl && (
          <img
            src={card.imageUrl}
            alt={card.name}
            class="potential-card-img"
            loading="lazy"
          />
        )}
        <div class="potential-card-info">
          <div class="potential-card-name">{card.name}</div>
          <div class="potential-card-count">
            Enables <strong>{card.comboCount}</strong> combo{card.comboCount > 1 ? 's' : ''}
          </div>
          <div class="potential-card-combos">
            {card.enabledCombos.map((combo) => (
              <a href={combo.spellbookUrl} target="_blank" rel="noopener" class="potential-combo-link">
                {combo.produces.slice(0, 2).join(', ')}
                {combo.produces.length > 2 ? ` +${combo.produces.length - 2} more` : ''}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PotentialCardsSection({ cards }: { cards: PotentialComboCard[] }) {
  if (cards.length === 0) return null;

  const totalCombos = cards.reduce((sum, c) => sum + c.comboCount, 0);

  return (
    <div class="potential-section">
      <h2 style="color: #ccc; margin-bottom: 1.5rem; margin-top: 2.5rem;">
        🧩 Potential Combos
        <span style="font-size: 1rem; color: var(--text-muted); font-weight: 400; margin-left: 0.5rem;">
          ({totalCombos} combos from {cards.length} card{cards.length > 1 ? 's' : ''})
        </span>
      </h2>
      <p style="color: var(--text-secondary); margin-bottom: 1.5rem; font-size: 0.9rem;">
        Add one of these cards to unlock new combos within your color identity
      </p>
      <div class="potential-cards-grid">
        {cards.map((card) => (
          <PotentialCardRow card={card} />
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
    <Layout title={`${deck.name} — Necro Nerds`}>
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
          {cached && <span style="margin-left: 1rem; color: var(--text-muted); font-size: 0.8rem;">(cached)</span>}
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
              <div style="width: 200px; height: 280px; background: #3a3a5a; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: var(--text-secondary);">
                No image
              </div>
            )}
            <div class="name">{commander.name}</div>
          </div>
        ))}
      </div>

      {deck.combos && deck.combos.combos.length > 0 && (
        <CombosSection combos={deck.combos.combos} />
      )}

      {deck.combos && deck.combos.potentialCards.length > 0 && (
        <PotentialCardsSection cards={deck.combos.potentialCards} />
      )}

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
        <a href="/" class="back-link" id="back-link">← Back</a>
      </div>
      <script dangerouslySetInnerHTML={{ __html: "var b=document.getElementById('back-link');if(b&&window.history.length>1){b.addEventListener('click',function(e){e.preventDefault();window.history.back();});}" }} />
    </Layout>
  );
}
