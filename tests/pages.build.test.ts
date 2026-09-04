/**
 * Route-level tests for the Build-a-Commander flow in `src/routes/pages.tsx`
 * (tasks 17.1/17.2/17.3). Exercises the Hono app through `app.request(...)`
 * with hand-written FAKE services — no real Puppeteer/network/cache.
 *
 * Coverage:
 *   - GET /search?mode=build   → 302 dispatch to /build/loading/:username
 *                                (valid) / redirect to '/' (invalid).
 *   - GET /build/:username      → 200 on success, getResult called with the
 *                                reconstructed selection + username; typed
 *                                errors mapped to 404/504/500; noDecks → 200.
 *   - GET /api/build/:username/progress → text/event-stream with forwarded
 *                                progress + a complete{redirect} event, and a
 *                                typed error event on rejection.
 *   - POST /build/refresh/:username → refreshResult called, redirect to results.
 *
 * NOTE: the /build/:username success view is a placeholder that task 18.3 will
 * replace with a real BuildPage. Success-path assertions therefore check
 * status code + service behavior only (200, getResult called), never the exact
 * placeholder HTML body, so they remain valid after 18.3 lands.
 */

import { describe, it, expect, vi } from 'vitest';
import { createPageRoutes } from '../src/routes/pages.js';
import type { BuildCommanderService } from '../src/services/build-commander.js';
import type { ProgressCallback } from '../src/services/challenge.js';
import {
  MoxfieldUserNotFoundError,
  MoxfieldTimeoutError,
} from '../src/services/moxfield.js';
import {
  EdhrecNotFoundError,
  EdhrecTimeoutError,
} from '../src/services/edhrec.js';
import type {
  BuildCommanderResponse,
  CommanderSelection,
} from '../src/types.js';

// ─── Fakes ───────────────────────────────────────────────────────────────────

/**
 * The results/SSE/refresh routes only touch `buildCommanderService`; the other
 * three services exist purely to satisfy `createPageRoutes`' signature, so they
 * are inert stubs cast to their interface type.
 */
const stubChallenge = {} as any;
const stubCedh = {} as any;
const stubScryfall = {} as any;

/** Builds a minimal, valid BuildCommanderResponse for success-path tests. */
function buildResponse(
  overrides: Partial<BuildCommanderResponse> = {},
): BuildCommanderResponse {
  return {
    username: 'testuser',
    selection: { commander: 'Atraxa, Praetors Voice', partner: null, companion: null },
    myDeck: null,
    sections: [],
    commanderImages: [],
    colorIdentity: [],
    ownedCards: [],
    consideringCards: [],
    toBuyCards: [],
    ownedCount: 0,
    consideringCount: 0,
    toBuyCount: 0,
    buyListTotalCad: 0,
    deckCount: 1,
    fx: { usdToCad: 1.35, fetchedAt: '2024-06-01T00:00:00Z', live: true },
    noDecks: false,
    edhrecRank: null,
    edhrecNumDecks: null,
    ...overrides,
  };
}

/**
 * Programmable fake BuildCommanderService.
 *
 * - `getResultImpl` / `refreshResultImpl` let each test decide whether the call
 *   resolves (with a response) or rejects (with a specific typed error), and
 *   lets the SSE tests drive the injected `onProgress` callback before
 *   resolving/rejecting.
 * - The `getResult` / `refreshResult` vi.fn spies expose call arguments so
 *   tests can assert the reconstructed selection + username.
 */
function createFakeBuildService(options: {
  getResultImpl?: (
    selection: CommanderSelection,
    username: string,
    onProgress?: ProgressCallback,
  ) => Promise<{ data: BuildCommanderResponse; cached: boolean }>;
  refreshResultImpl?: (
    selection: CommanderSelection,
    username: string,
  ) => Promise<BuildCommanderResponse>;
} = {}): BuildCommanderService & {
  getResult: ReturnType<typeof vi.fn>;
  refreshResult: ReturnType<typeof vi.fn>;
} {
  const getResult = vi.fn(
    options.getResultImpl ??
      (async () => ({ data: buildResponse(), cached: false })),
  );
  const refreshResult = vi.fn(
    options.refreshResultImpl ?? (async () => buildResponse()),
  );
  return { getResult, refreshResult } as any;
}

/** Wires a page-routes app around the given build service (others are stubs). */
function appWith(buildService: BuildCommanderService) {
  return createPageRoutes(stubChallenge, stubCedh, stubScryfall, buildService);
}

const selection: CommanderSelection = {
  commander: 'Atraxa, Praetors Voice',
  partner: null,
  companion: null,
};
const username = 'testuser';

/** Query string carrying the selection through the flow. */
const selectionQuery = `commander=${encodeURIComponent(selection.commander)}`;

// ─── GET /search?mode=build ─────────────────────────────────────────────────

describe('GET /search?mode=build', () => {
  it('redirects (302) to the build loading URL for a valid username + commander', async () => {
    const app = appWith(createFakeBuildService());
    const res = await app.request(
      `/search?mode=build&username=${username}&${selectionQuery}`,
    );

    expect(res.status).toBe(302);
    const location = res.headers.get('location')!;
    expect(location).toContain(`/build/loading/${username}`);
    // Query encoding is exercised elsewhere; assert the decoded value round-trips.
    const query = new URLSearchParams(location.split('?')[1]);
    expect(query.get('commander')).toBe(selection.commander);
  });

  it("redirects to '/' when the commander is missing", async () => {
    const app = appWith(createFakeBuildService());
    const res = await app.request(`/search?mode=build&username=${username}`);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
  });
});

// ─── GET /build/:username — success ──────────────────────────────────────────

describe('GET /build/:username — success', () => {
  it('returns 200 and calls getResult with the reconstructed selection + username', async () => {
    const build = createFakeBuildService({
      getResultImpl: async () => ({ data: buildResponse(), cached: false }),
    });
    const app = appWith(build);

    const partner = 'Tymna the Weaver';
    const companion = 'Lurrus of the Dream-Den';
    const query =
      `commander=${encodeURIComponent(selection.commander)}` +
      `&partner=${encodeURIComponent(partner)}` +
      `&companion=${encodeURIComponent(companion)}`;
    const res = await app.request(`/build/${username}?${query}`);

    expect(res.status).toBe(200);
    expect(build.getResult).toHaveBeenCalledTimes(1);
    const [passedSelection, passedUsername] = build.getResult.mock.calls[0];
    expect(passedSelection).toEqual({
      commander: selection.commander,
      partner,
      companion,
    });
    expect(passedUsername).toBe(username);
  });

  it('returns 200 for a noDecks:true response (noDecks is not an error)', async () => {
    const build = createFakeBuildService({
      getResultImpl: async () => ({
        data: buildResponse({ noDecks: true, deckCount: 0 }),
        cached: false,
      }),
    });
    const app = appWith(build);

    const res = await app.request(`/build/${username}?${selectionQuery}`);

    expect(res.status).toBe(200);
    expect(build.getResult).toHaveBeenCalledTimes(1);
  });
});

// ─── GET /build/:username — error mapping ────────────────────────────────────

describe('GET /build/:username — error mapping', () => {
  const cases: Array<{ name: string; error: Error; status: number }> = [
    { name: 'MoxfieldUserNotFoundError → 404', error: new MoxfieldUserNotFoundError(username), status: 404 },
    { name: 'MoxfieldTimeoutError → 504', error: new MoxfieldTimeoutError(), status: 504 },
    { name: 'EdhrecNotFoundError → 404', error: new EdhrecNotFoundError('atraxa'), status: 404 },
    { name: 'EdhrecTimeoutError → 504', error: new EdhrecTimeoutError(), status: 504 },
    { name: 'generic Error → 500', error: new Error('boom'), status: 500 },
  ];

  for (const { name, error, status } of cases) {
    it(`maps ${name}`, async () => {
      const build = createFakeBuildService({
        getResultImpl: async () => {
          throw error;
        },
      });
      const app = appWith(build);

      const res = await app.request(`/build/${username}?${selectionQuery}`);
      expect(res.status).toBe(status);
    });
  }
});

// ─── GET /api/build/:username/progress — SSE ─────────────────────────────────

describe('GET /api/build/:username/progress — SSE', () => {
  it('streams a text/event-stream with forwarded progress and a complete{redirect} event', async () => {
    const build = createFakeBuildService({
      getResultImpl: async (_sel, _user, onProgress) => {
        onProgress?.({ phase: 'connecting', message: 'Connecting...', progress: 5 });
        onProgress?.({ phase: 'matching', message: 'Matching...', progress: 70 });
        return { data: buildResponse(), cached: false };
      },
    });
    const app = appWith(build);

    const res = await app.request(`/api/build/${username}/progress?${selectionQuery}`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const body = await res.text();
    // Progress events forwarded.
    expect(body).toContain('event: progress');
    expect(body).toContain('connecting');
    expect(body).toContain('matching');
    // Terminal complete event carrying the results redirect.
    expect(body).toContain('event: complete');
    const complete = body
      .split('\n')
      .find((line) => line.startsWith('data:') && line.includes('redirect'))!;
    const { redirect } = JSON.parse(complete.replace(/^data:\s*/, '')) as {
      redirect: string;
    };
    expect(redirect).toContain(`/build/${username}`);
    const redirectQuery = new URLSearchParams(redirect.split('?')[1]);
    expect(redirectQuery.get('commander')).toBe(selection.commander);
  });

  it('emits an error event with the mapped type when getResult rejects', async () => {
    const build = createFakeBuildService({
      getResultImpl: async () => {
        throw new EdhrecTimeoutError();
      },
    });
    const app = appWith(build);

    const res = await app.request(`/api/build/${username}/progress?${selectionQuery}`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const body = await res.text();
    expect(body).toContain('event: error');
    expect(body).toContain('edhrec_timeout');
  });
});

// ─── POST /build/refresh/:username ───────────────────────────────────────────

describe('POST /build/refresh/:username', () => {
  it('calls refreshResult and redirects to the results URL', async () => {
    const build = createFakeBuildService();
    const app = appWith(build);

    const res = await app.request(`/build/refresh/${username}?${selectionQuery}`, {
      method: 'POST',
    });

    expect(build.refreshResult).toHaveBeenCalledTimes(1);
    const [passedSelection, passedUsername] = build.refreshResult.mock.calls[0];
    expect(passedSelection).toEqual(selection);
    expect(passedUsername).toBe(username);

    // Redirects back to the results page carrying the selection.
    expect([302, 303]).toContain(res.status);
    const location = res.headers.get('location')!;
    expect(location).toContain(`/build/${username}`);
    const query = new URLSearchParams(location.split('?')[1]);
    expect(query.get('commander')).toBe(selection.commander);
  });
});
