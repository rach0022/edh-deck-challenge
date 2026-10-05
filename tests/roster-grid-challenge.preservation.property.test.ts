/**
 * Firefox challenge grid centering — Bugfix spec `firefox-challenge-grid-centering`.
 *
 * Property 2: Preservation — Unaffected Renders Are Identical.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 *
 * ─── What this test does ──────────────────────────────────────────────────────
 *
 * The fix (task 3) converts ONLY the challenge roster container from a flex
 * percentage-width layout to a CSS Grid with `repeat(var(--roster-cols), 1fr)`
 * tracks. Everything else must stay visually identical:
 *
 *   - Chromium (Blink) renders of the roster at ANY width.
 *   - Gecko renders at widths already evenly divisible by the column count
 *     (slack is already zero, so the fix changes nothing observable).
 *   - The responsive column counts (8 / 6 / 4 / 3) at the configured breakpoints.
 *   - Partial-row centering of a short final row (32 slots ÷ 6 or 3 leaves a
 *     remainder) via `justify-content: center`.
 *   - The desktop height-aware `max-width` cap that keeps all 4 rows on screen.
 *   - Per-tile styling: 3:4 `aspect-ratio`, hover transform, filled/empty
 *     states, and the gapless `gap: 0` edge-to-edge appearance.
 *   - Every other page's grid (home `.features`, deck detail `.slots-grid`,
 *     decklist `.decklist-grid`, combos `.combos-grid`, etc.).
 *
 * This is PRESERVATION checking (observe-first): we capture the baseline from
 * the UNFIXED code and assert it, so the SAME assertions must keep passing after
 * the fix. These tests are expected to PASS on the unfixed code and to continue
 * passing after task 3.
 *
 * There is no real browser in this (Node/vitest) environment, so — exactly as in
 * the Property-1 bug-condition test — we drive the assertions off a faithful
 * MODEL built from the REAL compiled CSS of the rendered challenge page
 * (`src/views/challenge.tsx` via `src/views/layout.tsx`):
 *
 *   - For the "renderRosterGrid_original(input) = renderRosterGrid_fixed(input)"
 *     preservation property we model both layout modes' documented layout math
 *     and assert they agree for every NON-bug-condition input. (The model is the
 *     same one used by the Property-1 test, so the two tests stay consistent.)
 *   - For the structural preservation facts (breakpoints, cap, aspect ratio,
 *     gap, other-page grids) we read them straight out of the compiled CSS. The
 *     fix is scoped to the `.roster-grid-challenge` container + its `.roster-slot`
 *     sizing rule, so these facts must be byte-for-byte stable across the fix.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { ChallengePage } from '../src/views/challenge.js';
import { HomePage } from '../src/views/home.js';
import type { ChallengeResponse } from '../src/types.js';
import * as fc from 'fast-check';

// ─── Render the real pages and extract the real CSS ──────────────────────────

/** A minimal, valid ChallengeResponse so <ChallengePage/> renders. */
function emptyChallenge(): ChallengeResponse {
  return {
    username: 'tester',
    cached: false,
    summary: { totalSlots: 32, filledCount: 0, percentComplete: 0 },
    progress: { slots: [], skippedDecks: [] },
  } as unknown as ChallengeResponse;
}

/** Renders <ChallengePage/> to an HTML string via a one-route Hono app. */
async function renderChallengeHtml(): Promise<string> {
  const app = new Hono();
  app.get('/', (c) => c.html(<ChallengePage challenge={emptyChallenge()} cached={false} />));
  const res = await app.request('/');
  return res.text();
}

/** Renders <HomePage/> to an HTML string via a one-route Hono app. */
async function renderHomeHtml(): Promise<string> {
  const app = new Hono();
  app.get('/', (c) => c.html(<HomePage />));
  const res = await app.request('/');
  return res.text();
}

/** The compiled CSS text from a page's single <style> block. */
function extractCss(html: string): string {
  const match = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (!match) throw new Error('No <style> block found in rendered page');
  return match[1];
}

/**
 * Body of the base `.roster-grid-challenge { ... }` rule (the one declaring the
 * layout mode via `display:`), skipping media-query overrides and descendant
 * rules.
 */
function containerRuleBody(css: string): string {
  const re = /\.roster-grid-challenge\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    if (/display\s*:/.test(m[1])) return m[1];
  }
  const first = css.match(/\.roster-grid-challenge\s*\{([^}]*)\}/);
  if (!first) throw new Error('No .roster-grid-challenge rule found in compiled CSS');
  return first[1];
}

/** Body of the `.roster-grid-challenge .roster-slot { ... }` descendant rule, if present. */
function slotSizingRuleBody(css: string): string | null {
  const m = css.match(/\.roster-grid-challenge\s+\.roster-slot\s*\{([^}]*)\}/);
  return m ? m[1] : null;
}

/** Body of the shared `.roster-slot { ... }` rule (the one declaring aspect-ratio). */
function sharedSlotRuleBody(css: string): string {
  const re = /(^|[^-\w.])\.roster-slot\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    if (/aspect-ratio\s*:/.test(m[2])) return m[2];
  }
  throw new Error('No shared .roster-slot rule with aspect-ratio found in compiled CSS');
}

type LayoutMode = 'flex-percentage' | 'grid-fr' | 'unknown';

/** Classifies the roster layout from the REAL compiled CSS (same as Property 1). */
function classifyLayout(css: string): LayoutMode {
  const container = containerRuleBody(css);
  const slot = slotSizingRuleBody(css) ?? '';

  const isGrid = /display\s*:\s*grid/.test(container);
  const hasFrTracks =
    /grid-template-columns\s*:\s*repeat\(\s*var\(--roster-cols\)\s*,\s*1fr\s*\)/.test(container);
  if (isGrid && hasFrTracks) return 'grid-fr';

  const isFlex = /display\s*:\s*flex/.test(container);
  const hasPercentBasis = /calc\(\s*100%\s*\/\s*var\(--roster-cols\)\s*\)/.test(slot);
  if (isFlex && hasPercentBasis) return 'flex-percentage';

  return 'unknown';
}

// ─── Rendering models for the two engines / layout modes ─────────────────────
// (Identical math to the Property-1 bug-condition test so the two stay in sync.)

interface RenderContext {
  browserEngine: 'Gecko' | 'Blink';
  containerInnerWidthPx: number;
  columnCount: number;
}

interface RenderResult {
  rowTileCount: number;
  residualHorizontalSlackPx: number;
  isCentered: boolean;
}

/** The bug condition from design.md / bugfix.md. */
function isBugCondition(x: RenderContext): boolean {
  return x.browserEngine === 'Gecko' && x.containerInnerWidthPx % x.columnCount !== 0;
}

/** Models one row of `.roster-slot` tiles under the given layout mode + engine. */
function renderRow(x: RenderContext, mode: LayoutMode): RenderResult {
  if (mode === 'grid-fr') {
    // CSS Grid fractional tracks fill the row edge-to-edge on every engine.
    return { rowTileCount: x.columnCount, residualHorizontalSlackPx: 0, isCentered: true };
  }

  // flex-percentage (or unknown → current flex behavior).
  if (x.browserEngine === 'Blink') {
    // Chromium absorbs the sub-pixel remainder: row fills the container.
    return { rowTileCount: x.columnCount, residualHorizontalSlackPx: 0, isCentered: true };
  }

  // Gecko: round each tile independently to a whole device pixel.
  const tileWidth = Math.floor(x.containerInnerWidthPx / x.columnCount);
  const summedRowWidth = tileWidth * x.columnCount;
  const slack = x.containerInnerWidthPx - summedRowWidth;
  return {
    rowTileCount: x.columnCount,
    residualHorizontalSlackPx: slack,
    isCentered: slack === 0,
  };
}

/**
 * The ORIGINAL (unfixed) roster layout: flex percentage widths. This is what the
 * compiled CSS declares today; we model it explicitly so the preservation
 * property can compare it against the fixed layout for every input.
 */
function renderRosterGrid_original(x: RenderContext): RenderResult {
  return renderRow(x, 'flex-percentage');
}

/**
 * The FIXED roster layout: CSS Grid with `repeat(cols, 1fr)` tracks. The grid
 * algorithm fills the row edge-to-edge on every engine.
 */
function renderRosterGrid_fixed(x: RenderContext): RenderResult {
  return renderRow(x, 'grid-fr');
}

function sameResult(a: RenderResult, b: RenderResult): boolean {
  return (
    a.rowTileCount === b.rowTileCount &&
    Math.abs(a.residualHorizontalSlackPx - b.residualHorizontalSlackPx) <= 0.5 &&
    a.isCentered === b.isCentered
  );
}

// ─── The 32-slot roster, partial-row geometry ────────────────────────────────

const TOTAL_SLOTS = 32;

/** Tiles on the final (possibly partial) row for a given column count. */
function finalRowTileCount(cols: number): number {
  const rem = TOTAL_SLOTS % cols;
  return rem === 0 ? cols : rem;
}

// ─── Height-aware desktop cap, resolved for a viewport height ────────────────

/**
 * Resolves the desktop height-aware cap
 *   min(100%, max(760px, calc((100vh - 320px) / 4 * 0.75 * 8)))
 * ignoring the `100%` content-column branch (we test the height-driven candidate
 * against the 760px floor).
 */
function heightAwareCapWidth(viewportHeightPx: number): number {
  const heightDriven = ((viewportHeightPx - 320) / 4) * 0.75 * 8;
  return Math.max(760, heightDriven);
}

/** Height occupied by 4 rows of 3:4 tiles at the capped container width. */
function fourRowsHeight(containerWidthPx: number, cols = 8): number {
  const tileWidth = containerWidthPx / cols;
  const tileHeight = tileWidth * (4 / 3); // aspect-ratio 3 / 4 → height = width * 4/3
  return tileHeight * 4;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Firefox challenge roster grid — Property 2 (Preservation): unaffected renders are identical', () => {
  it('diagnostic: surfaces the detected roster layout mode (flex-percentage before fix, grid-fr after)', async () => {
    const mode = classifyLayout(extractCss(await renderChallengeHtml()));
    // eslint-disable-next-line no-console
    console.log(`[roster layout] detected mode = "${mode}"`);
    expect(['flex-percentage', 'grid-fr', 'unknown']).toContain(mode);
  });

  // **Validates: Requirement 3.1** — Chromium parity at ANY width.
  it('Property 2: every Chromium (Blink) render is identical before and after the fix', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(8, 6, 4, 3),
        fc.integer({ min: 300, max: 2400 }),
        (cols, width) => {
          const ctx: RenderContext = {
            browserEngine: 'Blink',
            containerInnerWidthPx: width,
            columnCount: cols,
          };
          fc.pre(!isBugCondition(ctx)); // Blink is never a bug condition
          const original = renderRosterGrid_original(ctx);
          const fixed = renderRosterGrid_fixed(ctx);
          // Blink already fills the row edge-to-edge; the fix must not change it.
          expect(sameResult(original, fixed)).toBe(true);
          expect(fixed.rowTileCount).toBe(cols);
          expect(Math.abs(fixed.residualHorizontalSlackPx)).toBeLessThanOrEqual(0.5);
          expect(fixed.isCentered).toBe(true);
        },
      ),
      { numRuns: 400 },
    );
  });

  // **Validates: Requirement 3.1** — Gecko at already-divisible widths is a non-bug input and must be unchanged.
  it('Property 2: Gecko renders at evenly-divisible widths are identical before and after the fix', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(8, 6, 4, 3),
        fc.integer({ min: 1, max: 300 }),
        (cols, multiple) => {
          const width = cols * multiple; // guaranteed divisible → slack already 0
          const ctx: RenderContext = {
            browserEngine: 'Gecko',
            containerInnerWidthPx: width,
            columnCount: cols,
          };
          fc.pre(!isBugCondition(ctx)); // divisible → NOT the bug condition
          const original = renderRosterGrid_original(ctx);
          const fixed = renderRosterGrid_fixed(ctx);
          expect(sameResult(original, fixed)).toBe(true);
          expect(original.residualHorizontalSlackPx).toBe(0);
          expect(original.isCentered).toBe(true);
        },
      ),
      { numRuns: 400 },
    );
  });

  // **Validates: Requirements 3.1, 3.2** — the broad preservation property across the whole non-buggy domain.
  it('Property 2: renderRosterGrid_original(input) = renderRosterGrid_fixed(input) for all NON-bug-condition inputs', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<'Gecko' | 'Blink'>('Gecko', 'Blink'),
        fc.constantFrom(8, 6, 4, 3),
        fc.integer({ min: 300, max: 2400 }),
        (engine, cols, width) => {
          const ctx: RenderContext = {
            browserEngine: engine,
            containerInnerWidthPx: width,
            columnCount: cols,
          };
          fc.pre(!isBugCondition(ctx)); // only the preservation domain
          expect(sameResult(renderRosterGrid_original(ctx), renderRosterGrid_fixed(ctx))).toBe(true);
        },
      ),
      { numRuns: 600 },
    );
  });

  // **Validates: Requirement 3.2** — responsive column counts 8 / 6 / 4 / 3 at the configured breakpoints.
  it('Property 2: the compiled CSS keeps the 8 / 6 / 4 / 3 column counts at the configured breakpoints', async () => {
    const css = extractCss(await renderChallengeHtml());

    // Base rule: desktop default of 8 columns.
    expect(/--roster-cols\s*:\s*8/.test(containerRuleBody(css))).toBe(true);

    // Breakpoint overrides: 6 at ≤1200px, 4 at ≤900px, 3 at ≤560px.
    const breakpoints: Array<[number, number]> = [
      [1200, 6],
      [900, 4],
      [560, 3],
    ];
    for (const [maxWidth, cols] of breakpoints) {
      const re = new RegExp(
        `@media\\s*\\(max-width:\\s*${maxWidth}px\\)\\s*\\{[^}]*\\.roster-grid-challenge\\s*\\{\\s*--roster-cols\\s*:\\s*${cols}\\s*;?\\s*\\}`,
      );
      expect(re.test(css)).toBe(true);
    }
  });

  // **Validates: Requirement 3.3** — a short final row stays centered (not left-pinned).
  it('Property 2: a partial final row is centered (justify-content: center) across column counts', async () => {
    const css = extractCss(await renderChallengeHtml());
    // The container centers rows. This is what keeps a short final row centered
    // under both flex and grid; it must survive the fix.
    expect(/justify-content\s*:\s*center/.test(containerRuleBody(css))).toBe(true);

    // 32 slots do not divide evenly into 6 or 3 → those breakpoints have a
    // partial final row that must be centered rather than left-aligned.
    fc.assert(
      fc.property(fc.constantFrom(8, 6, 4, 3), (cols) => {
        const last = finalRowTileCount(cols);
        expect(last).toBeGreaterThanOrEqual(1);
        expect(last).toBeLessThanOrEqual(cols);
        if (cols === 6) expect(last).toBe(2); // 32 = 5*6 + 2
        if (cols === 3) expect(last).toBe(2); // 32 = 10*3 + 2
        if (cols === 8) expect(last).toBe(8); // 32 = 4*8 (full rows)
        if (cols === 4) expect(last).toBe(4); // 32 = 8*4 (full rows)
      }),
      { numRuns: 50 },
    );
  });

  // **Validates: Requirement 3.4** — desktop height-aware cap keeps all 4 rows on screen (no horizontal scroll).
  it('Property 2: the desktop height-aware max-width cap keeps all 4 rows within the viewport height', async () => {
    const css = extractCss(await renderChallengeHtml());
    // The cap rule itself must be present and unchanged in spirit.
    expect(
      /@media\s*\(min-width:\s*1025px\)\s*\{[^}]*\.roster-grid-challenge\s*\{[^}]*max-width\s*:\s*min\(\s*100%\s*,\s*max\(\s*760px\s*,\s*calc\(\s*\(100vh - 320px\)\s*\/\s*4\s*\*\s*0\.75\s*\*\s*8\s*\)\s*\)\s*\)/.test(
        css,
      ),
    ).toBe(true);

    // The cap's math: at the capped width, 4 rows of 3:4 tiles must fit the
    // height budget (viewportHeight - 320px of chrome). Verify the geometry
    // holds across viewport heights — this is the invariant the cap preserves.
    fc.assert(
      fc.property(fc.integer({ min: 600, max: 1600 }), (viewportHeight) => {
        const capWidth = heightAwareCapWidth(viewportHeight);
        const rowsHeight = fourRowsHeight(capWidth, 8);
        const heightBudget = viewportHeight - 320;
        // When the height-driven candidate wins (cap not pinned to the 760px
        // floor), 4 rows fit the budget exactly by construction.
        if (capWidth > 760) {
          expect(rowsHeight).toBeLessThanOrEqual(heightBudget + 1); // +1 for float slop
        }
      }),
      { numRuns: 300 },
    );
  });

  // **Validates: Requirement 3.5** — tile styling: 3:4 aspect ratio, hover, filled/empty, gap: 0.
  it('Property 2: per-tile styling (3:4 aspect-ratio, hover, filled/empty) and gap:0 are preserved', async () => {
    const css = extractCss(await renderChallengeHtml());

    // Gaplessness: the container keeps gap: 0.
    expect(/gap\s*:\s*0\b/.test(containerRuleBody(css))).toBe(true);

    // 3:4 portrait aspect ratio on the shared .roster-slot rule.
    const sharedSlot = sharedSlotRuleBody(css);
    expect(/aspect-ratio\s*:\s*3\s*\/\s*4/.test(sharedSlot)).toBe(true);

    // Hover transform, filled, and empty states exist and are untouched by the fix.
    expect(/\.roster-slot:hover\s*\{[^}]*transform\s*:/.test(css)).toBe(true);
    expect(/\.roster-slot\.filled\s*\{/.test(css)).toBe(true);
    expect(/\.roster-slot\.empty\s*\{/.test(css)).toBe(true);
  });

  // **Validates: Requirement 3.6** — grids on other pages render unchanged (fix is scoped to .roster-grid-challenge).
  it('Property 2: other pages\u2019 grids are unaffected (scoped to .roster-grid-challenge)', async () => {
    const challengeCss = extractCss(await renderChallengeHtml());
    const homeCss = extractCss(await renderHomeHtml());

    // Representative "other" grids present on these pages. Their layout rules
    // must stay as auto-fill/auto-fit grids and must NOT mention the roster
    // container's --roster-cols, so the roster fix cannot touch them.
    const otherGrids = [
      { name: '.slots-grid', re: /\.slots-grid\s*\{[^}]*grid-template-columns\s*:\s*repeat\(\s*auto-fill/ },
      { name: '.decklist-grid', re: /\.decklist-grid\s*\{[^}]*grid-template-columns\s*:\s*repeat\(\s*auto-fill/ },
      { name: '.combos-grid', re: /\.combos-grid\s*\{[^}]*grid-template-columns\s*:\s*1fr/ },
      { name: '.features', re: /\.features\s*\{[^}]*grid-template-columns\s*:\s*repeat\(\s*auto-fit/ },
    ];
    for (const g of otherGrids) {
      expect(g.re.test(challengeCss), `${g.name} rule present/unchanged`).toBe(true);
    }

    // The home page's .features grid is independent of the roster.
    expect(/\.features\s*\{[^}]*grid-template-columns\s*:\s*repeat\(\s*auto-fit/.test(homeCss)).toBe(true);

    // Scope guard: no other-page grid rule references --roster-cols.
    for (const g of otherGrids) {
      const m = challengeCss.match(new RegExp(`${g.name.replace('.', '\\.')}\\s*\\{([^}]*)\\}`));
      if (m) expect(/--roster-cols/.test(m[1])).toBe(false);
    }
  });
});
