/**
 * Cache service with multiple backend support:
 * - Upstash Redis (HTTP-based, ideal for serverless/free hosting)
 * - Redis via ioredis (TCP, ideal for local Docker or self-hosted Redis)
 * - In-memory (zero-config fallback for development)
 *
 * The driver is selected based on the CACHE_DRIVER env var or auto-detected
 * from available credentials. See config.ts for resolution logic.
 */

import { Redis as UpstashRedis } from '@upstash/redis';
import { Redis as IORedis } from 'ioredis';
import type { AppConfig } from '../config.js';

export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  isConnected(): boolean;
}

/**
 * Creates a cache service based on the configured driver.
 */
export function createCacheService(config: AppConfig): CacheService {
  switch (config.cacheDriver) {
    case 'upstash':
      return createUpstashCache(config);
    case 'redis':
      return createRedisCache(config);
    case 'memory':
      console.warn('⚠️  Using in-memory cache (not suitable for production).');
      return createMemoryCache(config);
  }
}

// ─── Upstash Redis (HTTP) ───────────────────────────────────────────────────

function createUpstashCache(config: AppConfig): CacheService {
  const redis = new UpstashRedis({
    url: config.redisUrl,
    token: config.redisToken,
  });

  let connected = false;

  async function ensureConnected(): Promise<void> {
    if (!connected) {
      try {
        await redis.ping();
        connected = true;
        console.log('✅ Connected to Upstash Redis (HTTP)');
      } catch (error) {
        console.error('❌ Failed to connect to Upstash Redis:', error);
        throw error;
      }
    }
  }

  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        await ensureConnected();
        const value = await redis.get<T>(key);
        return value;
      } catch (error) {
        console.error(`Cache GET error for key "${key}":`, error);
        return null;
      }
    },

    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
      try {
        await ensureConnected();
        const ttl = ttlSeconds ?? config.cacheTtlSeconds;
        await redis.set(key, value, { ex: ttl });
      } catch (error) {
        console.error(`Cache SET error for key "${key}":`, error);
      }
    },

    async delete(key: string): Promise<void> {
      try {
        await ensureConnected();
        await redis.del(key);
      } catch (error) {
        console.error(`Cache DELETE error for key "${key}":`, error);
      }
    },

    isConnected(): boolean {
      return connected;
    },
  };
}

// ─── Standard Redis via ioredis (TCP) ───────────────────────────────────────

function createRedisCache(config: AppConfig): CacheService {
  const redis = new IORedis(config.redisConnectionUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      if (times > 5) return null; // Stop retrying after 5 attempts
      return Math.min(times * 200, 2000);
    },
  });

  let connected = false;

  redis.on('connect', () => {
    connected = true;
    console.log('✅ Connected to Redis (TCP)');
  });

  redis.on('error', (err: Error) => {
    console.error('❌ Redis connection error:', err.message);
    connected = false;
  });

  redis.on('close', () => {
    connected = false;
  });

  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const value = await redis.get(key);
        if (value === null) return null;
        return JSON.parse(value) as T;
      } catch (error) {
        console.error(`Cache GET error for key "${key}":`, error);
        return null;
      }
    },

    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
      try {
        const ttl = ttlSeconds ?? config.cacheTtlSeconds;
        await redis.set(key, JSON.stringify(value), 'EX', ttl);
      } catch (error) {
        console.error(`Cache SET error for key "${key}":`, error);
      }
    },

    async delete(key: string): Promise<void> {
      try {
        await redis.del(key);
      } catch (error) {
        console.error(`Cache DELETE error for key "${key}":`, error);
      }
    },

    isConnected(): boolean {
      return connected;
    },
  };
}

// ─── In-Memory Cache ────────────────────────────────────────────────────────

function createMemoryCache(config: AppConfig): CacheService {
  const store = new Map<string, { value: unknown; expiresAt: number }>();

  function cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.expiresAt <= now) {
        store.delete(key);
      }
    }
  }

  // Periodic cleanup every 60 seconds
  setInterval(cleanup, 60_000);

  return {
    async get<T>(key: string): Promise<T | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value as T;
    },

    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
      const ttl = ttlSeconds ?? config.cacheTtlSeconds;
      store.set(key, {
        value,
        expiresAt: Date.now() + ttl * 1000,
      });
    },

    async delete(key: string): Promise<void> {
      store.delete(key);
    },

    isConnected(): boolean {
      return true;
    },
  };
}
