/**
 * Application configuration loaded from environment variables.
 * Supports multiple cache drivers: upstash (HTTP), redis (TCP/ioredis), or memory.
 */

export type CacheDriver = 'upstash' | 'redis' | 'memory';

export interface AppConfig {
  port: number;
  /** Cache driver: 'upstash' (HTTP), 'redis' (TCP via ioredis), or 'memory' */
  cacheDriver: CacheDriver;
  /** Upstash Redis REST URL (from Upstash dashboard) */
  redisUrl: string;
  /** Upstash Redis REST token (from Upstash dashboard) */
  redisToken: string;
  /** Standard Redis URL for ioredis (e.g., redis://localhost:6379) */
  redisConnectionUrl: string;
  /** Cache TTL in seconds (default: 15 minutes) */
  cacheTtlSeconds: number;
  /** Moxfield base API URL */
  moxfieldBaseUrl: string;
  /** Puppeteer timeout for Cloudflare challenge (ms) */
  puppeteerTimeoutMs: number;
  /** Whether to run Puppeteer in headless mode */
  puppeteerHeadless: boolean;
  /** Environment name */
  nodeEnv: string;
}

/**
 * Determines which cache driver to use based on environment variables.
 * Priority: explicit CACHE_DRIVER → auto-detect from credentials → memory fallback.
 */
function resolveCacheDriver(): CacheDriver {
  const explicit = process.env.CACHE_DRIVER?.toLowerCase();
  if (explicit === 'upstash' || explicit === 'redis' || explicit === 'memory') {
    return explicit;
  }

  // Auto-detect: if Upstash credentials are set, use Upstash
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return 'upstash';
  }

  // Auto-detect: if a standard Redis URL is set, use ioredis
  if (process.env.REDIS_URL) {
    return 'redis';
  }

  return 'memory';
}

export function loadConfig(): AppConfig {
  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    cacheDriver: resolveCacheDriver(),
    redisUrl: process.env.UPSTASH_REDIS_REST_URL ?? '',
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
    redisConnectionUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS ?? '900', 10),
    moxfieldBaseUrl: process.env.MOXFIELD_BASE_URL ?? 'https://api2.moxfield.com/v2',
    puppeteerTimeoutMs: parseInt(process.env.PUPPETEER_TIMEOUT_MS ?? '60000', 10),
    puppeteerHeadless: process.env.PUPPETEER_HEADLESS !== 'false',
    nodeEnv: process.env.NODE_ENV ?? 'development',
  };
}
