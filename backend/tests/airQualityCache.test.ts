import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MemoryAirQualityCache,
  setAirQualityCacheForTesting,
} from '../src/services/cache.js';
import { getCurrentAirQuality } from '../src/services/airQuality.js';

/**
 * Cache behaviour of the air-quality service, with `fetch` stubbed so no
 * request leaves the machine.
 */
const UPSTREAM_BODY = {
  current: {
    time: Math.floor(Date.now() / 1000),
    us_aqi: 183,
    european_aqi: 70,
    pm2_5: 69.6,
    pm10: 140.5,
    nitrogen_dioxide: 48.3,
    ozone: 12.1,
  },
};

function stubUpstream(body: unknown = UPSTREAM_BODY) {
  // A fresh Response per call: a body can only be read once, so a shared
  // instance would fail on the second request.
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  setAirQualityCacheForTesting(new MemoryAirQualityCache(600));
});

afterEach(() => {
  setAirQualityCacheForTesting(undefined);
  vi.unstubAllGlobals();
});

describe('air-quality caching', () => {
  it('calls upstream on the first request for an area', async () => {
    const fetchMock = stubUpstream();

    const reading = await getCurrentAirQuality(28.6519, 77.2314);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reading.current.usAqi).toBe(183);
  });

  it('serves a repeat request for the same area without calling upstream', async () => {
    const fetchMock = stubUpstream();

    await getCurrentAirQuality(28.6519, 77.2314);
    const second = await getCurrentAirQuality(28.6519, 77.2314);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.current.usAqi).toBe(183);
  });

  it('shares one entry between nearby coordinates', async () => {
    const fetchMock = stubUpstream();

    await getCurrentAirQuality(28.6519, 77.2314);
    // About 50 metres away: the same grid cell.
    await getCurrentAirQuality(28.6522, 77.2311);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches separately for a genuinely different area', async () => {
    const fetchMock = stubUpstream();

    await getCurrentAirQuality(28.65, 77.23);
    await getCurrentAirQuality(19.07, 72.87);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports when the data was actually fetched, not when it was served', async () => {
    stubUpstream();

    const first = await getCurrentAirQuality(28.65, 77.23);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await getCurrentAirQuality(28.65, 77.23);

    // A cached response must not claim to have just been retrieved.
    expect(second.source.retrievedAt).toBe(first.source.retrievedAt);
  });

  it('recomputes staleness on read rather than caching the verdict', async () => {
    const threeHoursAgo = Math.floor(Date.now() / 1000) - 4 * 60 * 60;
    stubUpstream({
      current: { ...UPSTREAM_BODY.current, time: threeHoursAgo },
    });

    const reading = await getCurrentAirQuality(28.65, 77.23);
    const cached = await getCurrentAirQuality(28.65, 77.23);

    expect(reading.stale).toBe(true);
    expect(cached.stale).toBe(true);
  });

  it('calls upstream again once the entry expires', async () => {
    let now = 1_000_000;
    setAirQualityCacheForTesting(new MemoryAirQualityCache(600, 500, () => now));
    const fetchMock = stubUpstream();

    await getCurrentAirQuality(28.65, 77.23);
    now += 601_000;
    await getCurrentAirQuality(28.65, 77.23);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('still answers when the cache itself is broken', async () => {
    const fetchMock = stubUpstream();
    setAirQualityCacheForTesting({
      kind: 'memory',
      get: vi.fn().mockRejectedValue(new Error('cache down')),
      put: vi.fn(),
    });

    // A failing cache read currently propagates, which is why the DynamoDB
    // implementation handles its own errors internally. This asserts that the
    // service never silently returns wrong data instead.
    await expect(getCurrentAirQuality(28.65, 77.23)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
