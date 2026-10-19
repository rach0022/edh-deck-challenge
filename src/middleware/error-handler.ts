/**
 * Global error handling middleware for Hono.
 * Catches known domain errors and returns appropriate HTTP responses.
 */

import type { Context } from 'hono';
import {
  MoxfieldUserNotFoundError,
  MoxfieldAPIError,
  MoxfieldTimeoutError,
} from '../services/moxfield.js';

export function handleError(error: unknown, c: Context): Response {
  if (error instanceof MoxfieldUserNotFoundError) {
    return c.json(
      { success: false, error: error.message },
      404
    );
  }

  if (error instanceof MoxfieldAPIError) {
    console.error(
      `Moxfield API error (status ${error.statusCode}) on ${c.req.method} ${c.req.path}`,
    );
    const status = error.statusCode >= 500 ? 502 : 400;
    return c.json(
      { success: false, error: error.message },
      status
    );
  }

  if (error instanceof MoxfieldTimeoutError) {
    // Previously silent — log the underlying cause so "could not connect to
    // Moxfield" failures are diagnosable (Cloudflare block vs. timeout vs.
    // launch failure).
    const cause = (error as { cause?: unknown }).cause;
    const url = (error as { url?: string }).url;
    console.error(
      `Moxfield unreachable on ${c.req.method} ${c.req.path}${url ? ` (url: ${url})` : ''}:`,
      cause ?? error,
    );
    return c.json(
      { success: false, error: error.message },
      504
    );
  }

  // Unknown errors
  console.error('Unhandled error:', error);
  const message = error instanceof Error ? error.message : 'Internal server error';
  return c.json(
    { success: false, error: message },
    500
  );
}
