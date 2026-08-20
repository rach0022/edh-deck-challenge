/**
 * Challenge routes — the main API endpoints.
 *
 * GET /api/challenge/:username - Get 32-slot challenge progress
 * GET /api/decks/:username     - List all decks for a user
 * GET /api/deck/:deckId        - Get detail for a single deck
 * POST /api/refresh/:username  - Force refresh cached data
 */

import { Hono } from 'hono';
import type { ChallengeService } from '../services/challenge.js';
import { handleError } from '../middleware/error-handler.js';

export function createChallengeRoutes(challengeService: ChallengeService): Hono {
  const app = new Hono();

  /**
   * GET /api/challenge/:username
   * Returns the full 32-slot challenge progress with summary stats.
   */
  app.get('/challenge/:username', async (c) => {
    const username = c.req.param('username').trim();

    if (!username || username.length < 2 || username.length > 50) {
      return c.json(
        { success: false, error: 'Username must be between 2 and 50 characters.' },
        400
      );
    }

    try {
      const { data, cached } = await challengeService.getChallenge(username);
      return c.json({
        success: true,
        data,
        cached,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      return handleError(error, c);
    }
  });

  /**
   * GET /api/decks/:username
   * Returns a flat list of all commander decks for the user.
   */
  app.get('/decks/:username', async (c) => {
    const username = c.req.param('username').trim();

    if (!username || username.length < 2 || username.length > 50) {
      return c.json(
        { success: false, error: 'Username must be between 2 and 50 characters.' },
        400
      );
    }

    try {
      const { data, cached } = await challengeService.getDecks(username);
      return c.json({
        success: true,
        data,
        cached,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      return handleError(error, c);
    }
  });

  /**
   * GET /api/deck/:deckId
   * Returns detail for a single deck (commanders, card count, color identity).
   */
  app.get('/deck/:deckId', async (c) => {
    const deckId = c.req.param('deckId').trim();

    if (!deckId) {
      return c.json(
        { success: false, error: 'Deck ID is required.' },
        400
      );
    }

    try {
      const { data, cached } = await challengeService.getDeckDetail(deckId);
      return c.json({
        success: true,
        data,
        cached,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      return handleError(error, c);
    }
  });

  /**
   * POST /api/refresh/:username
   * Forces a cache refresh for the given user.
   * Use sparingly — this triggers a full Moxfield scrape.
   */
  app.post('/refresh/:username', async (c) => {
    const username = c.req.param('username').trim();

    if (!username || username.length < 2 || username.length > 50) {
      return c.json(
        { success: false, error: 'Username must be between 2 and 50 characters.' },
        400
      );
    }

    try {
      const data = await challengeService.refreshChallenge(username);
      return c.json({
        success: true,
        data,
        cached: false,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      return handleError(error, c);
    }
  });

  return app;
}
