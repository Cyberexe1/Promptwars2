import { z } from 'zod';

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
    rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: env.RATE_LIMIT_MAX,
  };
}

export const config: AppConfig = loadConfig();
