/**
 * Foreign-exchange service — provides the USD → CAD rate used to convert
 * card prices for the "Build a cEDH Deck" page.
 *
 * The rate is fetched from a free, no-auth endpoint and cached globally (one
 * key shared by all users) for 24 hours, so at most one FX request is made per
 * day regardless of traffic. If the live rate can't be fetched, we fall back
 * to a sane default and mark the result as non-live so the UI can note it.
 */

import type { CacheService } from './cache.js';
import type { FxInfo } from '../types.js';

/** Single global cache key — the rate is the same for everyone. */
const FX_CACHE_KEY = 'edh:fx:usdcad';

/** Cache the rate for a full day (in seconds). */
const FX_TTL_SECONDS = 24 * 60 * 60;

/** Free, keyless FX API. Returns { result, rates: { CAD, ... } }. */
const FX_API_URL = 'https://open.er-api.com/v6/latest/USD';

/**
 * Fallback rate used only when the live rate is unavailable. Chosen as a
 * rough recent USD→CAD value; the UI flags results using this as non-live.
 */
const FALLBACK_USD_TO_CAD = 1.38;

export interface FxService {
  /** Returns the USD→CAD rate (cached globally for 24h). */
  getUsdToCad(): Promise<FxInfo>;
}

interface ErApiResponse {
  result?: string;
  time_last_update_utc?: string;
  rates?: Record<string, number>;
}

export function createFxService(cache: CacheService): FxService {
  async function fetchLiveRate(): Promise<FxInfo | null> {
    try {
      const res = await fetch(FX_API_URL, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        console.error(`FX API returned HTTP ${res.status}`);
        return null;
      }
      const data = (await res.json()) as ErApiResponse;
      const cad = data.rates?.CAD;
      if (data.result !== 'success' || typeof cad !== 'number' || !Number.isFinite(cad) || cad <= 0) {
        console.error('FX API returned an unexpected payload:', data.result);
        return null;
      }
      return {
        usdToCad: cad,
        fetchedAt: new Date().toISOString(),
        live: true,
      };
    } catch (error) {
      console.error('FX API fetch failed:', error);
      return null;
    }
  }

  return {
    async getUsdToCad(): Promise<FxInfo> {
      // 1. Cached value (shared across all users, valid for 24h).
      const cached = await cache.get<FxInfo>(FX_CACHE_KEY);
      if (cached) return cached;

      // 2. Live fetch.
      const live = await fetchLiveRate();
      if (live) {
        await cache.set(FX_CACHE_KEY, live, FX_TTL_SECONDS);
        return live;
      }

      // 3. Fallback — do NOT cache for the full day so we retry sooner.
      const fallback: FxInfo = {
        usdToCad: FALLBACK_USD_TO_CAD,
        fetchedAt: new Date().toISOString(),
        live: false,
      };
      // Cache the fallback briefly (1 hour) to avoid hammering a failing API.
      await cache.set(FX_CACHE_KEY, fallback, 60 * 60);
      return fallback;
    },
  };
}
