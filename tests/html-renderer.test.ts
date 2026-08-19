import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateHTMLContent, renderHTML } from '../src/renderers/html-renderer.js';
import { organizeDecks } from '../src/domain/deck-organizer.js';
import type { ExtractionResult } from '../src/domain/commander-extractor.js';

// Test data: a mix of filled and empty slots
const testExtractions: ExtractionResult[] = [
  {
    deckName: 'Giada Angels',
    deckId: 'deck-1',
    commanders: [
      {
        name: 'Giada, Font of Hope',
        colorIdentity: ['W'],
        imageUrl: 'https://cards.scryfall.io/normal/front/snc/14.jpg',
        setCode: 'snc',
        collectorNumber: '14',
      },
    ],
    skipped: false,
  },
  {
    deckName: 'Krenko Goblins',
    deckId: 'deck-2',
    commanders: [
      {
        name: 'Krenko, Mob Boss',
        colorIdentity: ['R'],
        imageUrl: 'https://cards.scryfall.io/normal/front/m19/135.jpg',
        setCode: 'm19',
        collectorNumber: '135',
      },
    ],
    skipped: false,
  },
  {
    deckName: 'Azorius Control',
    deckId: 'deck-3',
    commanders: [
      {
        name: 'Brago, King Eternal',
        colorIdentity: ['W', 'U'],
        imageUrl: 'https://cards.scryfall.io/normal/front/ema/198.jpg',
        setCode: 'ema',
        collectorNumber: '198',
      },
    ],
    skipped: false,
  },
  {
    deckName: 'No Image Commander Deck',
    deckId: 'deck-4',
    commanders: [
      {
        name: 'Mystery Commander',
        colorIdentity: ['B'],
        imageUrl: null,
        setCode: 'unk',
        collectorNumber: '1',
      },
    ],
    skipped: false,
  },
];

function createTestProgress() {
  return organizeDecks(testExtractions, 'testuser');
}

describe('generateHTMLContent', () => {
  it('contains correct image URLs for filled slots', () => {
    const progress = createTestProgress();
    const html = generateHTMLContent(progress);

    // Verify image URLs appear in <img> src attributes
    expect(html).toContain('https://cards.scryfall.io/normal/front/snc/14.jpg');
    expect(html).toContain('https://cards.scryfall.io/normal/front/m19/135.jpg');
    expect(html).toContain('https://cards.scryfall.io/normal/front/ema/198.jpg');
  });

  it('contains image tags with src attributes for commanders with images', () => {
    const progress = createTestProgress();
    const html = generateHTMLContent(progress);

    // Verify img tags have proper src
    expect(html).toMatch(/<img\s[^>]*src="https:\/\/cards\.scryfall\.io\/normal\/front\/snc\/14\.jpg"/);
    expect(html).toMatch(/<img\s[^>]*src="https:\/\/cards\.scryfall\.io\/normal\/front\/ema\/198\.jpg"/);
  });

  it('shows "No deck assigned" text for empty slots', () => {
    const progress = createTestProgress();
    const html = generateHTMLContent(progress);

    // Most slots are empty, so "No deck assigned" should appear
    expect(html).toContain('No deck assigned');

    // Count occurrences - we have 4 filled slots, so 28 empty ones
    const matches = html.match(/No deck assigned/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(28);
  });

  it('includes onerror attribute on images for load failure fallback', () => {
    const progress = createTestProgress();
    const html = generateHTMLContent(progress);

    // Every <img> should have an onerror attribute
    const imgTags = html.match(/<img[^>]+>/g) ?? [];
    expect(imgTags.length).toBeGreaterThan(0);

    for (const img of imgTags) {
      expect(img).toContain('onerror');
    }
  });

  it('displays commander name as text when imageUrl is null', () => {
    const progress = createTestProgress();
    const html = generateHTMLContent(progress);

    // The Mono Black commander has no image, should appear as text-only
    expect(html).toContain('Mystery Commander');
    // Should use the text-only class rather than an img tag for this commander
    expect(html).toMatch(/commander-text-only[^>]*>Mystery Commander/);
  });

  it('displays commander names alongside images', () => {
    const progress = createTestProgress();
    const html = generateHTMLContent(progress);

    // Commander names should appear in the output
    expect(html).toContain('Giada, Font of Hope');
    expect(html).toContain('Krenko, Mob Boss');
    expect(html).toContain('Brago, King Eternal');
  });

  it('groups color combinations by category', () => {
    const progress = createTestProgress();
    const html = generateHTMLContent(progress);

    // Category section headers should appear
    expect(html).toContain('Colorless');
    expect(html).toContain('Mono Color');
    expect(html).toContain('Two Color (Guilds)');
    expect(html).toContain('Three Color (Shards &amp; Wedges)');
    expect(html).toContain('Four Color');
    expect(html).toContain('Five Color');
  });

  it('generates valid self-contained HTML with inline CSS', () => {
    const progress = createTestProgress();
    const html = generateHTMLContent(progress);

    // Should be a complete HTML document
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<head>');
    expect(html).toContain('<style>');
    expect(html).toContain('</style>');
    expect(html).toContain('</html>');

    // Should not reference external stylesheets
    expect(html).not.toContain('<link rel="stylesheet"');
  });

  it('includes username in the HTML title and header', () => {
    const progress = createTestProgress();
    const html = generateHTMLContent(progress);

    expect(html).toContain('<title>EDH 32 Deck Challenge - testuser</title>');
    expect(html).toContain('testuser');
  });

  it('displays progress summary', () => {
    const progress = createTestProgress();
    const html = generateHTMLContent(progress);

    expect(html).toContain('4 / 32 slots filled');
  });
});

describe('renderHTML', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  it('writes file with correct filename pattern to output directory', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'edh-test-'));
    const progress = createTestProgress();

    const filepath = renderHTML(progress, { outputDir: tempDir });

    // Should return the full file path
    expect(filepath).toBe(join(tempDir, 'testuser-edh-challenge.html'));

    // File should exist
    expect(existsSync(filepath)).toBe(true);
  });

  it('written file contains valid HTML content', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'edh-test-'));
    const progress = createTestProgress();

    const filepath = renderHTML(progress, { outputDir: tempDir });
    const content = readFileSync(filepath, 'utf-8');

    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('testuser');
    expect(content).toContain('Giada, Font of Hope');
  });

  it('uses username in the filename', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'edh-test-'));
    const progress = organizeDecks(testExtractions, 'player123');

    const filepath = renderHTML(progress, { outputDir: tempDir });

    expect(filepath).toContain('player123-edh-challenge.html');
    expect(existsSync(filepath)).toBe(true);
  });
});
