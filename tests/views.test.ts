/**
 * View-rendering tests for the home page (`src/views/home.tsx`) and the
 * Build-a-Commander results page (`src/views/build.tsx`) — task 18.4.
 *
 * These are Hono JSX components. To assert on their rendered HTML we mount each
 * component in a tiny Hono app route and drive it through `app.request(...)`
 * (the same rendering path used by `tests/pages.build.test.ts`), then read the
 * response body as a string. No network, cache, or Puppeteer is involved.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { HomePage } from '../src/views/home.js';
import { BuildPage } from '../src/views/build.js';
import type {
  BuildCommanderResponse,
  BuildCommanderCard,
  BuildSection,
  BuildTypeGroup,
} from '../src/types.js';

// ─── Rendering helpers ───────────────────────────────────────────────────────

/** Renders <HomePage/> to an HTML string via a one-route Hono app. */
async function renderHome(): Promise<string> {
  const app = new Hono();
  app.get('/', (c) => c.html(<HomePage />));
  const res = await app.request('/');
  return res.text();
}

/** Renders <BuildPage/> to an HTML string via a one-route Hono app. */
async function renderBuild(
  result: BuildCommanderResponse,
  cached = false,
): Promise<string> {
  const app = new Hono();
  app.get('/', (c) => c.html(<BuildPage result={result} cached={cached} />));
  const res = await app.request('/');
  return res.text();
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** An owned card (rendered as a full card image with a deck caption). */
function ownedCard(overrides: Partial<BuildCommanderCard> = {}): BuildCommanderCard {
  return {
    name: 'Sol Ring',
    category: 'Ramp',
    owned: true,
    board: 'mainboard',
    sourceDecks: ['My Atraxa Deck', 'Superfriends'],
    art: 'https://img/art/sol-ring',
    imageUrl: 'https://img/normal/sol-ring',
    cardType: 'Artifact',
    scryfallId: 'abc-123',
    usd: null,
    cad: null,
    ...overrides,
  };
}

/** A to-buy card with a known CAD price. */
function toBuyCard(overrides: Partial<BuildCommanderCard> = {}): BuildCommanderCard {
  return {
    name: 'Cyclonic Rift',
    category: 'Interaction',
    owned: false,
    board: null,
    sourceDecks: [],
    art: null,
    imageUrl: null,
    cardType: 'Instant',
    scryfallId: 'def-456',
    usd: 30,
    cad: 40.5,
    ...overrides,
  };
}

/** Groups cards by cardType into BuildTypeGroup[] (test-side helper). */
function typeGroups(cards: BuildCommanderCard[]): BuildTypeGroup[] {
  const byType = new Map<string, BuildCommanderCard[]>();
  for (const c of cards) {
    const b = byType.get(c.cardType);
    if (b) b.push(c);
    else byType.set(c.cardType, [c]);
  }
  return [...byType.entries()].map(([type, cs]) => ({ type, cards: cs }));
}

/** A full response covering owned + to-buy (priced and null-priced) cards. */
function buildResponse(
  overrides: Partial<BuildCommanderResponse> = {},
): BuildCommanderResponse {
  const owned = [
    ownedCard(),
    ownedCard({
      name: 'Arcane Signet',
      category: 'Ramp',
      cardType: 'Artifact',
      sourceDecks: ['My Atraxa Deck'],
      imageUrl: 'https://img/normal/arcane-signet',
      scryfallId: 'ghi-789',
    }),
  ];
  const toBuy = [
    toBuyCard(),
    // A null-priced to-buy card — renders a dash and is excluded from the total.
    toBuyCard({
      name: 'The Great Henge',
      category: 'Ramp',
      cardType: 'Artifact',
      cad: null,
      usd: null,
      scryfallId: null,
    }),
  ];

  // One section (all fixture cards share the "Ramp" section here) split into
  // owned / to-buy type groups, mirroring what the service produces.
  const sections: BuildSection[] = [
    {
      name: 'High Synergy Cards',
      ownedGroups: typeGroups(owned),
      toBuyGroups: typeGroups(toBuy),
      ownedCount: owned.length,
      toBuyCount: toBuy.length,
      toBuyTotalCad: 40.5,
    },
  ];

  return {
    username: 'testuser',
    selection: {
      commander: 'Atraxa, Praetors Voice',
      partner: 'Tymna the Weaver',
      companion: 'Lurrus of the Dream-Den',
    },
    sections,
    commanderImages: [
      { name: 'Atraxa, Praetors Voice', imageUrl: 'https://img/cmd/atraxa', scryfallId: 'atraxa-id' },
      { name: 'Tymna the Weaver', imageUrl: 'https://img/cmd/tymna', scryfallId: 'tymna-id' },
    ],
    ownedCards: owned,
    toBuyCards: toBuy,
    ownedCount: owned.length,
    toBuyCount: toBuy.length,
    buyListTotalCad: 40.5,
    deckCount: 3,
    fx: { usdToCad: 1.35, fetchedAt: '2024-06-01T00:00:00Z', live: true },
    noDecks: false,
    edhrecRank: 135,
    edhrecNumDecks: 14429,
    ...overrides,
  };
}

// ─── HomePage ────────────────────────────────────────────────────────────────

describe('HomePage', () => {
  it('renders all three mode radios with challenge preselected', async () => {
    const html = await renderHome();

    expect(html).toContain('value="challenge"');
    expect(html).toContain('value="cedh"');
    expect(html).toContain('value="build"');

    // Challenge is the checked radio; cedh/build are not.
    const challengeRadio = html.match(/<input[^>]*value="challenge"[^>]*>/)![0];
    expect(challengeRadio).toContain('checked');

    const cedhRadio = html.match(/<input[^>]*value="cedh"[^>]*>/)![0];
    expect(cedhRadio).not.toContain('checked');
    const buildRadio = html.match(/<input[^>]*value="build"[^>]*>/)![0];
    expect(buildRadio).not.toContain('checked');
  });

  it('renders a single shared username input', async () => {
    const html = await renderHome();
    const usernameInputs = html.match(/<input[^>]*name="username"[^>]*>/g) ?? [];
    expect(usernameInputs).toHaveLength(1);
    expect(usernameInputs[0]).toContain('required');
  });

  it('renders the commander, partner, and companion fields with autocomplete wrappers', async () => {
    const html = await renderHome();

    // The three build-mode inputs are addressed by data-build-name (the inline
    // script promotes them to real `name` attributes only in build mode).
    expect(html).toContain('data-build-name="commander"');
    expect(html).toContain('data-build-name="partner"');
    expect(html).toContain('data-build-name="companion"');

    // Commander is marked (required) and partner/companion (optional) in the UI.
    expect(html).toContain('(required)');
    expect(html).toContain('(optional)');

    // Autocomplete wrappers: two commander endpoints (commander + partner) and
    // one companion endpoint.
    expect(html).toContain('data-autocomplete="commanders"');
    expect(html).toContain('data-autocomplete="companions"');

    // The commander fieldset is hidden by default (challenge preselected).
    expect(html).toMatch(/id="commander-fields"[^>]*hidden/);
  });

  it('includes the mode-toggle / autocomplete inline script', async () => {
    const html = await renderHome();
    // The progressive-enhancement script wires the mode toggle and the
    // debounced Scryfall autocomplete.
    expect(html).toContain('/api/scryfall/commanders');
    expect(html).toContain('/api/scryfall/companions');
    expect(html).toContain("data-build-name");
    expect(html).toContain('addEventListener');
  });
});

// ─── BuildPage ───────────────────────────────────────────────────────────────

describe('BuildPage', () => {
  it('renders the selection including partner and companion when present', async () => {
    const html = await renderBuild(buildResponse());
    expect(html).toContain('Atraxa, Praetors Voice');
    expect(html).toContain('Tymna the Weaver');
    expect(html).toContain('Lurrus of the Dream-Den');
    expect(html).toContain('partner');
    expect(html).toContain('companion');
  });

  it('renders the commander card image(s) in the header', async () => {
    const html = await renderBuild(buildResponse());
    // The art container is rendered (the class also appears in the <style>
    // block, so assert on the element form specifically).
    expect(html).toContain('class="build-commander-art"');
    expect(html).toContain('https://img/cmd/atraxa');
    expect(html).toContain('https://img/cmd/tymna');
    // Images link to Scryfall.
    expect(html).toContain('scryfall.com/card/atraxa-id');
  });

  it('renders the EDHREC commander rank line', async () => {
    const html = await renderBuild(buildResponse());
    expect(html).toContain('class="build-edhrec-rank"');
    expect(html).toContain('EDHREC rank');
    expect(html).toContain('#135');
    expect(html).toContain('14,429 decks');
  });

  it('omits the rank line when edhrecRank is null', async () => {
    const html = await renderBuild(buildResponse({ edhrecRank: null, edhrecNumDecks: null }));
    expect(html).not.toContain('class="build-edhrec-rank"');
  });

  it('renders no commander art block when images are unavailable', async () => {
    const html = await renderBuild(buildResponse({ commanderImages: [] }));
    // No rendered art container (CSS definition may still mention the class).
    expect(html).not.toContain('class="build-commander-art"');
  });

  it('omits partner/companion wording when the selection has none', async () => {
    const html = await renderBuild(
      buildResponse({
        selection: { commander: 'Atraxa, Praetors Voice', partner: null, companion: null },
        commanderImages: [
          { name: 'Atraxa, Praetors Voice', imageUrl: 'https://img/cmd/atraxa', scryfallId: 'atraxa-id' },
        ],
      }),
    );
    expect(html).toContain('Atraxa, Praetors Voice');
    expect(html).not.toContain('Tymna the Weaver');
    expect(html).not.toContain('Lurrus of the Dream-Den');
  });

  it('renders owned/to-buy counts, deck count, and the CAD buy-list total', async () => {
    const html = await renderBuild(buildResponse());
    // Counts appear in the summary.
    expect(html).toContain('owned');
    expect(html).toContain('to buy');
    // Deck count (3) drives the "3 commander decks" line and "decks scanned".
    expect(html).toContain('>3<');
    expect(html).toContain('decks scanned');
    // Buy-list total is CAD-formatted.
    expect(html).toContain('CA$40.50');
    expect(html).toContain('buy-list total');
  });

  it('shows owned cards as images grouped by type, with source-deck captions', async () => {
    const html = await renderBuild(buildResponse());
    expect(html).toContain('Sol Ring');
    expect(html).toContain('Arcane Signet');
    // Owned cards render as full card images.
    expect(html).toContain('build-owned-img');
    expect(html).toContain('https://img/normal/sol-ring');
    // Card-type sub-group header (Artifact) is shown.
    expect(html).toContain('build-subtype-header');
    // Source-deck names appear in the caption (title attr lists all decks).
    expect(html).toContain('My Atraxa Deck');
  });

  it('badges owned cards found only on the sideboard / maybeboard', async () => {
    // A section whose owned card came from the sideboard.
    const owned = ownedCard({ name: 'Cyclonic Rift', board: 'sideboard', cardType: 'Instant' });
    const considering = ownedCard({ name: 'Mystic Remora', board: 'maybeboard', cardType: 'Enchantment', scryfallId: 'mr-1' });
    const res = await renderBuild(
      buildResponse({
        ownedCards: [owned, considering],
        ownedCount: 2,
        sections: [
          {
            name: 'High Synergy Cards',
            ownedGroups: [
              { type: 'Instant', cards: [owned] },
              { type: 'Enchantment', cards: [considering] },
            ],
            toBuyGroups: [],
            ownedCount: 2,
            toBuyCount: 0,
            toBuyTotalCad: 0,
          },
        ],
      }),
    );
    expect(res).toContain('class="board-badge board-badge-sideboard"');
    expect(res).toContain('>Sideboard<');
    expect(res).toContain('class="board-badge board-badge-maybeboard"');
    expect(res).toContain('>Considering<');
  });

  it('does not badge mainboard-owned cards', async () => {
    // Default fixture owned cards are all mainboard → no rendered badge element.
    const res = await renderBuild(buildResponse());
    expect(res).not.toContain('class="board-badge board-badge-sideboard"');
    expect(res).not.toContain('class="board-badge board-badge-maybeboard"');
  });

  it('renders EDHREC section headers', async () => {
    const html = await renderBuild(buildResponse());
    expect(html).toContain('build-section');
    expect(html).toContain('High Synergy Cards');
  });

  it('shows to-buy cards in a collapsible list with CAD prices and a dash for null-priced', async () => {
    const html = await renderBuild(buildResponse());
    // To-buy cards live under a <details> dropdown.
    expect(html).toContain('<details');
    expect(html).toContain('to buy');
    expect(html).toContain('Cyclonic Rift');
    expect(html).toContain('CA$40.50');
    // The null-priced to-buy card renders a dash.
    expect(html).toContain('The Great Henge');
    expect(html).toContain('—');
  });

  it('renders the no-decks notice only when noDecks is true', async () => {
    const withDecks = await renderBuild(buildResponse({ noDecks: false }));
    expect(withDecks).not.toContain('build-nodecks');

    const noDecks = await renderBuild(
      buildResponse({
        noDecks: true,
        deckCount: 0,
        ownedCards: [],
        ownedCount: 0,
      }),
    );
    expect(noDecks).toContain('build-nodecks');
    expect(noDecks).toContain('no commander decks');
  });

  it('targets the refresh form at /build/refresh/<username> with the selection query', async () => {
    const html = await renderBuild(buildResponse());
    const formMatch = html.match(/<form[^>]*action="([^"]*build\/refresh[^"]*)"[^>]*>/);
    expect(formMatch).not.toBeNull();
    const action = formMatch![1];
    expect(action).toContain('/build/refresh/testuser');
    // The action carries the selection as query params (HTML-encodes & as &amp;).
    const decoded = action.replace(/&amp;/g, '&');
    const query = new URLSearchParams(decoded.split('?')[1]);
    expect(query.get('commander')).toBe('Atraxa, Praetors Voice');
    expect(query.get('partner')).toBe('Tymna the Weaver');
    expect(query.get('companion')).toBe('Lurrus of the Dream-Den');
  });

  it('shows the live FX rate note when fx.live is true', async () => {
    const html = await renderBuild(buildResponse());
    expect(html).toContain('1 USD ≈ CA$1.3500');
    expect(html).toContain('cached daily');
    expect(html).not.toContain('approximate fallback');
  });

  it('shows the approximate-rate FX note when fx.live is false', async () => {
    const html = await renderBuild(
      buildResponse({
        fx: { usdToCad: 1.35, fetchedAt: '2024-06-01T00:00:00Z', live: false },
      }),
    );
    expect(html).toContain('approximate fallback');
    expect(html).not.toContain('cached daily');
  });
});
