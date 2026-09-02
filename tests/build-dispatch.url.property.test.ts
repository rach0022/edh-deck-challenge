import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildDispatchUrl } from '../src/domain/build-dispatch.js';
import type { CommanderSelection } from '../src/types.js';

// Feature: build-a-commander, Property 1: Build dispatch produces the build loading URL
//
// For any non-empty Moxfield username and any CommanderSelection, dispatching
// `/search` with `mode=build` produces a redirect to the Build-a-Commander
// loading URL for that username carrying the selection's commander (and any
// present partner/companion) as query parameters:
//
//   /build/loading/<encoded username>?commander=…&partner=…&companion=…
//
// The username is URL-encoded into the path; the commander (and any partner or
// companion) are carried as URL-encoded query parameters. Optional fields that
// are absent (null/empty after trimming) are omitted from the query string
// entirely rather than emitted as empty parameters. Parsing the URL back
// recovers the trimmed commander (and any present partner/companion) and the
// username.
//
// **Validates: Requirements 2.6**

/** The path prefix for the Build-a-Commander loading page. */
const BUILD_LOADING_PREFIX = '/build/loading';

/** Trims a value; null when empty/whitespace-only (mirrors the builder). */
function cleanOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Arbitrary card name / username text. Includes characters that must be
 * URL-encoded (spaces, `&`, `=`, `?`, `/`, `#`, unicode, apostrophes) so the
 * test exercises encoding, plus surrounding whitespace to exercise trimming.
 */
const arbText: fc.Arbitrary<string> = fc
  .array(
    fc.constantFrom(
      'a',
      'B',
      'z',
      ' ',
      '&',
      '=',
      '?',
      '/',
      '#',
      "'",
      ',',
      'é',
      'ぬ',
      '%',
      '+',
      'Ω',
    ),
    { minLength: 1, maxLength: 24 },
  )
  .map((chars) => chars.join(''));

/** A non-empty username: any text whose trim is non-empty (builder precondition). */
const arbUsername: fc.Arbitrary<string> = arbText.filter((s) => s.trim().length > 0);

/**
 * A commander name that survives cleanOptional as a non-empty value. The
 * builder always emits `commander` verbatim (it is required), so we constrain
 * to values that are non-empty after trim to match the validated-input contract
 * and keep the round-trip meaningful.
 */
const arbCommander: fc.Arbitrary<string> = arbText.filter((s) => s.trim().length > 0);

/** An optional slot: a raw name, an empty/whitespace string, or null. */
const arbOptional: fc.Arbitrary<string | null> = fc.oneof(
  arbText,
  fc.constantFrom('', '   ', '\t', '\n', null),
);

const arbSelection: fc.Arbitrary<CommanderSelection> = fc.record({
  commander: arbCommander,
  partner: arbOptional,
  companion: arbOptional,
});

describe('Build dispatch produces the build loading URL - Property Tests', () => {
  // **Validates: Requirements 2.6**
  it('Property 1: URL targets the build loading path for the URL-encoded username', () => {
    fc.assert(
      fc.property(arbUsername, arbSelection, (username, selection) => {
        const url = buildDispatchUrl(username, selection);
        const expectedPath = `${BUILD_LOADING_PREFIX}/${encodeURIComponent(username)}`;
        expect(url.startsWith(`${expectedPath}?`)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  // **Validates: Requirements 2.6**
  it('Property 1: parsing the URL back recovers the username and commander', () => {
    fc.assert(
      fc.property(arbUsername, arbSelection, (username, selection) => {
        const url = buildDispatchUrl(username, selection);

        // Resolve against a base so URL/URLSearchParams can parse the path + query.
        const parsed = new URL(url, 'https://example.test');

        // Username is recovered from the (decoded) path segment.
        expect(parsed.pathname.startsWith(`${BUILD_LOADING_PREFIX}/`)).toBe(true);
        const encodedUser = parsed.pathname.slice(`${BUILD_LOADING_PREFIX}/`.length);
        expect(decodeURIComponent(encodedUser)).toBe(username);

        // Commander is always present and recovers the exact (given) value.
        expect(parsed.searchParams.get('commander')).toBe(selection.commander);
      }),
      { numRuns: 200 },
    );
  });

  // **Validates: Requirements 2.6**
  it('Property 1: partner/companion appear iff present, recovering the trimmed value', () => {
    fc.assert(
      fc.property(arbUsername, arbSelection, (username, selection) => {
        const url = buildDispatchUrl(username, selection);
        const { searchParams } = new URL(url, 'https://example.test');

        for (const field of ['partner', 'companion'] as const) {
          const cleaned = cleanOptional(selection[field]);
          if (cleaned === null) {
            // Absent optional field → no parameter emitted at all.
            expect(searchParams.has(field)).toBe(false);
          } else {
            // Present → parameter recovers the trimmed value.
            expect(searchParams.get(field)).toBe(cleaned);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  // **Validates: Requirements 2.6**
  it('Property 1: no empty query parameters are ever emitted', () => {
    fc.assert(
      fc.property(arbUsername, arbSelection, (username, selection) => {
        const url = buildDispatchUrl(username, selection);
        const { searchParams } = new URL(url, 'https://example.test');

        for (const [, value] of searchParams.entries()) {
          expect(value.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 },
    );
  });
});
