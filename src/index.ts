#!/usr/bin/env node
/**
 * EDH 32 Deck Challenge Checker - CLI Entry Point
 *
 * Orchestrates the full pipeline:
 * validate → fetch decks → fetch details → extract commanders →
 * resolve identities → organize → render ASCII → render HTML
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateUsername } from './validator.js';
import {
  MoxfieldUserNotFoundError,
  MoxfieldAPIError,
  MoxfieldTimeoutError,
} from './api/moxfield-client.js';
import { createBrowserClient } from './api/browser-client.js';
import { extractCommanders } from './domain/commander-extractor.js';
import { organizeDecks } from './domain/deck-organizer.js';
import { renderASCII } from './renderers/ascii-renderer.js';
import { renderHTML } from './renderers/html-renderer.js';

async function main(): Promise<void> {
  // 1. Parse username from CLI arguments
  const usernameArg = process.argv[2];

  // 2. Validate username
  const validation = validateUsername(usernameArg);
  if (!validation.valid) {
    console.error(validation.error);
    process.exit(1);
  }

  const { username } = validation;

  // 3. Create browser-based Moxfield client (handles Cloudflare)
  let client: Awaited<ReturnType<typeof createBrowserClient>>;
  try {
    client = await createBrowserClient({
      baseUrl: 'https://api2.moxfield.com/v2',
      timeoutMs: 60000,
      headless: true,
    });
  } catch (error: unknown) {
    if (error instanceof MoxfieldTimeoutError) {
      console.error('Error: Could not reach Moxfield. The service may be temporarily unavailable.');
    } else {
      console.error('Error: Failed to launch browser. Make sure Chrome/Chromium is available.');
    }
    process.exit(1);
  }

  try {
    // 4. Fetch user decks
    console.error(`Fetching decks for "${username}"...`);
    const deckSummaries = await client.fetchUserDecks(username);

    if (deckSummaries.length === 0) {
      console.error(`No public decks found for user "${username}".`);
      process.exit(1);
    }

    console.error(`Found ${deckSummaries.length} Commander deck(s). Fetching details...`);

    // 5. Fetch detail for each deck sequentially
    const deckDetails = [];
    for (const summary of deckSummaries) {
      const detail = await client.fetchDeckDetail(summary.publicId);
      deckDetails.push(detail);
    }

    // 6. Extract commanders from each deck
    const extractions = deckDetails.map((deck) => extractCommanders(deck));

    // 7. Log skipped decks to stderr
    for (const extraction of extractions) {
      if (extraction.skipped) {
        console.error(`Skipping deck "${extraction.deckName}" — no commander found.`);
      }
    }

    // 8. Organize decks into 32 color combination slots
    const progress = organizeDecks(extractions, username);

    // 9. Render ASCII diagram to stdout
    const asciiOutput = renderASCII(progress);
    console.log(asciiOutput);

    // 10. Render HTML file to build/ directory
    const buildDir = join(import.meta.dirname, '..', 'build');
    mkdirSync(buildDir, { recursive: true });
    const htmlPath = renderHTML(progress, { outputDir: buildDir });
    console.log(`\nHTML output written to: ${htmlPath}`);
  } catch (error: unknown) {
    if (error instanceof MoxfieldUserNotFoundError) {
      console.error(`Error: Moxfield user "${username}" not found.`);
      process.exit(1);
    }

    if (error instanceof MoxfieldAPIError) {
      console.error(
        `Error: Moxfield API returned an error (${error.statusCode}). Please try again later.`
      );
      process.exit(1);
    }

    if (error instanceof MoxfieldTimeoutError) {
      console.error(
        'Error: Could not reach Moxfield. The service may be temporarily unavailable.'
      );
      process.exit(1);
    }

    // Unexpected errors
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('An unexpected error occurred.');
    }
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
