import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateBuildRequest,
  USERNAME_REQUIRED_PROMPT,
  COMMANDER_REQUIRED_PROMPT,
  type BuildRequestInput,
} from '../src/domain/build-dispatch.js';

// Feature: build-a-commander, Property 2: Build-request validation rejects missing inputs
//
// For any Build_Commander request, if the username is empty/whitespace or the
// commander is empty/whitespace, the request is rejected with the corresponding
// prompt (enter a username / select a commander); otherwise it is accepted.
// The username is the first required input, so an all-missing request reports
// the username before the commander. When accepted, the username is trimmed and
// the CommanderSelection carries a trimmed commander with optional partner and
// companion values trimmed, or folded to null when empty/whitespace.
//
// **Validates: Requirements 3.5, 3.6**

/** True when a raw value is empty or whitespace-only (i.e. missing). */
function isBlank(value: string | null | undefined): boolean {
  return (value?.trim() ?? '').length === 0;
}

/** Trims a value and folds empty/whitespace-only results to null. */
function cleanOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/** A run of pure whitespace — a "present but blank" field. */
const arbWhitespace: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r', '  '), { minLength: 0, maxLength: 4 })
  .map((parts) => parts.join(''));

/**
 * A non-blank raw value: at least one non-whitespace character, possibly
 * surrounded by stray whitespace so trimming is exercised.
 */
const arbNonBlank: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0);

/** Any raw value (blank or non-blank) for a required field. */
const arbRawValue: fc.Arbitrary<string> = fc.oneof(arbWhitespace, arbNonBlank);

/** Any optional field value: absent (null/undefined), blank, or non-blank. */
const arbOptional: fc.Arbitrary<string | null | undefined> = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  arbWhitespace,
  arbNonBlank,
);

/** An arbitrary raw Build-a-Commander submission before validation. */
const arbInput: fc.Arbitrary<BuildRequestInput> = fc.record({
  username: arbRawValue,
  commander: arbRawValue,
  partner: arbOptional,
  companion: arbOptional,
}) as fc.Arbitrary<BuildRequestInput>;

describe('Build-request validation rejects missing inputs - Property Tests', () => {
  // **Validates: Requirements 3.5, 3.6**
  it('Property 2: accepts iff both username and commander are non-empty after trimming', () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const result = validateBuildRequest(input);
        const shouldAccept = !isBlank(input.username) && !isBlank(input.commander);
        expect(result.valid).toBe(shouldAccept);
      }),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 3.6**
  it('Property 2: a blank username is rejected on the username field with its prompt', () => {
    fc.assert(
      fc.property(arbWhitespace, arbRawValue, arbOptional, arbOptional, (username, commander, partner, companion) => {
        const result = validateBuildRequest({ username, commander, partner, companion });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.field).toBe('username');
          expect(result.message).toBe(USERNAME_REQUIRED_PROMPT);
        }
      }),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 3.5**
  it('Property 2: a valid username with a blank commander is rejected on the commander field', () => {
    fc.assert(
      fc.property(arbNonBlank, arbWhitespace, arbOptional, arbOptional, (username, commander, partner, companion) => {
        const result = validateBuildRequest({ username, commander, partner, companion });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.field).toBe('commander');
          expect(result.message).toBe(COMMANDER_REQUIRED_PROMPT);
        }
      }),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 3.5, 3.6**
  it('Property 2: when both are missing, the username is reported first (username before commander)', () => {
    fc.assert(
      fc.property(arbWhitespace, arbWhitespace, arbOptional, arbOptional, (username, commander, partner, companion) => {
        const result = validateBuildRequest({ username, commander, partner, companion });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.field).toBe('username');
        }
      }),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 3.5, 3.6**
  it('Property 2: an accepted request trims the username and normalizes the selection', () => {
    fc.assert(
      fc.property(arbNonBlank, arbNonBlank, arbOptional, arbOptional, (username, commander, partner, companion) => {
        const result = validateBuildRequest({ username, commander, partner, companion });
        expect(result.valid).toBe(true);
        if (result.valid) {
          // Username is trimmed.
          expect(result.username).toBe(username.trim());
          // Commander is trimmed.
          expect(result.selection.commander).toBe(commander.trim());
          // Optional fields are trimmed, or null when blank/absent.
          expect(result.selection.partner).toBe(cleanOptional(partner));
          expect(result.selection.companion).toBe(cleanOptional(companion));
        }
      }),
      { numRuns: 100 },
    );
  });
});
