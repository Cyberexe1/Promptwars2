import {
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import type { CurrentAirQuality, DataSource, Outlook } from '../types.js';

const nullableNumber = z.number().nullable();

/**
 * Shape a cached item must have to be trusted.
 *
 * Mirrors `CachedReading`. Unknown keys are stripped rather than rejected, so
 * an item written by a newer version that added a field is still usable.
 */
const cachedReadingSchema = z.object({
  current: z.object({
    usAqi: nullableNumber,
    europeanAqi: nullableNumber,
    pm25: nullableNumber,
    pm10: nullableNumber,
    nitrogenDioxide: nullableNumber,
    ozone: nullableNumber,
    observedAt: z.string().min(1),
  }),
  source: z.object({
    name: z.string().min(1),
    url: z.string().url(),
    retrievedAt: z.string().min(1),
  }),
  outlook: z
    .object({
      hours: z.array(
        z.object({ time: z.string().min(1), usAqi: nullableNumber }),
      ),
      cleanestHour: z.string().nullable(),
      worstHour: z.string().nullable(),
      utcOffsetSeconds: z.number().default(0),
      windowSpread: z.number().nullable().default(null),
    })
    .optional(),
});

/**
 * Air-quality reading cache.
 *
 * Purpose is efficiency: neighbouring users asking about the same city should
 * not each trigger an upstream call. Readings update hourly at the provider,
 * so a short cache costs nothing in freshness.
 *
 * Privacy: the key is a coarse coordinate grid cell, never a user identifier.
 * Nothing about the household, its health answers, or its exact position is
 * stored. Entries expire through DynamoDB TTL, so stale location data removes
 * itself rather than accumulating.
 */

export interface CachedReading {
  current: CurrentAirQuality;
  source: DataSource;
  /**
   * Cached alongside the reading because it comes from the same upstream call.
   * The entry lifetime is far shorter than the one-hour buckets it contains,
   * so a cached outlook can be at most a partial hour out of date.
   */
  outlook?: Outlook;
}

export interface AirQualityCache {
  get(key: string): Promise<CachedReading | null>;
  put(key: string, value: CachedReading): Promise<void>;
  readonly kind: 'dynamodb' | 'memory';
}

/**
 * Cache key for a coordinate.
 *
 * Rounded to two decimal places, roughly a 1 km grid. Coarse enough that
 * nearby requests share an entry, and coarser than the value the browser
 * sends, so the key cannot identify a street address.
 */
export function cacheKeyFor(latitude: number, longitude: number): string {
  const lat = latitude.toFixed(2);
  const lon = longitude.toFixed(2);
  return `LOCATION#${lat},${lon}`;
}

interface MemoryEntry {
  value: CachedReading;
  expiresAtMs: number;
}

/**
 * Process-local cache, used when no DynamoDB table is configured.
 *
 * Bounded so a long-running process cannot grow without limit: once full, the
 * oldest entry is evicted. A single instance does not share this with its
 * peers, which is acceptable because it is a development and fallback path.
 */
export class MemoryAirQualityCache implements AirQualityCache {
  readonly kind = 'memory' as const;

  private readonly entries = new Map<string, MemoryEntry>();

  constructor(
    private readonly ttlSeconds: number,
    private readonly maxEntries = 500,
    private readonly now: () => number = Date.now,
  ) {}

  async get(key: string): Promise<CachedReading | null> {
    const entry = this.entries.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAtMs <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async put(key: string, value: CachedReading): Promise<void> {
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
      // Map preserves insertion order, so the first key is the oldest.
      const oldest = this.entries.keys().next();
      if (!oldest.done) {
        this.entries.delete(oldest.value);
      }
    }
    this.entries.set(key, {
      value,
      expiresAtMs: this.now() + this.ttlSeconds * 1000,
    });
  }

  /** Test and diagnostic helper. */
  get size(): number {
    return this.entries.size;
  }
}

/**
 * Shared cache in DynamoDB, so every instance of the service benefits from a
 * reading any one of them fetched.
 *
 * Every failure is swallowed and logged. A cache is an optimisation, so a
 * DynamoDB outage must degrade to a direct upstream call, never to an error
 * for the user.
 */
export class DynamoDbAirQualityCache implements AirQualityCache {
  readonly kind = 'dynamodb' as const;

  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly ttlSeconds: number,
    private readonly now: () => number = Date.now,
  ) {}

  async get(key: string): Promise<CachedReading | null> {
    try {
      const result = await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { pk: key, sk: 'AQI#CURRENT' },
        }),
      );

      const item = result.Item;
      if (!item) {
        return null;
      }

      // DynamoDB deletes expired items lazily, so an item past its TTL can
      // still be returned. Check it rather than trusting the service.
      const expiresAt = Number(item.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= this.now()) {
        return null;
      }

      // Parsed, not cast. Every other external input in this service goes
      // through a schema; the cache was the exception, and it is shared
      // between instances, so a single bad writer could have poisoned the
      // readings served to everyone and fed that text into the model prompt.
      // A malformed item is treated as a miss, which costs one upstream call.
      const parsed = cachedReadingSchema.safeParse(item);
      if (!parsed.success) {
        logger.warn('aqi_cache_item_rejected');
        return null;
      }

      return {
        current: parsed.data.current,
        source: parsed.data.source,
        ...(parsed.data.outlook ? { outlook: parsed.data.outlook } : {}),
      };
    } catch (error) {
      logger.warn('aqi_cache_read_failed', {
        reason: error instanceof Error ? error.name : 'unknown',
      });
      return null;
    }
  }

  async put(key: string, value: CachedReading): Promise<void> {
    try {
      const nowSeconds = Math.floor(this.now() / 1000);
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            pk: key,
            sk: 'AQI#CURRENT',
            current: value.current,
            source: value.source,
            ...(value.outlook ? { outlook: value.outlook } : {}),
            // TTL attribute must be epoch seconds.
            expiresAt: nowSeconds + this.ttlSeconds,
            writtenAt: nowSeconds,
          },
          // Only overwrite an entry that is absent, expired, or older than
          // this one. Without it, any writer could replace a fresh reading
          // with an arbitrary one at a known key; with it, a stale or
          // out-of-order write loses rather than winning by arriving last.
          ConditionExpression:
            'attribute_not_exists(pk) OR expiresAt <= :now OR attribute_not_exists(writtenAt) OR writtenAt <= :writtenAt',
          ExpressionAttributeValues: {
            ':now': nowSeconds,
            ':writtenAt': nowSeconds,
          },
        }),
      );
    } catch (error) {
      logger.warn('aqi_cache_write_failed', {
        reason: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
}

let cacheInstance: AirQualityCache | undefined;

export function getAirQualityCache(): AirQualityCache {
  if (!cacheInstance) {
    if (config.dynamoDbTableName) {
      const client = DynamoDBDocumentClient.from(
        new DynamoDBClient({ region: config.awsRegion }),
        { marshallOptions: { removeUndefinedValues: true } },
      );
      cacheInstance = new DynamoDbAirQualityCache(
        client,
        config.dynamoDbTableName,
        config.aqiCacheTtlSeconds,
      );
    } else {
      cacheInstance = new MemoryAirQualityCache(config.aqiCacheTtlSeconds);
    }
    logger.info('aqi_cache_initialised', { kind: cacheInstance.kind });
  }
  return cacheInstance;
}

/** Test seam, so a suite can inject a cache without touching AWS. */
export function setAirQualityCacheForTesting(
  cache: AirQualityCache | undefined,
): void {
  cacheInstance = cache;
}
