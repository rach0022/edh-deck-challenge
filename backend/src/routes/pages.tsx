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
import { HomePage } from '../views/home.js';
import { ChallengePage } from '../views/challenge.js';
import { DeckDetailPage } from '../views/deck-detail.js';
import { LoadingPage } from '../views/loading.js';
import { ErrorPage } from '../views/error.js';
import {
  MoxfieldUserNotFoundError,
  MoxfieldTimeoutError,
} from '../services/moxfield.js';

export function createPageRoutes(challengeService: ChallengeService): Hono {
  const app = new Hono();

  /**
   * GET / — Landing page
   */
  app.get('/', (c) => {
    return c.html(<HomePage />);
  });

  /**
   * GET /challenge?username=X — Form redirect target
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

    return c.html(<LoadingPage username={username} />);
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

  return app;
}
