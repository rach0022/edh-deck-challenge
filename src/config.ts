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
  /** Scryfall API base, e.g. https://api.scryfall.com */
  scryfallBaseUrl: string;
  /** EDHREC JSON base, e.g. https://json.edhrec.com */
  edhrecBaseUrl: string;
  /** Autocomplete/Scryfall request timeout (ms). Default 5000. */
  scryfallTimeoutMs: number;
  /** EDHREC fetch timeout (ms). Default 30000. */
  edhrecTimeoutMs: number;
  /** Puppeteer timeout for Cloudflare challenge (ms) */
  puppeteerTimeoutMs: number;
  /** Whether to run Puppeteer in headless mode */
  puppeteerHeadless: boolean;
  /** Environment name */
  nodeEnv: string;
  /** Host-facing port shown in startup logs (e.g. the Docker published port).
   *  Falls back to `port` when not set. */
  publicPort: number;
  /**
   * The host machine's LAN/"home network" IP (or hostname) to advertise in the
   * startup logs so other devices can reach the app. Must be supplied by the
   * host at run time (e.g. `LAN_HOST` in docker-compose), because a container
   * can only see Docker's internal network, not the host's real LAN address.
   * Empty when not provided — the server then falls back to auto-detected
   * local interfaces. */
  lanHost: string;
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
    scryfallBaseUrl: process.env.SCRYFALL_BASE_URL ?? 'https://api.scryfall.com',
    edhrecBaseUrl: process.env.EDHREC_BASE_URL ?? 'https://json.edhrec.com',
    scryfallTimeoutMs: parseInt(process.env.SCRYFALL_TIMEOUT_MS ?? '5000', 10),
    edhrecTimeoutMs: parseInt(process.env.EDHREC_TIMEOUT_MS ?? '30000', 10),
    puppeteerTimeoutMs: parseInt(process.env.PUPPETEER_TIMEOUT_MS ?? '60000', 10),
    puppeteerHeadless: process.env.PUPPETEER_HEADLESS !== 'false',
    nodeEnv: process.env.NODE_ENV ?? 'development',
    publicPort: parseInt(process.env.PUBLIC_PORT ?? process.env.PORT ?? '3000', 10),
    lanHost: (process.env.LAN_HOST ?? '').trim(),
  };
}
