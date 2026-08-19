import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateHTMLContent, renderHTML } from '../src/renderers/html-renderer.js';
import { organizeDecks } from '../src/domain/deck-organizer.js';
import type { ExtractionResult } from '../src/domain/commander-extractor.js';

const testExtractions: ExtractionResult[] = [
  {
    deckName: 'Giada Angels',
    deckId: 'deck-1',
    commanders: [{
      name: 'Giada, Font of Hope',
      colorIdentity: ['W'],
      imageUrl: 'https://cards.scryfall.io/normal/front/snc/14.jpg',
      setCode: 'snc',
      collectorNumber: '14',
    }],
    skipped: false,
  },
  {
    deckName: 'Krenko Goblins',
    deckId: 'deck-2',
    commanders: [{
      name: 'Krenko, Mob Boss',
      colorIdentity: ['R'],
      imageUrl: 'https://cards.scryfall.io/normal/front/m19/135.jpg',
      setCode: 'm19',
      collectorNumber: '135',
    }],
    skipped: false,
  },
  {
    deckName: 'Azorius Control',
    deckId: 'deck-3',
    commanders: [{
      name: 'Brago, King Eternal',
      colorIdentity: ['W', 'U'],
      imageUrl: 'https://cards.scryfall.io/normal/front/ema/198.jpg',
      setCode: 'ema',
      collectorNumber: '198',
    }],
    skipped: false,
  },
  {
    deckName: 'No Image Commander Deck',
    deckId: 'deck-4',
    commanders: [{
      name: 'Mystery Commander',
      colorIdentity: ['B'],
      imageUrl: null,
      setCode: 'unk',
      collectorNumber: '1',
    }],
    skipped: false,
  },
];

function createTestProgress() {
  return organizeDecks(testExtractions, 'testuser');
}

describe('generateHTMLContent', () => {
  it('uses Scryfall art_crop URLs as background-image for filled slots', () => {
    const progress = createTestProgress();
    const html = generateHTMLContent(progress);

    expect(html).toContain('https://api.scryfall.com/cards/snc/14?format=image');
    expect(html).toContain('https://api.scryfall.com/cards/m19/135?format=image');
    expect(html).toContain('https://api.scryfall.com/cards/ema/198?format=image');
    expect(html).toContain('version=art_crop');
  });

  it('sets background-image via inline style on filled slot cards', () => {
    const progress = createTestProgress();
    const html = generateHTMLContent(progress);

    expect(html).toMatch(/style="background-image: url\(/);
  });

  it('shows "No deck assigned" text for empty slots', () => {
    const progress = createTestProgress();
    const html = generateHTMLContent(progress);

    expect(html).toContain('No deck assigned');
    const matches = html.match(/No deck assigned/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(28);
  });

  it('uses a dark overlay gradient for readability on filled cards', () => {
    const progress = createTestProgress();
    const html = generateHTMLContent(progress);

    expect(html).toContain('.slot-card.filled:not(.multi)::before');
    expect(html).toContain('linear-gradient');
  });

  it('displays commander names on filled slots', () => {
    const progress = createTestProgress();
    const html = generateHTMLContent(progress);

    expect(html).toContain('Giada, Font of Hope');
    expect(html).toContain('Krenko, Mob Boss');
    expect(html).toContain('Brago, King Eternal');
    expect(html).toContain('Mystery Commander');
  });

  it('displays deck names on filled slots', () => {
    const progress = createTestProgress();
    const html = generateHTMLContent(progress);

    expect(html).toContain('Giada Angels');
    expect(html).toContain('Krenko Goblins');
    expect(html).toContain('Azorius Control');
  });

  it('groups color combinations by category', () => {
    const progress = createTestProgress();
    const html = generateHTMLContent(progress);

    expect(html).toContain('Colorless');
    expect(html).toContain('Mono Color');
    expect(html).toContain('Two Color (Guilds)');
    // Mana pip SVGs should be present
    expect(html).toContain('svgs.scryfall.io/card-symbols/');
    expect(html).toContain('Four Color');
    expect(html).toContain('Five Color');
  });

  it('generates valid self-contained HTML with inline CSS', () => {
    const progress = createTestProgress();
    const html = generateHTMLContent(progress);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<style>');
    expect(html).toContain('</html>');
    expect(html).not.toContain('<link rel="stylesheet"');
  });

  it('includes username in the HTML title and header', () => {
    const progress = createTestProgress();
    const html = generateHTMLContent(progress);

    expect(html).toContain('<title>EDH 32 Deck Challenge - testuser</title>');
  });

  it('displays progress summary', () => {
    const progress = createTestProgress();
    const html = generateHTMLContent(progress);

    expect(html).toContain('4 / 32 slots filled');
  });

  it('generates background for commanders using set/cn even when imageUrl is null', () => {
    const progress = createTestProgress();
    const html = generateHTMLContent(progress);

    expect(html).toContain('https://api.scryfall.com/cards/unk/1?format=image');
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

    expect(filepath).toBe(join(tempDir, 'testuser-edh-challenge.html'));
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
