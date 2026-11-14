import { Request, Response, NextFunction } from 'express';

import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';

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

/** True if the user has access to this location (and it belongs to their company). */
export async function userCanAccessLocation(userId: string, companyId: string, locationId: string) {
  const access = await prisma.userLocationAccess.findFirst({
    where: { userId, locationId, location: { companyId } },
    select: { id: true },
  });
  return !!access;
}

/**
 * Build a `router.param('id', ...)` handler that 404s unless the record
 * belongs to the user's company and to a location they can access.
 * Records with no location (older data) are allowed for the company.
 */
export function guardRecordLocation(
  load: (id: string, companyId: string) => Promise<{ locationId: string | null } | null>
) {
  return async (req: Request, res: Response, next: NextFunction, id: string) => {
    try {
      const companyId = req.user?.companyId;
      const userId = req.user?.id;
      if (!companyId || !userId) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
      }
      const record = await load(id, companyId);
      if (!record) return res.status(404).json({ success: false, message: 'Not found' });
      if (record.locationId && !(await userCanAccessLocation(userId, companyId, record.locationId))) {
        return res.status(404).json({ success: false, message: 'Not found' });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}


/**
 * The single location a write (receive, sell, adjust, count...) applies to.
 * With exactly one accessible location it is used automatically; with more,
 * the client must pick one (x-location-id header / locationId), because
 * silently defaulting would put stock in the wrong place.
 */
export function requireTargetLocation(req: Request): string {
  if (req.locationId) return req.locationId;
  if (req.allowedLocationIds?.length === 1) return req.allowedLocationIds[0];
  throw new AppError(400, 'Select a specific location (not "All locations") before making this change');
}
