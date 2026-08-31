/**
 * Build script — generates the cEDH reference corpus.
 *
 * Pipeline:
 *   1. Fetch the cEDH Decklist Database (a single database.json on GitHub).
 *   2. Keep COMPETITIVE (and BREW) archetypes, skip DEPRECATED/HISTORIC.
 *   3. For each archetype, pull out its Moxfield decklist links and extract
 *      the deck publicId. Non-Moxfield links (tappedout, etc.) are ignored.
 *   4. Use the existing Puppeteer-backed Moxfield service to fetch every
 *      deck's full card list (commanders + mainboard).
 *   5. Write the enriched corpus to src/data/cedh-corpus.json, which is
 *      committed and bundled into the build (copied to dist by the build step).
 *
 * Run with:  npm run build:cedh
 * (which is `tsx src/scripts/build-cedh-corpus.ts`)
 *
 * Flags:
 *   --limit=N        Only process the first N Moxfield decks (for testing).
 *   --include-brew   Include BREW section decks (default: competitive only).
 *   --out=PATH       Override the output file path.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import {
  createMoxfieldService,
  parseMoxfieldDeckId,
  MoxfieldAPIError,
  MoxfieldTimeoutError,
} from '../services/moxfield.js';
import { extractDeckCards } from '../services/cedh.js';
import type { CedhCorpus, CedhReferenceDeck } from '../types.js';

const DATABASE_URL =
  'https://raw.githubusercontent.com/averagewagon/cEDH-Decklist-Database/main/_data/database.json';

// ─── Raw database types (subset we use) ─────────────────────────────────────

interface RawCommander {
  name: string;
  link: string;
}

interface RawDecklist {
  link: string;
  title: string;
  primer: boolean;
}

interface RawArchetype {
  commander: RawCommander[];
  colors: string[];
  section: 'BREW' | 'COMPETITIVE' | 'DEPRECATED';
  decklists: RawDecklist[];
  title: string;
  id: string;
}

// ─── CLI args ────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  limit: number | null;
  includeBrew: boolean;
  outPath: string | null;
} {
  let limit: number | null = null;
  let includeBrew = false;
  let outPath: string | null = null;

  for (const arg of argv) {
    if (arg.startsWith('--limit=')) {
      const n = parseInt(arg.slice('--limit='.length), 10);
      limit = Number.isFinite(n) && n > 0 ? n : null;
    } else if (arg === '--include-brew') {
      includeBrew = true;
    } else if (arg.startsWith('--out=')) {
      outPath = arg.slice('--out='.length);
    }
  }

  return { limit, includeBrew, outPath };
}

// ─── Main ──────────────────────────────────────────────────────────────────

interface PlannedDeck {
  publicId: string;
  title: string;
  deckTitle: string;
  commanders: string[];
  commanderImages: (string | null)[];
  colors: string[];
  moxfieldUrl: string;
}

/**
 * Flattens the database into a de-duplicated list of Moxfield decks to fetch.
 * The same publicId can appear under multiple archetypes; we keep the first.
 */
function planDecks(
  database: RawArchetype[],
  includeBrew: boolean,
): PlannedDeck[] {
  const allowedSections = new Set<string>(['COMPETITIVE']);
  if (includeBrew) allowedSections.add('BREW');

  const seen = new Set<string>();
  const planned: PlannedDeck[] = [];

  for (const archetype of database) {
    if (!allowedSections.has(archetype.section)) continue;

    const commanders = (archetype.commander ?? []).map((c) => c.name);
    const commanderImages = (archetype.commander ?? []).map((c) => c.link ?? null);
    const colors = archetype.colors ?? [];

    for (const decklist of archetype.decklists ?? []) {
      const publicId = parseMoxfieldDeckId(decklist.link);
      if (!publicId || seen.has(publicId)) continue;
      seen.add(publicId);

      planned.push({
        publicId,
        title: archetype.title,
        deckTitle: decklist.title,
        commanders,
        commanderImages,
        colors,
        moxfieldUrl: `https://www.moxfield.com/decks/${publicId}`,
      });
    }
  }

  return planned;
}

async function main(): Promise<void> {
  const { limit, includeBrew, outPath } = parseArgs(process.argv.slice(2));

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const defaultOut = join(__dirname, '..', 'data', 'cedh-corpus.json');
  const output = outPath ?? defaultOut;

  console.log('📥 Fetching cEDH Decklist Database...');
  const res = await fetch(DATABASE_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Failed to fetch database.json: HTTP ${res.status}`);
  }
  const database = (await res.json()) as RawArchetype[];
  console.log(`   Loaded ${database.length} archetypes.`);

  let planned = planDecks(database, includeBrew);
  console.log(
    `🔗 Found ${planned.length} unique Moxfield decks` +
      ` (sections: COMPETITIVE${includeBrew ? ' + BREW' : ''}).`,
  );

  if (limit !== null) {
    planned = planned.slice(0, limit);
    console.log(`   Limiting to first ${planned.length} decks (--limit).`);
  }

  const config = loadConfig();
  const moxfield = createMoxfieldService(config);

  console.log('🌐 Initializing Moxfield browser (solving Cloudflare)...');
  await moxfield.initialize();

  const decks: CedhReferenceDeck[] = [];
  let failures = 0;

  for (let i = 0; i < planned.length; i++) {
    const p = planned[i];
    const label = `[${i + 1}/${planned.length}] ${p.title} — ${p.deckTitle} (${p.publicId})`;
    try {
      const detail = await moxfield.fetchDeckDetail(p.publicId);
      const { names: cardNames, prices: cardPrices } = extractDeckCards(detail);

      decks.push({
        publicId: p.publicId,
        title: p.title,
        deckTitle: p.deckTitle,
        commanders: p.commanders,
        commanderImages: p.commanderImages,
        colors: p.colors,
        moxfieldUrl: p.moxfieldUrl,
        cardNames,
        cardPrices,
      });
      const pricedCount = Object.keys(cardPrices).length;
      console.log(`✅ ${label} — ${cardNames.length} cards, ${pricedCount} priced`);
    } catch (error) {
      failures++;
      if (error instanceof MoxfieldAPIError) {
        console.warn(`⚠️  ${label} — API error (${error.statusCode}), skipping`);
      } else if (error instanceof MoxfieldTimeoutError) {
        console.warn(`⚠️  ${label} — timeout, skipping`);
      } else {
        console.warn(`⚠️  ${label} — ${(error as Error).message}, skipping`);
      }
    }

    // Gentle pacing to avoid hammering Moxfield.
    await sleep(400);
  }

  await moxfield.shutdown();

  const corpus: CedhCorpus = {
    generatedAt: new Date().toISOString(),
    deckCount: decks.length,
    decks,
  };

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(corpus, null, 2), 'utf-8');

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Wrote ${decks.length} reference decks to ${output}`);
  if (failures > 0) console.log(`⚠️  ${failures} decks failed and were skipped.`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error('❌ Build failed:', error);
  process.exit(1);
});
