import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateUsername } from '../src/validator.js';

// Feature: edh-deck-challenge-checker, Property 8: Whitespace-only username is rejected

/**
 * **Property 8: Whitespace-only username is rejected**
 * **Validates: Requirements 1.3**
 *
 * For any string composed entirely of whitespace characters (spaces, tabs, newlines),
 * validateUsername SHALL return a result with valid: false.
 */
describe('Property 8: Whitespace-only username is rejected', () => {
  it('rejects all whitespace-only strings', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[\s]+$/),
        (whitespaceStr) => {
          const result = validateUsername(whitespaceStr);
          expect(result.valid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
