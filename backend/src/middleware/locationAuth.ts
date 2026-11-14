import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Resolves the requested location from:
 *   - req.query.locationId
 *   - req.body.locationId
 *   - req.headers['x-location-id']
 *
 * If locationId is "all" or missing → set req.allowedLocationIds to all accessible locations.
 * If locationId is specific → verify access, set req.locationId.
 *
 * Attaches:
 *   req.locationId?: string         (undefined = "all" scope)
 *   req.allowedLocationIds: string[] (the locations the user may query)
 */
export async function resolveLocation(req: Request, res: Response, next: NextFunction) {
  try {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    // Fetch all locations the user has access to
    const accesses = await prisma.userLocationAccess.findMany({
      where: { userId, location: { companyId, status: 'active' } },
      select: { locationId: true },
    });
    const allowedLocationIds = accesses.map((a) => a.locationId);

    if (allowedLocationIds.length === 0) {
      return res.status(403).json({ success: false, message: 'No location access' });
    }

    const requested =
      (req.query.locationId as string) ||
      (req.body?.locationId as string) ||
      (req.headers['x-location-id'] as string) ||
      null;

    if (!requested || requested === 'all') {
      req.allowedLocationIds = allowedLocationIds;
      req.locationId = undefined;
      return next();
    }

    if (!allowedLocationIds.includes(requested)) {
      return res.status(403).json({
        success: false,
        message: 'Access to this location is not permitted',
      });
    }

    req.locationId = requested;
    req.allowedLocationIds = allowedLocationIds;
    next();
  } catch (err) {
    next(err);
  }
}

/** Helper: build a Prisma `where` clause for a location scope. */
export function locationWhere(req: Request): { locationId?: { in: string[] } | string } {
  if (req.locationId) return { locationId: req.locationId };
  return { locationId: { in: req.allowedLocationIds } };
}