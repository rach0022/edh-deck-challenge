/**
 * Firefox challenge grid centering — Bugfix spec `firefox-challenge-grid-centering`.
 *
 * Property 1: Bug Condition — Roster Stays Gapless and Centered in Firefox.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4**
 *
 * ─── What this test does ──────────────────────────────────────────────────────
 *
 * The defect is a browser-specific layout difference: in Firefox (Gecko) the
 * 32-slot `.roster-grid-challenge` renders off-center / wraps a trailing tile,
 * while Chromium renders it flush and centered. The root cause (see bugfix.md /
 * design.md) is sub-pixel rounding of percentage-based flex-item widths:
 *
 *   .roster-grid-challenge        { display: flex; flex-wrap: wrap;
 *                                   justify-content: center; gap: 0; }
 *   .roster-grid-challenge .roster-slot {
 *                                   flex: 0 0 calc(100% / var(--roster-cols));
 *                                   max-width: calc(100% / var(--roster-cols)); }
 *
 * When the container inner width is not an exact integer multiple of the column
 * count, `100% / cols` is fractional. Firefox rounds each flex item's used width
 * independently, so a row of N tiles sums to slightly less than the container;
 * `justify-content: center` then splits the leftover slack into left/right
 * margin, shifting the gapless mosaic (and, with enough undershoot, wrapping the
 * trailing tile to the next row).
 *
 * There is no real browser in this (Node/vitest) test environment, so we drive
 * the assertions off a faithful MODEL of the two things that actually matter:
 *
 *   1. The container's layout mode + per-tile sizing, read from the REAL
 *      compiled CSS in the rendered challenge page (`src/views/challenge.tsx`
 *      via `src/views/layout.tsx`). We render the page to HTML, extract the
 *      `.roster-grid-challenge` rules from its `<style>` block, and classify the
 *      layout as either "flex-percentage" (today) or "grid-fr" (after the fix).
 *   2. Gecko's documented layout math for each mode:
 *        - flex-percentage: each tile width = floor(container * 100% / cols) to
 *          device pixels, rounded INDEPENDENTLY → the row can undershoot, the
 *          remainder becomes center margin, and a large undershoot wraps a tile.
 *        - grid-fr (`repeat(cols, 1fr)`): the grid algorithm distributes the
 *          full inner width across the tracks in a single step so the row always
 *          fills the container edge-to-edge (slack ≈ 0, no wrap, centered).
 *
 * Because the model reads the real CSS, this SAME test:
 *   - FAILS now (flex percentage widths) — proving the Firefox slack/offset/wrap.
 *   - PASSES after task 3 converts the container to `grid-template-columns:
 *     repeat(var(--roster-cols), 1fr)` — validating the expected behavior.
 *
 * This test is intentionally NOT fixed when it fails on the unfixed code; its
 * failure is the evidence that the bug exists.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { ChallengePage } from '../src/views/challenge.js';
import type { ChallengeResponse } from '../src/types.js';
import * as fc from 'fast-check';

// ─── Render the real challenge page and extract the real roster CSS ──────────

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

/** The compiled CSS text from the page's single <style> block. */
function extractCss(html: string): string {
  const match = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (!match) throw new Error('No <style> block found in rendered challenge page');
  return match[1];
}

/**
 * Grabs the body of the first `.roster-grid-challenge { ... }` rule (the base
 * container rule, not a media-query override or a descendant rule). We skip any
 * occurrence immediately followed by a descendant selector (e.g.
 * `.roster-grid-challenge .roster-slot`).
 */
function containerRuleBody(css: string): string {
  const re = /\.roster-grid-challenge\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const body = m[1];
    // The base rule declares the layout mode (display: ...). Media-query
    // overrides only set --roster-cols / max-width, so pick the one with display.
    if (/display\s*:/.test(body)) return body;
  }
  // Fall back to the first match if none declared display (shouldn't happen).
  const first = css.match(/\.roster-grid-challenge\s*\{([^}]*)\}/);
  if (!first) throw new Error('No .roster-grid-challenge rule found in compiled CSS');
  return first[1];
}

/** Body of the `.roster-grid-challenge .roster-slot { ... }` descendant rule, if present. */
function slotRuleBody(css: string): string | null {
  const m = css.match(/\.roster-grid-challenge\s+\.roster-slot\s*\{([^}]*)\}/);
  return m ? m[1] : null;
}

type LayoutMode = 'flex-percentage' | 'grid-fr' | 'unknown';

/**
 * Classifies the roster layout from the REAL compiled CSS.
 *   - 'flex-percentage': container is flex and tiles use calc(100%/cols) basis.
 *   - 'grid-fr': container is grid with repeat(var(--roster-cols), 1fr) tracks.
 */
function classifyLayout(css: string): LayoutMode {
  const container = containerRuleBody(css);
  const slot = slotRuleBody(css) ?? '';

  const isGrid = /display\s*:\s*grid/.test(container);
  const hasFrTracks = /grid-template-columns\s*:\s*repeat\(\s*var\(--roster-cols\)\s*,\s*1fr\s*\)/.test(
    container,
  );
  if (isGrid && hasFrTracks) return 'grid-fr';

  const isFlex = /display\s*:\s*flex/.test(container);
  const hasPercentBasis = /calc\(\s*100%\s*\/\s*var\(--roster-cols\)\s*\)/.test(slot);
  if (isFlex && hasPercentBasis) return 'flex-percentage';

  return 'unknown';
}

// ─── Rendering models for the two engines / layout modes ─────────────────────

interface RenderContext {
  browserEngine: 'Gecko' | 'Blink';
  containerInnerWidthPx: number;
  columnCount: number;
}

interface RenderResult {
  rowTileCount: number; // tiles that fit on the first row
  residualHorizontalSlackPx: number; // container width minus summed row width
  isCentered: boolean; // mosaic sits flush/centered with no stray offset
}

/** The bug condition from design.md / bugfix.md. */
function isBugCondition(x: RenderContext): boolean {
  return x.browserEngine === 'Gecko' && x.containerInnerWidthPx % x.columnCount !== 0;
}

/**
 * Models how a Gecko engine lays out ONE row of `.roster-slot` tiles for the
 * current `.roster-grid-challenge` layout mode.
 *
 * flex-percentage (today): each tile's used width is `100% / cols` of the
 *   container, rounded to a whole device pixel INDEPENDENTLY. N such tiles sum
 *   to `N * floor(container / cols)`, which undershoots the container whenever
 *   the width is not divisible by the column count. `justify-content: center`
 *   splits that undershoot into left/right margin (non-zero offset → not
 *   centered flush). If the undershoot is large enough that an extra whole tile
 *   width would still not fit AND the slack exceeds a tile, a trailing tile
 *   wraps; more importantly, the row no longer fills the container.
 *
 * grid-fr (after fix): `repeat(cols, 1fr)` distributes the full inner width in a
 *   single step, so the tracks always sum to the container (slack ≈ 0), exactly
 *   `cols` tiles sit on the row, and there is no leftover margin to shift the
 *   mosaic.
 */
function renderRow(x: RenderContext, mode: LayoutMode): RenderResult {
  if (mode === 'grid-fr') {
    // CSS Grid fractional tracks fill the row edge-to-edge on every engine.
    return {
      rowTileCount: x.columnCount,
      residualHorizontalSlackPx: 0,
      isCentered: true,
    };
  }

  // flex-percentage (or unknown → treat as the current flex behavior).
  if (x.browserEngine === 'Blink') {
    // Chromium absorbs the sub-pixel remainder: row fills the container.
    return {
      rowTileCount: x.columnCount,
      residualHorizontalSlackPx: 0,
      isCentered: true,
    };
  }

  // Gecko: round each tile independently to a whole device pixel.
  const tileWidth = Math.floor(x.containerInnerWidthPx / x.columnCount);
  const summedRowWidth = tileWidth * x.columnCount;
  const slack = x.containerInnerWidthPx - summedRowWidth;

  // Does a trailing tile wrap? When the per-row undershoot is large relative to
  // a tile, the engine can fit one fewer whole tile on the first row.
  // (With pure floor rounding the row still holds `cols` tiles, but the leftover
  // slack is what visibly breaks the layout — modeled below.)
  const rowTileCount = x.columnCount;

  return {
    rowTileCount,
    residualHorizontalSlackPx: slack,
    // justify-content: center splits any slack into margins → mosaic shifted.
    isCentered: slack === 0,
  };
}

// ─── Width arbitraries, incl. the design's test-case widths ──────────────────

/**
 * Resolves the desktop height-aware cap
 *   min(100%, max(760px, calc((100vh - 320px) / 4 * 0.75 * 8)))
 * for a given viewport height. We ignore the `100%` branch (content column) and
 * compute the height-driven candidate against the 760px floor; the result is
 * typically fractional, which is exactly the width class that triggers the bug.
 */
function heightAwareCapWidth(viewportHeightPx: number): number {
  const heightDriven = ((viewportHeightPx - 320) / 4) * 0.75 * 8;
  return Math.max(760, heightDriven);
}

/** A width whose floor is NOT divisible by `cols` (so the bug condition holds). */
function arbNonDivisibleWidth(cols: number): fc.Arbitrary<number> {
  return fc
    .integer({ min: 320, max: 2400 })
    .map((w) => (w % cols === 0 ? w + 1 : w)); // nudge to guarantee non-divisibility
}

describe('Firefox challenge roster grid stays gapless and centered - Property 1 (Bug Condition)', () => {
  it('exposes the real roster layout mode from the compiled CSS (diagnostic)', async () => {
    const css = extractCss(await renderChallengeHtml());
    const mode = classifyLayout(css);
    // Not an assertion on which mode — just surfaces it in the test output so the
    // counterexamples below are interpretable.
    // eslint-disable-next-line no-console
    console.log(`[roster layout] detected mode = "${mode}"`);
    expect(['flex-percentage', 'grid-fr', 'unknown']).toContain(mode);
  });

  // **Validates: Requirements 2.1, 2.2, 2.3** — desktop 8-column, non-divisible widths.
  it('Property 1: Gecko row fills the container, stays centered, keeps 8 tiles/row (desktop)', async () => {
    const mode = classifyLayout(extractCss(await renderChallengeHtml()));
    fc.assert(
      fc.property(arbNonDivisibleWidth(8), (width) => {
        const ctx: RenderContext = {
          browserEngine: 'Gecko',
          containerInnerWidthPx: width,
          columnCount: 8,
        };
        fc.pre(isBugCondition(ctx)); // only the buggy input domain
        const result = renderRow(ctx, mode);
        expect(result.rowTileCount).toBe(8); // no unintended wrap (2.3)
        expect(Math.abs(result.residualHorizontalSlackPx)).toBeLessThanOrEqual(0.5); // slack ≈ 0 (2.1)
        expect(result.isCentered).toBe(true); // centered like Chromium (2.2)
      }),
      { numRuns: 300 },
    );
  });

  // **Validates: Requirement 2.4** — the desktop height-aware max-width cap.
  it('Property 1: Gecko stays centered and gapless at the height-aware cap width', async () => {
    const mode = classifyLayout(extractCss(await renderChallengeHtml()));
    fc.assert(
      fc.property(fc.integer({ min: 600, max: 1600 }), (viewportHeight) => {
        const width = heightAwareCapWidth(viewportHeight);
        const ctx: RenderContext = {
          browserEngine: 'Gecko',
          // The cap resolves to a fractional width; floor to device pixels.
          containerInnerWidthPx: Math.floor(width),
          columnCount: 8,
        };
        fc.pre(isBugCondition(ctx));
        const result = renderRow(ctx, mode);
        expect(result.rowTileCount).toBe(8);
        expect(Math.abs(result.residualHorizontalSlackPx)).toBeLessThanOrEqual(0.5);
        expect(result.isCentered).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  // **Validates: Requirements 2.1, 2.2, 2.3** — the 6-column breakpoint (≤1200px).
  it('Property 1: Gecko keeps 6 tiles/row gapless and centered at the 6-column breakpoint', async () => {
    const mode = classifyLayout(extractCss(await renderChallengeHtml()));
    fc.assert(
      fc.property(
        fc.integer({ min: 561, max: 1200 }).map((w) => (w % 6 === 0 ? w + 1 : w)),
        (width) => {
          const ctx: RenderContext = {
            browserEngine: 'Gecko',
            containerInnerWidthPx: width,
            columnCount: 6,
          };
          fc.pre(isBugCondition(ctx));
          const result = renderRow(ctx, mode);
          expect(result.rowTileCount).toBe(6);
          expect(Math.abs(result.residualHorizontalSlackPx)).toBeLessThanOrEqual(0.5);
          expect(result.isCentered).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  // **Validates: Requirement 2.3** — the wrap edge case: first-row tile count must be 8.
  it('Property 1: Gecko never wraps a trailing tile (first-row tile count = column count)', async () => {
    const mode = classifyLayout(extractCss(await renderChallengeHtml()));
    fc.assert(
      fc.property(
        fc.constantFrom(8, 6, 4, 3),
        fc.integer({ min: 300, max: 2400 }),
        (cols, baseWidth) => {
          const width = baseWidth % cols === 0 ? baseWidth + 1 : baseWidth;
          const ctx: RenderContext = {
            browserEngine: 'Gecko',
            containerInnerWidthPx: width,
            columnCount: cols,
          };
          fc.pre(isBugCondition(ctx));
          const result = renderRow(ctx, mode);
          // No sub-pixel-rounding-induced wrap: a full row holds exactly `cols`.
          expect(result.rowTileCount).toBe(cols);
          // And it fills the container, so there is no slack to force a wrap.
          expect(Math.abs(result.residualHorizontalSlackPx)).toBeLessThanOrEqual(0.5);
        },
      ),
      { numRuns: 300 },
    );
  });
});
