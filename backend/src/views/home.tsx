/**
 * Landing page — username search form.
 */

import { Layout } from './layout.js';

export function HomePage() {
  return (
    <Layout title="EDH 32 Deck Challenge">
      <div class="hero">
        <h1>🃏 EDH 32 Deck Challenge</h1>

        <p class="hero-subtitle">
          Track your progress toward building a Commander deck for every color
          identity in Magic: The Gathering. Enter your Moxfield username to see
          how you're doing.
        </p>

        <div class="hero-search">
          <form class="search-form" action="/challenge" method="get">
            <input
              type="text"
              name="username"
              placeholder="Enter Moxfield username..."
              required
              minLength={2}
              maxLength={50}
              autofocus
            />
            <button type="submit">Check Progress</button>
          </form>
          <p class="search-hint">
            First lookup takes 10-30 seconds while we fetch your decks from Moxfield.
          </p>
        </div>

        <div class="features">
          <div class="feature-card">
            <h3>📊 32 Slots</h3>
            <p>
              All 32 color identities from colorless to 5-color. See which ones
              you've filled and which are still open.
            </p>
          </div>
          <div class="feature-card">
            <h3>🎨 Commander Art</h3>
            <p>
              Each filled slot shows your commander's card art from Scryfall.
              Partners and multi-deck slots supported.
            </p>
          </div>
          <div class="feature-card">
            <h3>⚡ Cached</h3>
            <p>
              Results are cached for 15 minutes. Subsequent visits are instant.
              Force refresh available if you've updated your decks.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
