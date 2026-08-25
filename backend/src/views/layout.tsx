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
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <style>{css}</style>
      </head>
      <body>
        <div class="bg-glow bg-glow-1" />
        <div class="bg-glow bg-glow-2" />
        <div class="bg-glow bg-glow-3" />
        <header>
          <div class="header-inner">
            <a href="/" class="logo">🃏 EDH 32</a>
            <nav>
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
    --text-secondary: #a8a3b8;
    --text-muted: #6b6580;
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
    background: var(--glass);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    transition: transform 0.25s, border-color 0.3s, box-shadow 0.3s;
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
    opacity: 0.5;
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
  }

  .slot-art::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      rgba(10, 10, 18, 0.2) 0%,
      rgba(10, 10, 18, 0.88) 100%
    );
    backdrop-filter: blur(1px);
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
    color: var(--accent-green);
    font-size: 0.9rem;
    font-weight: 600;
  }

  .deck-name {
    color: var(--text-secondary);
    font-size: 0.8rem;
    font-style: italic;
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
  }

  @keyframes deckFade {
    0%   { opacity: 0; }
    5%   { opacity: 1; }
    45%  { opacity: 1; }
    50%  { opacity: 0; }
    100% { opacity: 0; }
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
  }
`;
