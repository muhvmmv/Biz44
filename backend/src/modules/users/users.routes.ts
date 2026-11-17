import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { authenticate } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { ROLES, ROLE_LABELS, isRole, permissionsFor } from '../../lib/permissions';

/**
 * Staff accounts. Mounted behind authorize('settings'): anyone may list the
 * team (read), only an administrator may change it (write).
 */
const router = Router();
router.use(authenticate);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const publicUser = (u: any) => ({
  id: u.id,
  firstName: u.firstName,
  lastName: u.lastName,
  email: u.email,
  role: u.role,
  isActive: u.isActive,
  createdAt: u.createdAt,
  locations: (u.locationAccess ?? []).map((a: any) => ({ id: a.location.id, name: a.location.name })),
});

const include = { locationAccess: { include: { location: { select: { id: true, name: true } } } } };

function cleanName(v: unknown, label: string) {
  const t = typeof v === 'string' ? v.trim() : '';
  if (!t) throw badRequest(`${label} is required`);
  if (t.length > 80) throw badRequest(`${label} is too long`);
  return t;
}

function checkPassword(v: unknown) {
  if (typeof v !== 'string' || v.length < 8) throw badRequest('The password must be at least 8 characters');
  return v;
}

/** Location ids must all belong to the company; at least one is required. */
async function companyLocations(companyId: string, value: unknown) {
  if (!Array.isArray(value) || value.length === 0) throw badRequest('Choose at least one location');
  const ids = Array.from(new Set(value.map(String)));
  const found = await prisma.location.count({ where: { companyId, id: { in: ids } } });
  if (found !== ids.length) throw badRequest('One or more locations were not found');
  return ids;
}

/** Refuse a change that would leave the company without an active administrator. */
async function keepAnAdmin(companyId: string, userId: string, next: { role?: string; isActive?: boolean }) {
  const user = await prisma.user.findFirst({ where: { id: userId, companyId, deletedAt: null } });
  if (!user) throw notFound('User not found');
  const stillAdmin = (next.role ?? user.role) === 'admin' && (next.isActive ?? user.isActive);
  if (user.role === 'admin' && user.isActive && !stillAdmin) {
    const others = await prisma.user.count({ where: { companyId, role: 'admin', isActive: true, id: { not: userId } } });
    if (others === 0) throw badRequest('The company needs at least one active administrator');
  }
  return user;
}

router.get('/roles', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r], permissions: permissionsFor(r) })),
  });
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      where: { companyId: req.user!.companyId, deletedAt: null },
      include,
      orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }],
    });
    res.json({ success: true, data: users.map(publicUser) });
  } catch (err) { next(err); }
});

// Add a staff member with a starting password the administrator gives them.
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const firstName = cleanName(req.body?.firstName, 'First name');
    const lastName = cleanName(req.body?.lastName, 'Last name');
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!EMAIL.test(email)) throw badRequest('Enter a valid email address');
    if (!isRole(req.body?.role)) throw badRequest(`Role must be one of: ${ROLES.join(', ')}`);
    const password = checkPassword(req.body?.password);
    const locationIds = await companyLocations(companyId, req.body?.locationIds);
    if (await prisma.user.findUnique({ where: { email } })) throw badRequest('That email is already used by another account');

    const user = await prisma.user.create({
      data: {
        companyId, firstName, lastName, email, role: req.body.role,
        password: await bcrypt.hash(password, 12),
        locationAccess: { create: locationIds.map((locationId) => ({ locationId })) },
      },
      include,
    });
    res.status(201).json({ success: true, data: publicUser(user) });
  } catch (err) { next(err); }
});

// Change name, role, locations or active state.
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const role = req.body?.role;
    if (role !== undefined && !isRole(role)) throw badRequest(`Role must be one of: ${ROLES.join(', ')}`);
    const isActive = req.body?.isActive === undefined ? undefined : Boolean(req.body.isActive);
    if (req.params.id === req.user!.id && ((role && role !== req.user!.role) || isActive === false)) {
      throw badRequest('You cannot change your own role or deactivate yourself');
    }
    await keepAnAdmin(companyId, req.params.id, { role, isActive });
    const locationIds = req.body?.locationIds === undefined ? undefined : await companyLocations(companyId, req.body.locationIds);

    const user = await prisma.$transaction(async (tx) => {
      if (locationIds) {
        await tx.userLocationAccess.deleteMany({ where: { userId: req.params.id } });
        await tx.userLocationAccess.createMany({ data: locationIds.map((locationId) => ({ userId: req.params.id, locationId })) });
      }
      return tx.user.update({
        where: { id: req.params.id },
        data: {
          firstName: req.body?.firstName === undefined ? undefined : cleanName(req.body.firstName, 'First name'),
          lastName: req.body?.lastName === undefined ? undefined : cleanName(req.body.lastName, 'Last name'),
          role,
          isActive,
        },
        include,
      });
    });
    res.json({ success: true, data: publicUser(user) });
  } catch (err) { next(err); }
});

// Set a new password for a staff member who has forgotten theirs.
router.post('/:id/password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId, deletedAt: null } });
    if (!user) throw notFound('User not found');
    const password = checkPassword(req.body?.password);
    await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(password, 12) } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
