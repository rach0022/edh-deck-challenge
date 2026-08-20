/**
 * Health check route.
 * Returns service status including cache and browser state.
 */

import { Hono } from 'hono';
import type { CacheService } from '../services/cache.js';
import type { MoxfieldService } from '../services/moxfield.js';

export function createHealthRoutes(cache: CacheService, moxfield: MoxfieldService): Hono {
  const app = new Hono();

  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        cache: cache.isConnected() ? 'connected' : 'disconnected',
        browser: moxfield.isReady() ? 'ready' : 'not_initialized',
      },
    });
  });

  return app;
}
