/**
 * Input validation for the EDH 32 Deck Challenge Checker.
 * Validates the Moxfield username argument.
 */

export type ValidationResult =
  | { valid: true; username: string }
  | { valid: false; error: string };

/**
 * Validates the Moxfield username input.
 *
 * - Returns valid with the trimmed username for non-empty strings.
 * - Returns invalid with an error message for undefined, empty, or whitespace-only input.
 */
export function validateUsername(input: string | undefined): ValidationResult {
  if (input === undefined) {
    return { valid: false, error: 'Usage: edh-challenge <moxfield-username>' };
  }

  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return {
      valid: false,
      error: 'Error: Username is invalid. Please provide a non-empty Moxfield username.',
    };
  }

  return { valid: true, username: trimmed };
}
