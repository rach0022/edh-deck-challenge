/**
 * Server-side rendered page routes.
 *
 * GET /                      — Landing page with search form
 * GET /challenge?username=X  — Challenge progress grid (form redirect target)
 * GET /challenge/:username   — Challenge progress grid (direct URL)
 * GET /loading/:username     — Loading page with progress animation
 * GET /api/challenge/:username/progress — SSE stream for progress updates
 * GET /deck/:deckId          — Deck detail page
 * POST /refresh/:username    — Force refresh, then redirect back
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { ChallengeService } from '../services/challenge.js';
import type { ProgressEvent } from '../services/challenge.js';
import type { CedhService } from '../services/cedh.js';
import type { ScryfallService } from '../services/scryfall.js';
import { ScryfallUnavailableError } from '../services/scryfall.js';
import type { BuildCommanderService } from '../services/build-commander.js';
import type { DeckAnalysisService } from '../services/deck-analysis.js';
import {
  EdhrecNotFoundError,
  EdhrecTimeoutError,
} from '../services/edhrec.js';
import { HomePage } from '../views/home.js';
import { ChallengePage } from '../views/challenge.js';
import { CedhMatchPage } from '../views/cedh-match.js';
import { BuildPage } from '../views/build.js';
import { DeckDetailPage } from '../views/deck-detail.js';
import { DeckAnalysisPage } from '../views/deck-analysis.js';
import { LoadingPage } from '../views/loading.js';
import { ErrorPage } from '../views/error.js';
import {
  MoxfieldUserNotFoundError,
  MoxfieldTimeoutError,
} from '../services/moxfield.js';
import {
  validateBuildRequest,
  buildDispatchUrl,
} from '../domain/build-dispatch.js';
import type { CommanderSelection } from '../types.js';

export function createPageRoutes(
  challengeService: ChallengeService,
  cedhService: CedhService,
  scryfallService: ScryfallService,
  buildCommanderService: BuildCommanderService,
  deckAnalysisService: DeckAnalysisService,
): Hono {
  const app = new Hono();

  /**
   * Builds the Build-a-Commander results URL for a username and selection:
   * `/build/<username>?commander=…&partner=…&companion=…`.
   *
   * Mirrors `buildDispatchUrl`'s query-string construction so the SSE
   * `complete` redirect reconstructs the exact same selection the results
   * route (task 17.3) reads back (Req 9.4). Optional fields absent from the
   * selection are omitted rather than emitted as empty parameters.
   */
  function buildResultsUrl(username: string, selection: CommanderSelection): string {
    const params = new URLSearchParams();
    params.set('commander', selection.commander);
    if (selection.partner) params.set('partner', selection.partner);
    if (selection.companion) params.set('companion', selection.companion);
    return `/build/${encodeURIComponent(username)}?${params.toString()}`;
  }

  /** Shared username validation. Returns trimmed username or null. */
  function validUsername(raw: string | undefined): string | null {
    const username = raw?.trim();
    if (!username || username.length < 2 || username.length > 50) return null;
    return username;
  }

  /**
   * GET / — Landing page
   */
  app.get('/', (c) => {
    return c.html(<HomePage />);
  });

  /**
   * GET /search?username=X&mode=challenge|cedh|build — Home form dispatch target.
   * Routes to the appropriate loading page based on the selected mode.
   *
   * For mode=build, the commander/partner/companion query params are validated
   * (username + commander required) and, on success, carried through to the
   * Build-a-Commander loading page via the pure dispatch helpers (Req 2.6, 3.5,
   * 3.6). Invalid build submissions redirect back to '/' so the user can fix
   * the missing input.
   */
  app.get('/search', (c) => {
    const rawMode = c.req.query('mode');

    if (rawMode === 'build') {
      const result = validateBuildRequest({
        username: c.req.query('username') ?? '',
        commander: c.req.query('commander') ?? '',
        partner: c.req.query('partner') ?? null,
        companion: c.req.query('companion') ?? null,
      });
      if (!result.valid) {
        return c.redirect('/');
      }
      return c.redirect(buildDispatchUrl(result.username, result.selection));
    }

    const username = c.req.query('username')?.trim();
    if (!username) {
      return c.redirect('/');
    }
    const mode = rawMode === 'cedh' ? 'cedh' : 'challenge';
    const encoded = encodeURIComponent(username);
    return c.redirect(
      mode === 'cedh' ? `/cedh/loading/${encoded}` : `/loading/${encoded}`,
    );
  });

  /**
   * GET /challenge?username=X — Legacy form redirect target
   * Redirects to /loading/:username for the loading experience
   */
  app.get('/challenge', (c) => {
    const username = c.req.query('username')?.trim();
    if (!username) {
      return c.redirect('/');
    }
    return c.redirect(`/loading/${encodeURIComponent(username)}`);
  });

  /**
   * GET /loading/:username — Loading page with progress animation
   * Shows spinner + progress bar while data is being fetched via SSE
   */
  app.get('/loading/:username', (c) => {
    const username = c.req.param('username').trim();

    if (!username || username.length < 2 || username.length > 50) {
      return c.html(
        <ErrorPage
          title="Invalid Username"
          message="Username must be between 2 and 50 characters."
        />,
        400
      );
    }

    return c.html(<LoadingPage username={username} mode="challenge" />);
  });

  /**
   * GET /challenge/:username — Challenge progress page
   */
  app.get('/challenge/:username', async (c) => {
    const username = c.req.param('username').trim();

    if (!username || username.length < 2 || username.length > 50) {
      return c.html(
        <ErrorPage
          title="Invalid Username"
          message="Username must be between 2 and 50 characters."
        />,
        400
      );
    }

    try {
      const { data, cached } = await challengeService.getChallenge(username);
      return c.html(<ChallengePage challenge={data} cached={cached} />);
    } catch (error) {
      if (error instanceof MoxfieldUserNotFoundError) {
        return c.html(
          <ErrorPage
            title="User Not Found"
            message={`Moxfield user "${username}" was not found. Check the spelling and try again.`}
          />,
          404
        );
      }

      if (error instanceof MoxfieldTimeoutError) {
        return c.html(
          <ErrorPage
            title="Connection Timeout"
            message="Could not reach Moxfield. The service may be temporarily unavailable. Please try again in a few minutes."
          />,
          504
        );
      }

      console.error('Page render error:', error);
      return c.html(
        <ErrorPage
          title="Something Went Wrong"
          message="An unexpected error occurred. Please try again later."
        />,
        500
      );
    }
  });

  /**
   * GET /deck/:deckId — Deck detail page
   */
  app.get('/deck/:deckId', async (c) => {
    const deckId = c.req.param('deckId').trim();

    if (!deckId) {
      return c.html(
        <ErrorPage title="Invalid Deck" message="Deck ID is required." />,
        400
      );
    }

    try {
      const { data, cached } = await challengeService.getDeckDetail(deckId);
      return c.html(<DeckDetailPage deck={data} cached={cached} />);
    } catch (error) {
      if (error instanceof MoxfieldUserNotFoundError) {
        return c.html(
          <ErrorPage title="Deck Not Found" message="This deck could not be found." />,
          404
        );
      }

      console.error('Deck detail error:', error);
      return c.html(
        <ErrorPage
          title="Something Went Wrong"
          message="An unexpected error occurred loading this deck."
        />,
        500
      );
    }
  });

  /**
   * GET /analyze/:deckId — Deck analysis page (salt/power/bracket + cut/add
   * suggestions). Reuses the same error taxonomy as the other EDHREC-backed
   * pages; EDHREC "no page for this commander" is NOT fatal (the service
   * degrades to salt-only with noEdhrecData), so it renders normally.
   */
  app.get('/analyze/:deckId', async (c) => {
    const deckId = c.req.param('deckId').trim();

    if (!deckId) {
      return c.html(
        <ErrorPage title="Invalid Deck" message="Deck ID is required." />,
        400,
      );
    }

    try {
      const { data, cached } = await deckAnalysisService.getAnalysis(deckId);
      return c.html(<DeckAnalysisPage result={data} cached={cached} />);
    } catch (error) {
      if (error instanceof MoxfieldUserNotFoundError) {
        return c.html(
          <ErrorPage title="Deck Not Found" message="This deck could not be found." />,
          404,
        );
      }
      if (error instanceof MoxfieldTimeoutError) {
        return c.html(
          <ErrorPage
            title="Connection Timeout"
            message="Could not reach Moxfield. The service may be temporarily unavailable. Please try again in a few minutes."
          />,
          504,
        );
      }
      console.error('Deck analysis error:', error);
      return c.html(
        <ErrorPage
          title="Something Went Wrong"
          message="An unexpected error occurred analysing this deck."
        />,
        500,
      );
    }
  });

  /**
   * POST /analyze/refresh/:deckId — Force-refresh the deck analysis, redirect
   * back to the analysis page.
   */
  app.post('/analyze/refresh/:deckId', async (c) => {
    const deckId = c.req.param('deckId').trim();
    if (!deckId) {
      return c.redirect('/');
    }
    try {
      await deckAnalysisService.refreshAnalysis(deckId);
    } catch (error) {
      console.error('Deck analysis refresh error:', error);
    }
    return c.redirect(`/analyze/${encodeURIComponent(deckId)}`);
  });

  /**
   * GET /cedh/loading/:username — Loading page for the cEDH match flow
   */
  app.get('/cedh/loading/:username', (c) => {
    const username = validUsername(c.req.param('username'));
    if (!username) {
      return c.html(
        <ErrorPage
          title="Invalid Username"
          message="Username must be between 2 and 50 characters."
        />,
        400,
      );
    }
    return c.html(<LoadingPage username={username} mode="cedh" />);
  });

  /**
   * GET /build/loading/:username?commander=&partner=&companion= — Loading page
   * for the Build-a-Commander flow.
   *
   * Reconstructs the commander selection from the query params and validates it
   * (username + commander required, Req 3.5/3.6) via the shared build-request
   * validator. Invalid requests render the shared error page; valid requests
   * render the loading shell that drives the SSE flow (Req 9.1).
   */
  app.get('/build/loading/:username', (c) => {
    const result = validateBuildRequest({
      username: c.req.param('username') ?? '',
      commander: c.req.query('commander') ?? '',
      partner: c.req.query('partner') ?? null,
      companion: c.req.query('companion') ?? null,
    });

    if (!result.valid) {
      const message =
        result.field === 'username'
          ? 'Username must be between 2 and 50 characters.'
          : 'Please select a commander to build.';
      return c.html(
        <ErrorPage title="Invalid Build Request" message={message} />,
        400,
      );
    }

    const { username } = result;
    if (username.length < 2 || username.length > 50) {
      return c.html(
        <ErrorPage
          title="Invalid Username"
          message="Username must be between 2 and 50 characters."
        />,
        400,
      );
    }

    return c.html(
      <LoadingPage
        username={username}
        mode="build"
        commander={result.selection.commander}
        partner={result.selection.partner}
        companion={result.selection.companion}
      />,
    );
  });

  /**
   * GET /cedh/:username — cEDH match results page
   */
  app.get('/cedh/:username', async (c) => {
    const username = validUsername(c.req.param('username'));
    if (!username) {
      return c.html(
        <ErrorPage
          title="Invalid Username"
          message="Username must be between 2 and 50 characters."
        />,
        400,
      );
    }

    try {
      const { data, cached } = await cedhService.getMatches(username);
      return c.html(<CedhMatchPage result={data} cached={cached} />);
    } catch (error) {
      if (error instanceof MoxfieldUserNotFoundError) {
        return c.html(
          <ErrorPage
            title="User Not Found"
            message={`Moxfield user "${username}" was not found. Check the spelling and try again.`}
          />,
          404,
        );
      }
      if (error instanceof MoxfieldTimeoutError) {
        return c.html(
          <ErrorPage
            title="Connection Timeout"
            message="Could not reach Moxfield. The service may be temporarily unavailable. Please try again in a few minutes."
          />,
          504,
        );
      }
      console.error('cEDH page render error:', error);
      return c.html(
        <ErrorPage
          title="Something Went Wrong"
          message="An unexpected error occurred. Please try again later."
        />,
        500,
      );
    }
  });

  /**
   * GET /api/cedh/:username/progress — SSE stream for cEDH match progress
   */
  app.get('/api/cedh/:username/progress', (c) => {
    const username = validUsername(c.req.param('username'));
    if (!username) {
      return c.json({ error: 'Invalid username' }, 400);
    }

    return streamSSE(c, async (stream) => {
      let completed = false;
      try {
        await cedhService.getMatches(username, (event: ProgressEvent) => {
          if (completed) return;
          stream.writeSSE({ event: 'progress', data: JSON.stringify(event) });
        });

        completed = true;
        await stream.writeSSE({
          event: 'complete',
          data: JSON.stringify({ redirect: `/cedh/${encodeURIComponent(username)}` }),
        });
      } catch (error) {
        completed = true;
        let errorMessage = 'An unexpected error occurred.';
        let errorType = 'unknown';

        if (error instanceof MoxfieldUserNotFoundError) {
          errorMessage = `Moxfield user "${username}" was not found.`;
          errorType = 'not_found';
        } else if (error instanceof MoxfieldTimeoutError) {
          errorMessage = 'Could not reach Moxfield. Please try again.';
          errorType = 'timeout';
        } else {
          console.error('cEDH SSE progress error:', error);
        }

        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ message: errorMessage, type: errorType }),
        });
      }
    });
  });

  /**
   * POST /cedh/refresh/:username — Force cEDH cache refresh, redirect back
   */
  app.post('/cedh/refresh/:username', async (c) => {
    const username = c.req.param('username').trim();
    if (!username) {
      return c.redirect('/');
    }
    try {
      await cedhService.refreshMatches(username);
    } catch (error) {
      console.error('cEDH refresh error:', error);
    }
    return c.redirect(`/cedh/${encodeURIComponent(username)}`);
  });

  /**
   * GET /api/build/:username/progress?commander=&partner=&companion= — SSE
   * stream for the Build-a-Commander flow.
   *
   * Reconstructs the `CommanderSelection` from the query params, validates the
   * username + commander presence (Req 3.5/3.6) via the shared build-request
   * validator, then drives `buildCommanderService.getResult` with a
   * `ProgressCallback`. It mirrors the cEDH SSE route verbatim: it forwards
   * `progress` events, emits a `complete` event carrying a `{ redirect }` to
   * the results page (Req 9.2, 9.4), or emits a typed `error` event (Req 9.3,
   * 12.6). Typed errors map to: `MoxfieldUserNotFoundError → not_found`,
   * `MoxfieldTimeoutError → timeout`, `EdhrecNotFoundError → edhrec_not_found`,
   * `EdhrecTimeoutError → edhrec_timeout`, anything else → unknown.
   */
  app.get('/api/build/:username/progress', (c) => {
    const validation = validateBuildRequest({
      username: c.req.param('username') ?? '',
      commander: c.req.query('commander') ?? '',
      partner: c.req.query('partner') ?? null,
      companion: c.req.query('companion') ?? null,
    });

    if (!validation.valid) {
      return c.json({ error: validation.message }, 400);
    }

    const { username, selection } = validation;

    return streamSSE(c, async (stream) => {
      let completed = false;
      try {
        await buildCommanderService.getResult(
          selection,
          username,
          (event: ProgressEvent) => {
            if (completed) return;
            stream.writeSSE({ event: 'progress', data: JSON.stringify(event) });
          },
        );

        completed = true;
        await stream.writeSSE({
          event: 'complete',
          data: JSON.stringify({ redirect: buildResultsUrl(username, selection) }),
        });
      } catch (error) {
        completed = true;
        let errorMessage = 'An unexpected error occurred.';
        let errorType = 'unknown';

        if (error instanceof MoxfieldUserNotFoundError) {
          errorMessage = `Moxfield user "${username}" was not found.`;
          errorType = 'not_found';
        } else if (error instanceof MoxfieldTimeoutError) {
          errorMessage = 'Could not reach Moxfield. Please try again.';
          errorType = 'timeout';
        } else if (error instanceof EdhrecNotFoundError) {
          errorMessage =
            'EDHREC has no recommendations for that commander. Try a different selection.';
          errorType = 'edhrec_not_found';
        } else if (error instanceof EdhrecTimeoutError) {
          errorMessage = 'Could not reach EDHREC. Please try again later.';
          errorType = 'edhrec_timeout';
        } else {
          console.error('Build SSE progress error:', error);
        }

        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ message: errorMessage, type: errorType }),
        });
      }
    });
  });

  /**
   * GET /build/:username?commander=&partner=&companion= — Build-a-Commander
   * RESULTS page.
   *
   * Reconstructs the `CommanderSelection` from the query params carried through
   * the whole flow (loading → SSE → results → refresh), validates username +
   * commander presence (Req 3.5/3.6) via the shared build-request validator,
   * then calls `buildCommanderService.getResult(selection, username)` and
   * renders the results view.
   *
   * Error mapping mirrors the cEDH results route (`GET /cedh/:username`) and
   * follows the design's Error Handling section (Req 12.1–12.4):
   *   - MoxfieldUserNotFoundError → ErrorPage 404 (Req 12.2)
   *   - MoxfieldTimeoutError      → ErrorPage 504 (Req 12.3)
   *   - EdhrecNotFoundError       → ErrorPage 404 (Req 12.1)
   *   - EdhrecTimeoutError        → ErrorPage 504 (Req 12.4)
   *   - anything else             → ErrorPage 500 (logged)
   * The no-decks case is NOT an error: it flows through as a normal result with
   * `noDecks: true` (Req 12.5).
   */
  app.get('/build/:username', async (c) => {
    const result = validateBuildRequest({
      username: c.req.param('username') ?? '',
      commander: c.req.query('commander') ?? '',
      partner: c.req.query('partner') ?? null,
      companion: c.req.query('companion') ?? null,
    });

    if (!result.valid) {
      const message =
        result.field === 'username'
          ? 'Username must be between 2 and 50 characters.'
          : 'Please select a commander to build.';
      return c.html(
        <ErrorPage title="Invalid Build Request" message={message} />,
        400,
      );
    }

    const { username, selection } = result;

    try {
      const { data, cached } = await buildCommanderService.getResult(
        selection,
        username,
      );

      return c.html(<BuildPage result={data} cached={cached} />);
    } catch (error) {
      if (error instanceof MoxfieldUserNotFoundError) {
        return c.html(
          <ErrorPage
            title="User Not Found"
            message={`Moxfield user "${username}" was not found. Check the spelling and try again.`}
          />,
          404,
        );
      }
      if (error instanceof MoxfieldTimeoutError) {
        return c.html(
          <ErrorPage
            title="Connection Timeout"
            message="Could not reach Moxfield. The service may be temporarily unavailable. Please try again in a few minutes."
          />,
          504,
        );
      }
      if (error instanceof EdhrecNotFoundError) {
        return c.html(
          <ErrorPage
            title="Commander Not Found"
            message={`EDHREC has no recommendations for "${selection.commander}". Try a different commander selection.`}
          />,
          404,
        );
      }
      if (error instanceof EdhrecTimeoutError) {
        return c.html(
          <ErrorPage
            title="Connection Timeout"
            message="Could not retrieve recommendations from EDHREC. The service may be temporarily unavailable. Please try again later."
          />,
          504,
        );
      }
      console.error('Build page render error:', error);
      return c.html(
        <ErrorPage
          title="Something Went Wrong"
          message="An unexpected error occurred. Please try again later."
        />,
        500,
      );
    }
  });

  /**
   * POST /build/refresh/:username?commander=&partner=&companion= — Force a
   * Build-a-Commander cache refresh, then redirect back to the results page.
   *
   * Mirrors `POST /cedh/refresh/:username`: it reconstructs the selection from
   * the query params, calls `buildCommanderService.refreshResult`, and redirects
   * to the results URL (reusing `buildResultsUrl`). On error it logs and still
   * redirects back so the user sees the error rendered on the results page.
   */
  app.post('/build/refresh/:username', async (c) => {
    const result = validateBuildRequest({
      username: c.req.param('username') ?? '',
      commander: c.req.query('commander') ?? '',
      partner: c.req.query('partner') ?? null,
      companion: c.req.query('companion') ?? null,
    });

    if (!result.valid) {
      return c.redirect('/');
    }

    const { username, selection } = result;
    try {
      await buildCommanderService.refreshResult(selection, username);
    } catch (error) {
      console.error('Build refresh error:', error);
    }
    return c.redirect(buildResultsUrl(username, selection));
  });

  /**
   * GET /api/challenge/:username/progress — SSE stream for progress updates
   * Used by the loading page to show real-time progress
   */
  app.get('/api/challenge/:username/progress', (c) => {
    const username = c.req.param('username').trim();

    if (!username || username.length < 2 || username.length > 50) {
      return c.json({ error: 'Invalid username' }, 400);
    }

    return streamSSE(c, async (stream) => {
      let completed = false;

      try {
        await challengeService.getChallengeWithProgress(username, (event: ProgressEvent) => {
          if (completed) return;
          stream.writeSSE({
            event: 'progress',
            data: JSON.stringify(event),
          });
        });

        completed = true;
        await stream.writeSSE({
          event: 'complete',
          data: JSON.stringify({ redirect: `/challenge/${encodeURIComponent(username)}` }),
        });
      } catch (error) {
        completed = true;
        let errorMessage = 'An unexpected error occurred.';
        let errorType = 'unknown';

        if (error instanceof MoxfieldUserNotFoundError) {
          errorMessage = `Moxfield user "${username}" was not found.`;
          errorType = 'not_found';
        } else if (error instanceof MoxfieldTimeoutError) {
          errorMessage = 'Could not reach Moxfield. Please try again.';
          errorType = 'timeout';
        } else {
          console.error('SSE progress error:', error);
        }

        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ message: errorMessage, type: errorType }),
        });
      }
    });
  });

  /**
   * POST /refresh/:username — Force cache refresh, redirect back
   */
  app.post('/refresh/:username', async (c) => {
    const username = c.req.param('username').trim();

    if (!username) {
      return c.redirect('/');
    }

    try {
      await challengeService.refreshChallenge(username);
    } catch (error) {
      // Even if refresh fails, redirect back — they'll see the error on the page
      console.error('Refresh error:', error);
    }

    return c.redirect(`/challenge/${encodeURIComponent(username)}`);
  });

  /**
   * GET /api/scryfall/commanders?q=… — Type-ahead suggestions restricted to
   * legal commanders. Returns `{ suggestions: CardSuggestion[] }`.
   *
   * A query shorter than the 2-character minimum yields an empty list without
   * any network call (Req 4.7). A Scryfall timeout/outage degrades gracefully
   * to HTTP 200 `{ suggestions: [], error: 'unavailable' }` so the client can
   * keep typing (Req 4.8).
   */
  app.get('/api/scryfall/commanders', async (c) => {
    const query = c.req.query('q') ?? '';
    try {
      const suggestions = await scryfallService.searchCommanders(query);
      return c.json({ suggestions });
    } catch (error) {
      if (error instanceof ScryfallUnavailableError) {
        return c.json({ suggestions: [], error: 'unavailable' });
      }
      console.error('Scryfall commanders autocomplete error:', error);
      return c.json({ suggestions: [], error: 'unavailable' });
    }
  });

  /**
   * GET /api/scryfall/companions?q=… — Type-ahead suggestions restricted to
   * legal companions. Same shape and graceful-degradation contract as the
   * commanders endpoint (Req 4.7, 4.8).
   */
  app.get('/api/scryfall/companions', async (c) => {
    const query = c.req.query('q') ?? '';
    try {
      const suggestions = await scryfallService.searchCompanions(query);
      return c.json({ suggestions });
    } catch (error) {
      if (error instanceof ScryfallUnavailableError) {
        return c.json({ suggestions: [], error: 'unavailable' });
      }
      console.error('Scryfall companions autocomplete error:', error);
      return c.json({ suggestions: [], error: 'unavailable' });
    }
  });

  return app;
}
