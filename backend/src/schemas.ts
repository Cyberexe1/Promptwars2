import { z } from 'zod';

/**
 * Request validation schemas. Every externally supplied value passes through
 * one of these before it reaches application logic.
 */

const latitudeSchema = z.coerce.number().min(-90).max(90);
const longitudeSchema = z.coerce.number().min(-180).max(180);

/** Trimmed, length-capped free text. Rejects control characters. */
const safeTextSchema = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    // eslint-disable-next-line no-control-regex
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), {
      message: 'Must not contain control characters',
    });

export const locationSearchSchema = z.object({
  query: safeTextSchema(80),
});

export const airQualityQuerySchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  name: safeTextSchema(120).optional(),
});

export const householdProfileSchema = z.object({
  ageGroups: z
    .array(z.enum(['child', 'adult', 'older-adult', 'pregnant']))
    .min(1, 'Select at least one age group')
    .max(4),
  sensitive: z.boolean(),
  commuteMethod: z.enum([
    'car',
    'motorbike',
    'public-transport',
    'walk',
    'cycle',
    'work-from-home',
  ]),
  outdoorMinutes: z.coerce.number().int().min(0).max(480),
  cookingFuel: z.enum(['gas', 'electric', 'biomass']),
  purifier: z.boolean(),
  budget: z.enum(['low', 'medium', 'high']),
});

export const recommendationsRequestSchema = z.object({
  location: z.object({
    name: safeTextSchema(120),
    latitude: latitudeSchema,
    longitude: longitudeSchema,
  }),
  profile: householdProfileSchema,
});

export type RecommendationsRequest = z.infer<typeof recommendationsRequestSchema>;

/**
 * Shape the language model is allowed to return. Unknown keys are dropped and
 * every field is length-capped, so a malformed or hostile response cannot
 * inject unbounded content into the UI.
 */
export const modelPlanSchema = z.object({
  summary: z.string().trim().min(1).max(600),
  recommendations: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(64),
        action: z.string().trim().min(1).max(400),
        why: z.string().trim().min(1).max(400),
        personalImpact: z.string().trim().min(1).max(400),
        communityImpact: z.string().trim().min(1).max(400),
      }),
    )
    .min(1)
    .max(10),
});

export type ModelPlan = z.infer<typeof modelPlanSchema>;

/** Converts a Zod error into a single user-safe sentence. */
export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}
