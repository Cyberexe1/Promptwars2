import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { badRequest } from '../utils/errors.js';
import {
  airQualityQuerySchema,
  formatIssues,
  locationSearchSchema,
  recommendationsRequestSchema,
} from '../schemas.js';
import { searchLocations } from '../services/geocoding.js';
import { getCurrentAirQuality } from '../services/airQuality.js';
import { createPlan } from '../services/planner.js';
import { assessRisk } from '../domain/risk.js';
import type { AirQualityResponse } from '../types.js';

export const apiRouter = Router();

/**
 * City search. Returns an empty list rather than a 404 when nothing matches, so
 * the UI can show a "no results" state without treating it as an error.
 */
apiRouter.get(
  '/locations',
  asyncHandler(async (req, res) => {
    const parsed = locationSearchSchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest(formatIssues(parsed.error));
    }

    const locations = await searchLocations(parsed.data.query);
    res.json({ locations });
  }),
);

/** Current reading plus the public risk band for a coordinate. */
apiRouter.get(
  '/air-quality',
  asyncHandler(async (req, res) => {
    const parsed = airQualityQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest(formatIssues(parsed.error));
    }

    const { latitude, longitude, name } = parsed.data;
    const reading = await getCurrentAirQuality(latitude, longitude);

    // No profile here, so the band is the official one with no escalation.
    const risk = assessRisk(reading.current);

    const body: AirQualityResponse = {
      location: { name: name ?? 'Selected location', latitude, longitude },
      current: reading.current,
      risk,
      source: reading.source,
      stale: reading.stale,
      ...(reading.outlook ? { outlook: reading.outlook } : {}),
    };

    res.json(body);
  }),
);

/** Personalised plan for a household. */
apiRouter.post(
  '/recommendations',
  asyncHandler(async (req, res) => {
    const parsed = recommendationsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest(formatIssues(parsed.error));
    }

    const plan = await createPlan(parsed.data);
    res.json(plan);
  }),
);
