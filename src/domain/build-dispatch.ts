/**
 * Build-a-Commander dispatch and request validation — pure, side-effect-free.
 *
 * This module isolates the two pieces of pure logic that sit behind the
 * `/search` dispatch for `mode=build`:
 *
 *   1. `validateBuildRequest` — checks that a Build-a-Commander submission has
 *      the inputs it requires. A Moxfield username is required (Req 3.6) and a
 *      primary commander is required (Req 3.5); both must be non-empty after
 *      trimming. Everything else (partner, companion) is optional. When a
 *      required input is missing the validator reports which one, together
 *      with the user-facing prompt to show.
 *
 *   2. `buildDispatchUrl` — builds the redirect target that carries a valid
 *      submission to the Build-a-Commander loading page:
 *      `/build/loading/<username>?commander=…&partner=…&companion=…` (Req 2.6).
 *      Only the fields that are actually present are included as query
 *      parameters, and every value is URL-encoded.
 *
 * No I/O, no framework types — the `/search` route (`routes/pages.tsx`)
 * consumes these builders and performs the actual redirect.
 */

import type { CommanderSelection } from '../types.js';

/** The path prefix for the Build-a-Commander loading page. */
const BUILD_LOADING_PREFIX = '/build/loading';

/** The path prefix for the Build-a-Commander deck-selection page. */
const BUILD_SELECT_PREFIX = '/build/select';

/** User-facing prompts shown when a required build input is missing. */
export const USERNAME_REQUIRED_PROMPT = 'Please enter a Moxfield username.';
export const COMMANDER_REQUIRED_PROMPT = 'Please select a commander.';

/** Which required field a build request is missing, when invalid. */
export type BuildValidationField = 'username' | 'commander';

/** A raw Build-a-Commander submission, before validation. */
export interface BuildRequestInput {
  /** The submitted Moxfield username (raw, pre-trim). */
  username: string;
  /** The submitted primary commander name (raw, pre-trim). */
  commander: string;
  /** The optional submitted partner commander name. */
  partner?: string | null;
  /** The optional submitted companion name. */
  companion?: string | null;
}

/**
 * The outcome of validating a Build-a-Commander submission.
 *
 * On success, `username` is the trimmed username and `selection` is the
 * normalized `CommanderSelection` (trimmed commander, optional partner/
 * companion, empty optional fields folded to `null`). On failure, `field`
 * names the missing required input and `message` is the prompt to show.
 */
export type BuildValidationResult =
  | {
      valid: true;
      username: string;
      selection: CommanderSelection;
    }
  | {
      valid: false;
      field: BuildValidationField;
      message: string;
    };

/** Trims a value and returns `null` when it is empty/whitespace-only. */
function cleanOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Validates a Build-a-Commander submission.
 *
 * The username and the primary commander are both required and must be
 * non-empty after trimming. The username is checked first so an empty
 * submission prompts for the username (Req 3.6) before the commander
 * (Req 3.5). Optional partner/companion values are trimmed and folded to
 * `null` when empty. When both required fields are present the request is
 * accepted with a normalized `CommanderSelection`.
 */
export function validateBuildRequest(
  input: BuildRequestInput,
): BuildValidationResult {
  const username = input.username?.trim() ?? '';
  if (username.length === 0) {
    return {
      valid: false,
      field: 'username',
      message: USERNAME_REQUIRED_PROMPT,
    };
  }

  const commander = input.commander?.trim() ?? '';
  if (commander.length === 0) {
    return {
      valid: false,
      field: 'commander',
      message: COMMANDER_REQUIRED_PROMPT,
    };
  }

  return {
    valid: true,
    username,
    selection: {
      commander,
      partner: cleanOptional(input.partner),
      companion: cleanOptional(input.companion),
    },
  };
}

/**
 * Builds the Build-a-Commander loading redirect URL for a username and
 * selection: `/build/loading/<username>?commander=…&partner=…&companion=…`.
 *
 * The username is URL-encoded into the path; the commander (and any partner or
 * companion) are carried as URL-encoded query parameters so the loading page,
 * SSE endpoint, and results page can reconstruct the same `CommanderSelection`
 * (Req 2.6). Optional fields that are absent (`null`/empty) are omitted from
 * the query string entirely rather than emitted as empty parameters.
 */
export function buildDispatchUrl(
  username: string,
  selection: CommanderSelection,
): string {
  const params = new URLSearchParams();
  params.set('commander', selection.commander);

  const partner = cleanOptional(selection.partner);
  if (partner) params.set('partner', partner);

  const companion = cleanOptional(selection.companion);
  if (companion) params.set('companion', companion);

  return `${BUILD_LOADING_PREFIX}/${encodeURIComponent(username)}?${params.toString()}`;
}

/**
 * Builds the selection query string shared by every hop of the build flow:
 * `commander=…&partner=…&companion=…` (commander always present; partner and
 * companion emitted only when set). Extracted so the deck-select and
 * loading/results URL builders stay in sync with `buildDispatchUrl`.
 */
export function buildSelectionParams(
  selection: CommanderSelection,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set('commander', selection.commander);
  const partner = cleanOptional(selection.partner);
  if (partner) params.set('partner', partner);
  const companion = cleanOptional(selection.companion);
  if (companion) params.set('companion', companion);
  return params;
}

/**
 * Builds the deck-selection redirect URL for a username and selection:
 * `/build/select/<username>?commander=…&partner=…&companion=…`.
 *
 * Used when the user opts into "let me pick which decks" on the home form: the
 * commander selection is carried through so that, after the user chooses their
 * decks, the flow can continue to the loading page with the same selection
 * plus the chosen `deck` params.
 */
export function buildSelectUrl(
  username: string,
  selection: CommanderSelection,
): string {
  const params = buildSelectionParams(selection);
  return `${BUILD_SELECT_PREFIX}/${encodeURIComponent(username)}?${params.toString()}`;
}

/**
 * Normalizes the raw `deck` query parameter(s) into a clean list of Moxfield
 * deck publicIds. Hono returns a single string for one value and an array for
 * repeated `deck=` params; this accepts either (or `undefined`) and trims,
 * drops empties, and de-duplicates while preserving first-seen order.
 *
 * Returns `undefined` when no `deck` param was present at all, so callers can
 * distinguish "no deck selection made" (use all decks) from "picked no decks"
 * (empty array → empty owned set).
 */
export function parseDeckIds(
  raw: string | string[] | undefined,
): string[] | undefined {
  if (raw === undefined) return undefined;
  const list = Array.isArray(raw) ? raw : [raw];
  const cleaned = list.map((id) => id.trim()).filter((id) => id.length > 0);
  return Array.from(new Set(cleaned));
}
