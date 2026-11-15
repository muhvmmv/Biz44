import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { Area, can } from '../lib/permissions';

interface JwtPayload {
  id: string;
  email: string;
  role: string;
  companyId: string;
}

/**
 * Verifies the token, then loads the user so that a deactivated account or a
 * changed role takes effect on the next request (not when the token expires).
 * Runs once per request; later calls reuse req.user.
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  if (req.user) return next();
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(authHeader.split(' ')[1], env.JWT_SECRET) as JwtPayload;
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, role: true, companyId: true, isActive: true },
    });
    if (!user || user.companyId !== decoded.companyId) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'This account has been deactivated' });
    }
    req.user = { id: user.id, email: user.email, role: user.role, companyId: user.companyId };
    next();
  } catch (err) {
    next(err);
  }
};

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** An exception to a router's area for particular paths (relative to where it is mounted). */
export interface AreaRule {
  path: RegExp;
  methods?: string[];
  /** Any one of these areas is enough. */
  areas: Area[];
}

/**
 * Signed in, and the role may use `area`: reading for GET, writing for
 * everything else. `rules` give particular paths different areas, checked in
 * order before the default.
 */
export function authorize(area: Area, rules: AreaRule[] = []): RequestHandler[] {
  const check: RequestHandler = (req, res, next) => {
    const need = READ_METHODS.has(req.method) ? 'read' : 'write';
    const rule = rules.find((r) => r.path.test(req.path) && (!r.methods || r.methods.includes(req.method)));
    const areas = rule ? rule.areas : [area];
    if (areas.some((a) => can(req.user!.role, a, need))) return next();
    return res.status(403).json({ success: false, message: 'Your role does not allow this. Ask an administrator.' });
  };
  return [authenticate, check];
}
