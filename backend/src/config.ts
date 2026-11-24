import { z } from 'zod';

/**
 * Loads `.env` for local development using Node's built-in reader, so no
 * dotenv dependency is needed.
 *
 * Skipped under `test` to keep the suite hermetic, and a missing file is not an
 * error: in production the platform supplies the environment directly, which is
 * why App Runner needs no `.env` at all.
 */
function loadDotEnvForDevelopment(): void {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  try {
    process.loadEnvFile();
  } catch {
    // No .env present. Defaults and real environment variables still apply.
  }
}

loadDotEnvForDevelopment();

/**
 * Environment configuration. Parsed once at startup so that a misconfigured
 * deployment fails immediately instead of at the first request.
 */
const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  GEOCODING_API_URL: z
    .string()
    .min(1)
    .default('https://geocoding-api.open-meteo.com/v1/search'),
  AIR_QUALITY_API_URL: z
    .string()
    .min(1)
    .default('https://air-quality-api.open-meteo.com/v1/air-quality'),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(6000),
  AWS_REGION: z.string().min(1).default('us-east-1'),
  BEDROCK_MODEL_ID: z.string().default(''),
  BEDROCK_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(12000),
  DYNAMODB_TABLE_NAME: z.string().default(''),
  // Provider readings update hourly, so a few minutes costs no freshness
  // while removing most repeat upstream calls for the same area.
  AQI_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).max(3600).default(600),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(60),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  corsAllowedOrigins: string[];
  geocodingApiUrl: string;
  airQualityApiUrl: string;
  upstreamTimeoutMs: number;
  awsRegion: string;
  /** Empty string means Bedrock is disabled and the rules engine is used alone. */
  bedrockModelId: string;
  bedrockTimeoutMs: number;
  /** Empty string means the air-quality cache stays in process memory. */
  dynamoDbTableName: string;
  /** Zero disables air-quality caching entirely. */
  aqiCacheTtlSeconds: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
}

function parseOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration -> ${details}`);
  }

  const env = parsed.data;

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    corsAllowedOrigins: parseOrigins(env.CORS_ALLOWED_ORIGINS),
    geocodingApiUrl: env.GEOCODING_API_URL,
    airQualityApiUrl: env.AIR_QUALITY_API_URL,
    upstreamTimeoutMs: env.UPSTREAM_TIMEOUT_MS,
    awsRegion: env.AWS_REGION,
    bedrockModelId: env.BEDROCK_MODEL_ID.trim(),
    bedrockTimeoutMs: env.BEDROCK_TIMEOUT_MS,
    dynamoDbTableName: env.DYNAMODB_TABLE_NAME.trim(),
    aqiCacheTtlSeconds: env.AQI_CACHE_TTL_SECONDS,
    rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: env.RATE_LIMIT_MAX,
  };
}

export const config: AppConfig = loadConfig();
