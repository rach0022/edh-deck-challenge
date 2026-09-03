/**
 * Base HTML layout for all SSR pages.
 * Purple/green glassmorphism design inspired by frugal.co.
 */

import type { Child } from 'hono/jsx';

interface LayoutProps {
  title: string;
  children: Child;
}

export function Layout({ title, children }: LayoutProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        {/* Load the font stylesheet without blocking first paint: fetch it as
            a non-render-blocking "print" sheet, then flip to "all" once loaded.
            The <noscript> fallback keeps it working with JS disabled. The
            body font-family already lists system-font fallbacks, so text
            renders immediately and swaps to Inter when ready (font-display=swap). */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          media="print"
          onload="this.media='all'"
        />
        <noscript>
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          />
        </noscript>
        <style>{css}</style>
      </head>
      <body>
        <div class="bg-glow bg-glow-1" aria-hidden="true" />
        <div class="bg-glow bg-glow-2" aria-hidden="true" />
        <div class="bg-glow bg-glow-3" aria-hidden="true" />
        <header>
          <div class="header-inner">
            <a href="/" class="logo" aria-label="Necro Nerds home">
              <span aria-hidden="true">🃏</span> Necro Nerds
            </a>
            <nav aria-label="Primary">
              <a href="/" class="nav-link">Home</a>
              <a href="https://github.com/rach0022/edh-deck-challenge" target="_blank" rel="noopener" class="nav-link">GitHub</a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer>
          <p>
            Powered by <a href="https://www.moxfield.com" target="_blank" rel="noopener">Moxfield</a>
            {' • '}
            Combos by <a href="https://commanderspellbook.com" target="_blank" rel="noopener">Commander Spellbook</a>
            {' • '}
            Built with <a href="https://hono.dev" target="_blank" rel="noopener">Hono</a>
            {' • '}
            <a href="https://github.com/rach0022/edh-deck-challenge" target="_blank" rel="noopener">Source</a>
          </p>
        </footer>
      </body>
    </html>
  );
}

const css = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { color-scheme: dark; }

  :root {
    --bg-base: #0a0a12;
    --bg-surface: rgba(20, 15, 40, 0.6);
    --glass: rgba(255, 255, 255, 0.03);
    --glass-border: rgba(255, 255, 255, 0.08);
    --glass-hover: rgba(255, 255, 255, 0.06);
    --text-primary: #f0eef6;
    --text-secondary: #b8b3c8;
    --text-muted: #938ca8;
    --accent-purple: #a855f7;
    --accent-green: #34d399;
    --accent-gradient: linear-gradient(135deg, #a855f7, #34d399);
    --glow-purple: rgba(168, 85, 247, 0.15);
    --glow-green: rgba(52, 211, 153, 0.12);
    --filled-border: rgba(52, 211, 153, 0.6);
    --radius-sm: 8px;
    --radius-md: 14px;
    --radius-lg: 20px;
    --radius-xl: 28px;
  }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: var(--bg-base);
    color: var(--text-primary);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow-x: hidden;
  }

  /* ─── Ambient Background Glows ──────────── */

  .bg-glow {
    position: fixed;
    border-radius: 50%;
    filter: blur(120px);
    pointer-events: none;
    z-index: 0;
    /* Promote to an isolated composited layer so the expensive blur is
       rendered once and not repainted as content scrolls over it. */
    will-change: transform;
    transform: translateZ(0);
  }

  .bg-glow-1 {
    width: 600px;
    height: 600px;
    top: -200px;
    left: -100px;
    background: var(--glow-purple);
  }

  .bg-glow-2 {
    width: 500px;
    height: 500px;
    top: 40%;
    right: -150px;
    background: var(--glow-green);
  }

  .bg-glow-3 {
    width: 400px;
    height: 400px;
    bottom: -100px;
    left: 30%;
    background: rgba(168, 85, 247, 0.08);
  }

  /* ─── Header ────────────────────────────── */

  header {
    position: sticky;
    top: 0;
    z-index: 100;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    background: rgba(10, 10, 18, 0.7);
    border-bottom: 1px solid var(--glass-border);
  }

  .header-inner {
    max-width: 1400px;
    margin: 0 auto;
    padding: 1.25rem 2.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .logo {
    background: var(--accent-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    font-size: 1.5rem;
    font-weight: 800;
    text-decoration: none;
    letter-spacing: -0.5px;
  }

  nav {
    display: flex;
    gap: 1.5rem;
  }

  .nav-link {
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 500;
    transition: color 0.2s;
  }

  .nav-link:hover {
    color: var(--text-primary);
    text-decoration: none;
  }

  /* ─── Main ──────────────────────────────── */

  main {
    flex: 1;
    padding: 3rem 3rem;
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
    position: relative;
    z-index: 1;
  }

  /* ─── Footer ────────────────────────────── */

  footer {
    padding: 3rem 2rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.85rem;
    border-top: 1px solid var(--glass-border);
    position: relative;
    z-index: 1;
  }

  footer a {
    color: var(--text-secondary);
    text-decoration: none;
    transition: color 0.2s;
  }

  footer a:hover {
    color: var(--accent-green);
  }

  a { color: var(--accent-green); text-decoration: none; }
  a:hover { color: #6ee7b7; text-decoration: none; }

  /* ─── Glass Card Mixin ──────────────────── */

  .glass-card {
    background: var(--glass);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    transition: border-color 0.3s, transform 0.2s, box-shadow 0.3s;
  }

  .glass-card:hover {
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 8px 32px rgba(168, 85, 247, 0.08);
  }

  /* ─── Forms ─────────────────────────────── */

  .search-form {
    display: flex;
    gap: 1rem;
    width: 100%;
  }

  .search-form input {
    flex: 1 1 0%;
    width: 100%;
    min-width: 0;
    padding: 1.25rem 2rem;
    border-radius: 50px;
    border: 1px solid rgba(168, 85, 247, 0.3);
    background: rgba(30, 20, 60, 0.9);
    color: #fff;
    font-size: 1.15rem;
    font-family: inherit;
    outline: none;
    transition: border-color 0.3s, box-shadow 0.3s;
    -webkit-appearance: none;
    appearance: none;
    color-scheme: dark;
  }

  .search-form input:-webkit-autofill,
  .search-form input:-webkit-autofill:hover,
  .search-form input:-webkit-autofill:focus {
    -webkit-box-shadow: 0 0 0 1000px rgba(30, 20, 60, 1) inset;
    -webkit-text-fill-color: #fff;
    border: 1px solid rgba(168, 85, 247, 0.3);
  }

  .search-form input:focus {
    border-color: var(--accent-purple);
    box-shadow: 0 0 0 4px rgba(168, 85, 247, 0.2);
  }

  .search-form input::placeholder {
    color: rgba(200, 190, 220, 0.5);
  }

  .search-form button {
    padding: 1.25rem 2.5rem;
    border-radius: 50px;
    border: none;
    background: var(--accent-gradient);
    color: #fff;
    font-size: 1.1rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.3s;
    white-space: nowrap;
  }

  .search-form button:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 24px rgba(168, 85, 247, 0.35);
  }

  /* ─── Progress Bar ──────────────────────── */

  .progress-section {
    text-align: center;
    margin-bottom: 4rem;
    padding: 2rem 0;
  }

  .progress-section h1 {
    font-size: 2.4rem;
    margin-bottom: 1rem;
    font-weight: 800;
    background: var(--accent-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .progress-bar-container {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 100px;
    height: 24px;
    max-width: 640px;
    margin: 1.5rem auto;
    overflow: hidden;
    border: 1px solid var(--glass-border);
  }

  .progress-bar {
    height: 100%;
    background: var(--accent-gradient);
    border-radius: 100px;
    transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .progress-text {
    color: var(--text-secondary);
    font-size: 1.05rem;
    margin-top: 1rem;
    font-weight: 500;
  }

  /* ─── Category Grid ─────────────────────── */

  .category-section {
    margin-bottom: 4rem;
    /* Skip rendering off-screen categories until near the viewport,
       cutting scroll/paint cost on the long 32-slot page. */
    content-visibility: auto;
    contain-intrinsic-size: auto 500px;
  }

  .category-header {
    font-size: 1.3rem;
    color: var(--text-primary);
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--glass-border);
    font-weight: 600;
  }

  .category-header .count {
    color: var(--text-muted);
    font-size: 0.9rem;
    font-weight: 400;
  }

  .slots-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 1.5rem;
  }

  /* ─── Slot Cards ────────────────────────── */

  .slot-card {
    position: relative;
    min-height: 220px;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid var(--glass-border);
    background: var(--bg-surface);
    transition: transform 0.25s, border-color 0.3s, box-shadow 0.3s;
    /* Isolate paint/layout so scrolling one card doesn't repaint others */
    contain: layout paint style;
  }

  /* Only unfilled (glass) cards need the blur — filled cards are covered
     by an opaque art layer, so their backdrop-filter would be invisible
     overhead. Blurring 30+ stacked layers is the main scroll-jank source. */
  .slot-card.empty {
    background: var(--glass);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .slot-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  }

  .slot-card.filled {
    border-color: var(--filled-border);
    box-shadow: 0 0 20px rgba(52, 211, 153, 0.05);
  }

  .slot-card.filled:hover {
    box-shadow: 0 12px 40px rgba(52, 211, 153, 0.1);
  }

  .slot-card.empty {
    opacity: 0.55;
  }

  .slot-card.empty:hover {
    opacity: 0.7;
  }

  .slot-art {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    z-index: 0;
  }

  .slot-art.slot-art-cycle {
    animation-name: deckFade;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    will-change: opacity;
  }

  /* ─── Two-Deck Diagonal Split ───────────── */

  .slot-art.slot-art-split {
    animation: none;
    opacity: 1;
  }

  /* Diagonal cut runs along the "/" anti-diagonal, from the top-right
     corner to the bottom-left corner.
     Left half is the upper-left triangle, right half the lower-right. */
  .slot-art-split-left {
    clip-path: polygon(0 0, 100% 0, 0 100%);
  }

  .slot-art-split-right {
    clip-path: polygon(100% 0, 100% 100%, 0 100%);
  }

  /* The visible diagonal divider line between the two halves.
     Must run along the same "/" diagonal as the clip-path cut
     (top-right corner to bottom-left corner). */
  .slot-split-divider {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background: linear-gradient(
      to top left,
      transparent calc(50% - 1px),
      rgba(255, 255, 255, 0.55) 50%,
      transparent calc(50% + 1px)
    );
  }

  .slot-art::after {
    content: '';
    position: absolute;
    inset: 0;
    /* Stronger bottom scrim so deck/commander names stay legible over
       arbitrary card art (including light-colored art). No backdrop-filter
       here — it was recompositing on every filled card during scroll. */
    background: linear-gradient(
      180deg,
      rgba(10, 10, 18, 0.15) 0%,
      rgba(10, 10, 18, 0.55) 45%,
      rgba(10, 10, 18, 0.92) 100%
    );
  }

  .slot-content {
    position: relative;
    z-index: 1;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    min-height: 220px;
  }

  .slot-name {
    font-size: 1rem;
    font-weight: 700;
    color: #fff;
    margin-bottom: 0.3rem;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 2px rgba(0, 0, 0, 0.7);
  }

  .slot-colors {
    display: flex;
    gap: 4px;
    margin-bottom: 0.5rem;
  }

  .slot-colors img {
    width: 18px;
    height: 18px;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
  }

  .commander-name {
    color: #6ee7b7;
    font-size: 0.9rem;
    font-weight: 700;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.95), 0 0 2px rgba(0, 0, 0, 0.8);
  }

  .deck-name {
    color: #e2dff0;
    font-size: 0.8rem;
    font-style: italic;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.95), 0 0 2px rgba(0, 0, 0, 0.8);
  }

  .slot-link {
    display: inline-block;
    margin-top: 0.15rem;
    font-size: 0.75rem;
    color: #a9c7ff;
    font-weight: 600;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.95);
  }

  .slot-link:hover {
    color: #cfe0ff;
    text-decoration: underline;
  }

  .back-link {
    color: #a9c7ff;
    font-weight: 600;
  }

  .back-link:hover {
    color: #cfe0ff;
    text-decoration: underline;
  }

  .empty-label {
    color: var(--text-muted);
    font-size: 0.85rem;
    font-style: italic;
  }

  .multi-deck-badge {
    position: absolute;
    top: 10px;
    right: 10px;
    background: var(--accent-gradient);
    color: #fff;
    padding: 3px 10px;
    border-radius: 100px;
    font-size: 0.7rem;
    font-weight: 700;
    z-index: 2;
    letter-spacing: 0.3px;
  }

  /* ─── Multi-Deck Carousel ───────────────── */

  .deck-info-carousel {
    position: relative;
    min-height: 3.5rem;
  }

  .deck-info {
    /* Single-deck: normal flow */
  }

  .deck-info.deck-info-cycle {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    animation-name: deckFade;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    will-change: opacity;
  }

  @keyframes deckFade {
    0%   { opacity: 0; }
    5%   { opacity: 1; }
    45%  { opacity: 1; }
    50%  { opacity: 0; }
    100% { opacity: 0; }
  }

  /* ─── Two-Deck Split Info ───────────────── */

  .deck-info-split {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
  }

  .deck-info-split .deck-info {
    flex: 1;
    min-width: 0;
  }

  .deck-info-split .deck-info:last-child {
    text-align: right;
  }

  .deck-info-split .commander-name,
  .deck-info-split .deck-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ─── Deck Detail Page ──────────────────── */

  .deck-header {
    margin-bottom: 3rem;
  }

  .deck-header h1 {
    font-size: 2.2rem;
    font-weight: 800;
    background: var(--accent-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 0.75rem;
  }

  .deck-meta {
    color: var(--text-secondary);
    font-size: 1rem;
  }

  .deck-meta a {
    color: var(--accent-green);
  }

  .commanders-display {
    display: flex;
    gap: 2rem;
    flex-wrap: wrap;
    margin-bottom: 3rem;
  }

  .commander-card {
    text-align: center;
  }

  .commander-card img {
    width: 240px;
    border-radius: var(--radius-md);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 40px rgba(168, 85, 247, 0.08);
    transition: transform 0.2s;
  }

  .commander-card img:hover {
    transform: scale(1.03);
  }

  .commander-card .name {
    margin-top: 1rem;
    color: var(--accent-green);
    font-weight: 600;
    font-size: 1.05rem;
  }

  /* ─── Home Page ─────────────────────────── */

  .hero {
    max-width: 900px;
    margin: 0 auto;
    padding: 6rem 0 4rem;
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .hero h1 {
    font-size: 3.5rem;
    font-weight: 800;
    background: var(--accent-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 2rem;
    letter-spacing: -1.5px;
    line-height: 1.1;
    text-align: center;
  }

  .hero-subtitle {
    color: var(--text-secondary);
    font-size: 1.15rem;
    line-height: 1.7;
    text-align: center;
    margin-bottom: 3rem;
  }

  .hero-search {
    margin-bottom: 5rem;
    width: 100%;
    display: block;
  }

  .search-hint {
    text-align: center;
    color: var(--text-muted);
    font-size: 0.9rem;
    margin-top: 1.5rem;
  }

  .features {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.5rem;
  }

  .feature-card {
    background: var(--glass);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: var(--radius-lg);
    padding: 2rem 1.75rem;
    border: 1px solid var(--glass-border);
    transition: border-color 0.3s, transform 0.2s;
  }

  .feature-card:hover {
    border-color: rgba(255, 255, 255, 0.12);
    transform: translateY(-2px);
  }

  .feature-card h3 {
    background: var(--accent-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 0.75rem;
    font-weight: 700;
    font-size: 1.1rem;
  }

  .feature-card p {
    color: var(--text-secondary);
    font-size: 0.95rem;
    line-height: 1.6;
    margin-bottom: 0;
  }

  /* ─── Loading / Error ───────────────────── */

  .error-page {
    text-align: center;
    padding: 5rem 1rem;
  }

  .error-page h1 {
    color: #f87171;
    font-size: 1.8rem;
    margin-bottom: 1rem;
    font-weight: 700;
  }

  .error-page p {
    color: var(--text-secondary);
    margin-bottom: 2rem;
  }

  .loading-hint, .search-hint {
    text-align: center;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  /* ─── Decklist ──────────────────────────── */

  .decklist-section {
    border-top: 1px solid var(--glass-border);
    padding-top: 3rem;
    margin-top: 1rem;
  }

  .decklist-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 1.5rem;
  }

  .card-type-section {
    background: var(--glass);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: var(--radius-lg);
    padding: 1.75rem 2rem;
    border: 1px solid var(--glass-border);
  }

  .card-type-header {
    background: var(--accent-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    font-size: 1.1rem;
    font-weight: 700;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--glass-border);
  }

  .card-type-count {
    color: var(--text-muted);
    font-weight: 400;
    font-size: 0.9rem;
    margin-left: 0.5rem;
    -webkit-text-fill-color: var(--text-muted);
  }

  .card-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .card-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    transition: background 0.15s;
  }

  .card-row:hover {
    background: var(--glass-hover);
  }

  .card-quantity {
    color: var(--text-muted);
    font-size: 0.9rem;
    min-width: 28px;
    font-weight: 500;
  }

  .card-name {
    color: var(--text-primary);
    font-size: 0.95rem;
    flex: 1;
  }

  .card-combo-badge {
    background: rgba(168, 85, 247, 0.2);
    color: var(--accent-purple);
    padding: 2px 8px;
    border-radius: 100px;
    font-size: 0.72rem;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .card-potential-badge {
    background: rgba(52, 211, 153, 0.15);
    color: var(--accent-green);
    padding: 2px 8px;
    border-radius: 100px;
    font-size: 0.72rem;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .mana-cost {
    display: inline-flex;
    gap: 3px;
    align-items: center;
  }

  .mana-cost img {
    width: 16px;
    height: 16px;
  }

  /* ─── Combos Section ────────────────────── */

  .combos-section {
    border-top: 1px solid var(--glass-border);
    padding-top: 2rem;
    margin-top: 1rem;
    margin-bottom: 2rem;
  }

  .combos-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }

  .combo-card {
    background: var(--glass);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: var(--radius-lg);
    padding: 1.75rem 2rem;
    border: 1px solid rgba(168, 85, 247, 0.25);
    transition: border-color 0.3s, box-shadow 0.3s;
  }

  .combo-card:hover {
    border-color: rgba(168, 85, 247, 0.5);
    box-shadow: 0 4px 24px rgba(168, 85, 247, 0.1);
  }

  .combo-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }

  .combo-cards-list {
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .combo-card-name {
    color: var(--accent-green);
  }

  .combo-template {
    color: var(--text-muted);
    font-style: italic;
    font-weight: 400;
  }

  .combo-tags {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-shrink: 0;
  }

  .combo-bracket-tag {
    background: rgba(168, 85, 247, 0.2);
    color: var(--accent-purple);
    padding: 2px 10px;
    border-radius: 100px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .combo-link {
    font-size: 0.8rem;
    color: var(--accent-green);
    white-space: nowrap;
  }

  .combo-produces {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .combo-feature-badge {
    background: rgba(52, 211, 153, 0.12);
    color: var(--accent-green);
    padding: 4px 12px;
    border-radius: 100px;
    font-size: 0.8rem;
    font-weight: 500;
    border: 1px solid rgba(52, 211, 153, 0.25);
  }

  .combo-prereqs {
    color: var(--text-secondary);
    font-size: 0.85rem;
    margin-bottom: 0.75rem;
  }

  .combo-description {
    color: var(--text-secondary);
    font-size: 0.85rem;
    line-height: 1.6;
    margin-bottom: 1rem;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-sm);
    border: 1px solid var(--glass-border);
  }

  .combo-description p {
    margin-bottom: 0.25rem;
  }

  .combo-description p:last-child {
    margin-bottom: 0;
  }

  .combo-card-images {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .combo-card-img {
    width: 100px;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    transition: transform 0.2s;
  }

  .combo-card-img:hover {
    transform: scale(1.08);
  }

  .combo-count-badge {
    position: absolute;
    top: 10px;
    left: 10px;
    background: rgba(168, 85, 247, 0.85);
    color: #fff;
    padding: 3px 8px;
    border-radius: 100px;
    font-size: 0.65rem;
    font-weight: 700;
    z-index: 2;
    letter-spacing: 0.3px;
    display: flex;
    align-items: center;
    gap: 3px;
  }

  /* ─── Potential Cards Section ────────────── */

  .potential-section {
    border-top: 1px solid var(--glass-border);
    padding-top: 2rem;
    margin-top: 1rem;
    margin-bottom: 2rem;
  }

  .potential-cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1rem;
  }

  .potential-card {
    background: var(--glass);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: var(--radius-md);
    padding: 1.25rem;
    border: 1px solid rgba(240, 192, 64, 0.2);
    transition: border-color 0.3s, box-shadow 0.3s;
  }

  .potential-card:hover {
    border-color: rgba(240, 192, 64, 0.5);
    box-shadow: 0 4px 20px rgba(240, 192, 64, 0.08);
  }

  .potential-card-main {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  }

  .potential-card-img {
    width: 80px;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    flex-shrink: 0;
  }

  .potential-card-info {
    flex: 1;
    min-width: 0;
  }

  .potential-card-name {
    font-size: 1rem;
    font-weight: 600;
    color: #f0c040;
    margin-bottom: 0.25rem;
  }

  .potential-card-count {
    font-size: 0.85rem;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
  }

  .potential-card-count strong {
    color: var(--text-primary);
  }

  .potential-card-combos {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .potential-combo-link {
    font-size: 0.78rem;
    color: var(--accent-green);
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .potential-combo-link:hover {
    color: #6ee7b7;
    text-decoration: underline;
  }

  /* ─── Loading Page ───────────────────────── */

  .loading-container {
    max-width: 600px;
    margin: 0 auto;
    padding: 4rem 2rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .loading-spinner-wrapper {
    margin-bottom: 2rem;
  }

  .loading-spinner {
    width: 64px;
    height: 64px;
    border: 4px solid var(--glass-border);
    border-top-color: var(--accent-purple);
    border-right-color: var(--accent-green);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .loading-title {
    font-size: 1.8rem;
    font-weight: 700;
    background: var(--accent-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 2rem;
  }

  .loading-progress-container {
    width: 100%;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 100px;
    height: 20px;
    overflow: hidden;
    border: 1px solid var(--glass-border);
    margin-bottom: 0.5rem;
  }

  .loading-progress-bar {
    height: 100%;
    background: var(--accent-gradient);
    border-radius: 100px;
    transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .loading-progress-bar.error {
    background: linear-gradient(135deg, #f87171, #dc2626);
  }

  .loading-progress-text {
    font-size: 0.9rem;
    color: var(--text-muted);
    font-weight: 600;
    margin-bottom: 1.5rem;
  }

  .loading-status {
    font-size: 1.1rem;
    color: var(--text-primary);
    font-weight: 500;
    margin-bottom: 0.25rem;
    min-height: 1.5rem;
  }

  .loading-detail {
    font-size: 0.9rem;
    color: var(--text-secondary);
    font-style: italic;
    margin-bottom: 2rem;
    min-height: 1.2rem;
  }

  .loading-phases {
    width: 100%;
    max-width: 320px;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-bottom: 2.5rem;
    text-align: left;
  }

  .phase-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 1rem;
    border-radius: var(--radius-sm);
    background: var(--glass);
    border: 1px solid var(--glass-border);
    transition: border-color 0.3s, background 0.3s;
  }

  .phase-item.active {
    border-color: var(--accent-purple);
    background: rgba(168, 85, 247, 0.08);
  }

  .phase-item.done {
    border-color: var(--accent-green);
    background: rgba(52, 211, 153, 0.06);
  }

  .phase-icon {
    font-size: 1rem;
    width: 1.5rem;
    text-align: center;
    flex-shrink: 0;
  }

  .phase-item.done .phase-icon {
    color: var(--accent-green);
  }

  .phase-item.active .phase-icon {
    color: var(--accent-purple);
  }

  .phase-label {
    font-size: 0.88rem;
    color: var(--text-secondary);
  }

  .phase-item.active .phase-label {
    color: var(--text-primary);
    font-weight: 500;
  }

  .phase-item.done .phase-label {
    color: var(--accent-green);
  }

  .loading-hint {
    color: var(--text-muted);
    font-size: 0.82rem;
    line-height: 1.6;
  }

  /* ─── Build a cEDH Deck Page ─────────────── */

  .cedh-matches {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    margin-bottom: 4rem;
  }

  .cedh-match {
    position: relative;
    display: flex;
    gap: 1.5rem;
    background: var(--glass);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
    transition: border-color 0.3s, box-shadow 0.3s, transform 0.2s;
  }

  .cedh-match:hover {
    border-color: rgba(255, 255, 255, 0.14);
    transform: translateY(-2px);
  }

  .cedh-match-hero {
    border-color: var(--filled-border);
    box-shadow: 0 0 32px rgba(52, 211, 153, 0.08);
    background: rgba(52, 211, 153, 0.04);
  }

  .cedh-match-rank {
    position: absolute;
    top: 1rem;
    right: 1.25rem;
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--text-muted);
    opacity: 0.6;
  }

  .cedh-match-hero .cedh-match-rank {
    color: var(--accent-green);
    opacity: 0.9;
  }

  .cedh-match-img {
    width: 120px;
    height: auto;
    align-self: flex-start;
    border-radius: var(--radius-md);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
    flex-shrink: 0;
  }

  .cedh-match-hero .cedh-match-img {
    width: 160px;
  }

  .cedh-match-body {
    flex: 1;
    min-width: 0;
  }

  .cedh-match-colors {
    display: flex;
    gap: 4px;
    margin-bottom: 0.5rem;
  }

  .cedh-match-colors img {
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
  }

  .cedh-match-title {
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 0.2rem;
  }

  .cedh-match-hero .cedh-match-title {
    background: var(--accent-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .cedh-match-subtitle {
    color: var(--accent-green);
    font-size: 0.9rem;
    font-weight: 600;
    margin-bottom: 1rem;
  }

  .cedh-match-bar-container {
    background: rgba(255, 255, 255, 0.06);
    border-radius: 100px;
    height: 14px;
    overflow: hidden;
    border: 1px solid var(--glass-border);
    max-width: 520px;
    margin-bottom: 0.5rem;
  }

  .cedh-match-bar {
    height: 100%;
    background: var(--accent-gradient);
    border-radius: 100px;
    transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .cedh-match-stats {
    color: var(--text-secondary);
    font-size: 0.92rem;
    margin-bottom: 0.75rem;
  }

  .cedh-match-stats strong {
    color: var(--accent-green);
    font-size: 1.05rem;
  }

  .cedh-match-missing-count {
    color: #f0c040;
  }

  .cedh-match-price {
    color: var(--accent-green);
    font-weight: 600;
  }

  .cedh-fx-note {
    color: var(--text-muted);
    font-size: 0.85rem;
    margin-top: 0.75rem;
  }

  .cedh-fx-note strong {
    color: var(--text-secondary);
  }

  .cedh-match-actions {
    margin-bottom: 0.5rem;
  }

  .cedh-match-link {
    font-size: 0.85rem;
    color: #a9c7ff;
    font-weight: 600;
  }

  .cedh-match-link:hover {
    color: #cfe0ff;
    text-decoration: underline;
  }

  .cedh-missing {
    margin-top: 0.75rem;
    border-top: 1px solid var(--glass-border);
    padding-top: 0.75rem;
  }

  .cedh-missing summary {
    cursor: pointer;
    color: #f0c040;
    font-size: 0.88rem;
    font-weight: 600;
    user-select: none;
  }

  .cedh-missing summary:hover {
    color: #ffd870;
  }

  .cedh-missing-note {
    color: var(--text-muted);
    font-weight: 400;
  }

  /* Legend: owned vs missing */
  .cedh-legend {
    display: flex;
    gap: 1.25rem;
    padding: 0.75rem 0 0.25rem;
    font-size: 0.78rem;
    font-weight: 600;
  }

  .cedh-legend-item.is-missing { color: #f0c040; }
  .cedh-legend-item.is-owned { color: var(--accent-green); }

  /* Card groups by type */
  .cedh-groups {
    columns: 2;
    column-gap: 1.75rem;
    padding-top: 0.5rem;
  }

  .cedh-group {
    break-inside: avoid;
    margin-bottom: 1rem;
  }

  .cedh-group-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    padding-bottom: 0.3rem;
    margin-bottom: 0.3rem;
    border-bottom: 1px solid var(--glass-border);
  }

  .cedh-group-type {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-primary);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .cedh-group-counts {
    font-size: 0.72rem;
    font-weight: 600;
  }

  .cedh-group-missing { color: #f0c040; }
  .cedh-group-owned { color: var(--accent-green); }

  .cedh-card-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .cedh-card-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.75rem;
    padding: 2px 0;
  }

  .cedh-card-row .cedh-card-name {
    font-size: 0.84rem;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cedh-card-row .cedh-card-price {
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* Missing cards: amber, prominent. Owned: green, dimmed with a check. */
  .cedh-card-row.is-missing .cedh-card-name { color: var(--text-secondary); }
  .cedh-card-row.is-missing .cedh-card-price { color: #f0c040; }

  .cedh-card-row.is-owned { opacity: 0.7; }
  .cedh-card-row.is-owned .cedh-card-name { color: var(--accent-green); }
  .cedh-card-row.is-owned .cedh-card-price { color: var(--text-muted); }

  .cedh-card-check { color: var(--accent-green); font-weight: 700; }

  .cedh-mana-cost {
    display: inline-flex;
    gap: 2px;
    align-items: center;
    margin-left: 5px;
    vertical-align: middle;
  }

  .cedh-mana-cost img {
    width: 13px;
    height: 13px;
  }

  .cedh-card-link {
    color: inherit;
    text-decoration: none;
  }

  .cedh-card-link:hover {
    color: inherit;
    text-decoration: underline;
  }

  /* ─── User Collection Decks ──────────────── */

  .cedh-collection-section {
    margin-bottom: 3rem;
  }

  .cedh-userdecks-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 1.25rem;
  }

  .cedh-userdeck {
    position: relative;
    display: block;
    border-radius: var(--radius-md);
    overflow: hidden;
    border: 1px solid var(--glass-border);
    background: var(--bg-surface);
    min-height: 150px;
    transition: transform 0.2s, border-color 0.3s, box-shadow 0.3s;
    text-decoration: none;
  }

  .cedh-userdeck:hover {
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.14);
    box-shadow: 0 10px 32px rgba(0, 0, 0, 0.3);
    text-decoration: none;
  }

  .cedh-userdeck-art {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    z-index: 0;
  }

  .cedh-userdeck-art::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      rgba(10, 10, 18, 0.2) 0%,
      rgba(10, 10, 18, 0.6) 50%,
      rgba(10, 10, 18, 0.94) 100%
    );
  }

  .cedh-userdeck-body {
    position: relative;
    z-index: 1;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    min-height: 150px;
  }

  .cedh-userdeck-colors {
    display: flex;
    gap: 3px;
    margin-bottom: 0.4rem;
  }

  .cedh-userdeck-colors img {
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
  }

  .cedh-userdeck-name {
    font-size: 0.95rem;
    font-weight: 700;
    color: #fff;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  }

  .cedh-userdeck-cmdr {
    color: #6ee7b7;
    font-size: 0.82rem;
    font-weight: 600;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.95);
  }

  .cedh-userdeck-count {
    color: #cfc9dd;
    font-size: 0.75rem;
    margin-top: 0.15rem;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.95);
  }

  /* ─── Home mode toggle ───────────────────── */

  .mode-toggle {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
    border: 0;
    padding: 0;
    margin-inline: 0;
  }

  .mode-option {
    position: relative;
    cursor: pointer;
  }

  .mode-option input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .mode-option-label {
    display: block;
    padding: 0.65rem 1.5rem;
    border-radius: 100px;
    border: 1px solid var(--glass-border);
    background: var(--glass);
    color: var(--text-secondary);
    font-size: 0.92rem;
    font-weight: 600;
    transition: border-color 0.2s, color 0.2s, background 0.2s;
  }

  .mode-option input:checked + .mode-option-label {
    border-color: var(--accent-purple);
    background: rgba(168, 85, 247, 0.12);
    color: var(--text-primary);
  }

  .mode-option input:focus-visible + .mode-option-label {
    outline: 3px solid var(--accent-green);
    outline-offset: 2px;
  }

  /* ─── Board provenance badge (sideboard/considering) ─── */

  .board-badge {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 7px;
    border-radius: 100px;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    vertical-align: middle;
    white-space: nowrap;
  }

  /* Sideboard: amber. Considering (maybeboard): blue. */
  .board-badge-sideboard {
    background: rgba(240, 192, 64, 0.18);
    color: #f0c040;
    border: 1px solid rgba(240, 192, 64, 0.4);
  }

  .board-badge-maybeboard {
    background: rgba(96, 165, 250, 0.18);
    color: #93c5fd;
    border: 1px solid rgba(96, 165, 250, 0.4);
  }

  /* Overlay variant used on the Build owned-card image (corner ribbon). */
  .build-owned-imgwrap {
    position: relative;
    line-height: 0;
  }

  .build-owned-badge {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 2;
    line-height: normal;
  }

  .build-owned-badge .board-badge {
    margin-left: 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  /* ─── Build a Commander results page ─────── */

  .build-commander-art {
    display: flex;
    justify-content: center;
    gap: 1.25rem;
    flex-wrap: wrap;
    margin: 1.5rem 0;
  }

  .build-commander-art img {
    width: 220px;
    max-width: 60vw;
    border-radius: 14px;
    box-shadow: 0 10px 32px rgba(0, 0, 0, 0.5),
                0 0 40px rgba(168, 85, 247, 0.12);
    transition: transform 0.2s, box-shadow 0.2s;
    display: block;
  }

  .build-commander-art-link { display: inline-block; line-height: 0; }

  .build-commander-art-link:hover img {
    transform: translateY(-4px) scale(1.02);
    box-shadow: 0 16px 44px rgba(0, 0, 0, 0.55),
                0 0 56px rgba(52, 211, 153, 0.18);
  }

  .build-commander-slot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
  }

  .build-commander-noimg {
    width: 220px;
    max-width: 60vw;
    aspect-ratio: 5 / 7;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 0.75rem;
    border-radius: 14px;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    color: var(--text-secondary);
    font-size: 0.85rem;
  }

  .build-commander-role {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .build-commander-companion .build-commander-role {
    color: #f0c040;
  }

  .build-edhrec-rank {
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.95rem;
    margin-bottom: 0.75rem;
  }

  .build-edhrec-rank strong {
    color: var(--accent-purple);
    font-weight: 700;
  }

  .build-selection {
    color: var(--text-secondary);
    font-size: 1.05rem;
    margin-bottom: 0.75rem;
  }

  .build-selection strong { color: var(--accent-green); }

  .build-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    justify-content: center;
    margin: 0 auto 2.5rem;
    max-width: 720px;
  }

  .build-summary-stat {
    flex: 1 1 140px;
    background: var(--glass);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    padding: 1rem 1.25rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .build-summary-num {
    font-size: 1.5rem;
    font-weight: 800;
    background: var(--accent-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .build-summary-label {
    font-size: 0.78rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .build-sections {
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
  }

  .build-section {
    background: var(--glass);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    padding: 1.75rem 2rem;
    /* Long page with many sections — skip rendering off-screen ones. */
    content-visibility: auto;
    contain-intrinsic-size: auto 480px;
  }

  .build-section-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    flex-wrap: wrap;
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--text-primary);
    padding-bottom: 0.85rem;
    margin-bottom: 1.25rem;
    border-bottom: 1px solid var(--glass-border);
  }

  .build-section-meta {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .build-section-empty {
    color: var(--text-muted);
    font-size: 0.9rem;
    font-style: italic;
    margin-bottom: 0.5rem;
  }

  /* Owned cards: image gallery grouped by type */
  .build-owned-groups {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .build-subtype-header {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .build-subtype-count {
    background: rgba(52, 211, 153, 0.15);
    color: var(--accent-green);
    padding: 1px 8px;
    border-radius: 100px;
    font-size: 0.72rem;
  }

  .build-owned-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 1rem;
  }

  .build-owned-card {
    display: flex;
    flex-direction: column;
  }

  .build-owned-link { text-decoration: none; color: inherit; }
  .build-owned-link:hover { text-decoration: none; color: inherit; }

  .build-owned-img {
    width: 100%;
    aspect-ratio: 488 / 680;
    object-fit: cover;
    border-radius: 10px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    transition: transform 0.15s, box-shadow 0.2s;
    display: block;
  }

  .build-owned-card:hover .build-owned-img {
    transform: translateY(-3px);
    box-shadow: 0 10px 28px rgba(52, 211, 153, 0.18);
  }

  .build-owned-noimg {
    width: 100%;
    aspect-ratio: 488 / 680;
    border-radius: 10px;
    border: 1px solid var(--glass-border);
    background: var(--bg-surface);
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 0.75rem;
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .build-owned-caption {
    margin-top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .build-owned-name {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .build-owned-decks {
    font-size: 0.75rem;
    color: var(--accent-green);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Considering: collapsible image gallery (sideboard / maybeboard) */
  .build-considering {
    margin-top: 1.25rem;
    border-top: 1px dashed var(--glass-border);
    padding-top: 1rem;
  }

  .build-considering summary {
    cursor: pointer;
    color: var(--text-secondary);
    font-size: 0.88rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
  }

  .build-considering summary:hover { color: var(--text-primary); }

  /* To-buy: collapsible text list (cEDH decklist style) */
  .build-tobuy {
    margin-top: 1.5rem;
    border-top: 1px solid var(--glass-border);
    padding-top: 1rem;
  }

  .build-tobuy summary {
    cursor: pointer;
    color: #f0c040;
    font-size: 0.9rem;
    font-weight: 600;
    user-select: none;
  }

  .build-tobuy summary:hover { color: #ffd870; }

  .build-tobuy-groups {
    columns: 2;
    column-gap: 1.75rem;
    padding-top: 1rem;
  }

  .build-tobuy-group {
    break-inside: avoid;
    margin-bottom: 1rem;
  }

  .build-tobuy-group-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    padding-bottom: 0.3rem;
    margin-bottom: 0.3rem;
    border-bottom: 1px solid var(--glass-border);
  }

  .build-tobuy-group-type {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-primary);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .build-tobuy-group-count {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .build-tobuy-list { list-style: none; padding: 0; margin: 0; }

  .build-tobuy-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.75rem;
    padding: 2px 0;
  }

  .build-tobuy-name {
    font-size: 0.84rem;
    color: var(--text-secondary);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .build-tobuy-link { color: var(--text-secondary); text-decoration: none; }
  .build-tobuy-link:hover { color: var(--accent-green); text-decoration: underline; }

  .build-tobuy-price {
    font-size: 0.8rem;
    font-weight: 600;
    color: #f0c040;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* ─── Build a Commander fields + autocomplete ─── */

  .commander-fields {
    border: 0;
    padding: 0;
    margin: 1.25rem 0 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .commander-fields[hidden] { display: none; }

  .commander-field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    text-align: left;
  }

  .commander-field > label {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-secondary);
    padding-left: 0.25rem;
  }

  .field-required { color: var(--accent-green); font-weight: 600; }
  .field-optional { color: var(--text-muted); font-weight: 400; }

  /* Wrapper is the positioning context for the suggestion dropdown. */
  .autocomplete {
    position: relative;
    width: 100%;
  }

  .autocomplete input {
    width: 100%;
    padding: 0.9rem 1.25rem;
    border-radius: var(--radius-md);
    border: 1px solid rgba(168, 85, 247, 0.3);
    background: rgba(30, 20, 60, 0.9);
    color: #fff;
    font-size: 1rem;
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    -webkit-appearance: none;
    appearance: none;
    color-scheme: dark;
  }

  .autocomplete input::placeholder { color: rgba(200, 190, 220, 0.5); }

  .autocomplete input:focus {
    border-color: var(--accent-purple);
    box-shadow: 0 0 0 4px rgba(168, 85, 247, 0.2);
  }

  .autocomplete input:-webkit-autofill,
  .autocomplete input:-webkit-autofill:hover,
  .autocomplete input:-webkit-autofill:focus {
    -webkit-box-shadow: 0 0 0 1000px rgba(30, 20, 60, 1) inset;
    -webkit-text-fill-color: #fff;
    border: 1px solid rgba(168, 85, 247, 0.3);
  }

  /* Suggestion dropdown: floats over following content. */
  .autocomplete-list {
    list-style: none;
    margin: 0;
    padding: 0.35rem;
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    z-index: 50;
    max-height: 280px;
    overflow-y: auto;
    background: rgba(24, 18, 45, 0.98);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  }

  .autocomplete-list[hidden] { display: none; }

  .autocomplete-item {
    padding: 0.6rem 0.85rem;
    border-radius: var(--radius-sm);
    font-size: 0.95rem;
    color: var(--text-primary);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .autocomplete-item:hover,
  .autocomplete-item.active {
    background: rgba(168, 85, 247, 0.18);
    color: #fff;
  }

  /* ─── Responsive ────────────────────────── */

  @media (max-width: 768px) {
    main { padding: 1.5rem 1rem; }
    .hero { padding: 3rem 0 2rem; }
    .hero h1 { font-size: 2.2rem; }
    .features { grid-template-columns: 1fr; }
    .slots-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
    .search-form { flex-direction: column; }
    .decklist-grid { grid-template-columns: 1fr; }
    .header-inner { padding: 0.75rem 1rem; }
    .bg-glow { display: none; }
    .combo-header { flex-direction: column; }
    .combo-card-images { gap: 0.5rem; }
    .combo-card-img { width: 80px; }
    .potential-cards-grid { grid-template-columns: 1fr; }
    .potential-card-img { width: 60px; }
    .loading-container { padding: 2rem 1rem; }
    .loading-title { font-size: 1.4rem; }
    .loading-spinner { width: 48px; height: 48px; }
    .cedh-match { flex-direction: column; }
    .cedh-match-img, .cedh-match-hero .cedh-match-img { width: 100px; }
    .cedh-groups { columns: 1; }
    .cedh-userdecks-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
    .build-tobuy-groups { columns: 1; }
    .build-owned-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
    .build-section { padding: 1.25rem 1rem; }
  }

  /* ─── Accessibility: Keyboard Focus ─────── */

  a:focus-visible,
  button:focus-visible,
  input:focus-visible,
  [tabindex]:focus-visible {
    outline: 3px solid var(--accent-green);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .slot-card a:focus-visible {
    outline: 3px solid #fff;
    outline-offset: 3px;
  }

  /* ─── Accessibility: Reduced Motion ─────── */

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
      scroll-behavior: auto !important;
    }

    /* Multi-deck slots animate art/info by fading between decks.
       With motion disabled, pin them to the first deck so nothing
       is stuck invisible. */
    .slot-art.slot-art-cycle,
    .deck-info.deck-info-cycle {
      opacity: 1 !important;
    }

    .slot-art.slot-art-cycle:not(:first-of-type) {
      display: none;
    }

    .deck-info.deck-info-cycle:not(:first-of-type) {
      display: none;
    }

    .loading-spinner {
      animation: none !important;
      border-top-color: var(--accent-purple);
    }
  }
`;
