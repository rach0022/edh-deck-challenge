/**
 * Server-side rendered page routes.
 *
 * GET /                      — Landing page with search form
 * GET /challenge?username=X  — Challenge progress grid (form redirect target)
 * GET /challenge/:username   — Challenge progress grid (direct URL)
 * GET /deck/:deckId          — Deck detail page
 * POST /refresh/:username    — Force refresh, then redirect back
 */

import { Hono } from 'hono';
import type { ChallengeService } from '../services/challenge.js';
import { HomePage } from '../views/home.js';
import { ChallengePage } from '../views/challenge.js';
import { DeckDetailPage } from '../views/deck-detail.js';
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
   * Redirects to /challenge/:username for clean URLs
   */
  app.get('/challenge', (c) => {
    const username = c.req.query('username')?.trim();
    if (!username) {
      return c.redirect('/');
    }
    return c.redirect(`/challenge/${encodeURIComponent(username)}`);
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
