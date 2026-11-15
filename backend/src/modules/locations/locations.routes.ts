import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';

import { prisma } from '../../lib/prisma';
const router = Router();

router.use(authenticate);

// ---------- LIST ----------
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const userId = req.user!.id;

    const accesses = await prisma.userLocationAccess.findMany({
      where: { userId, location: { companyId } },
      include: { location: true },
    });

    const locations = accesses.map((a) => a.location);
    res.json({ success: true, data: locations });
  } catch (err) { next(err); }
});

// ---------- CREATE ----------
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const companyId = req.user!.companyId;
    const userId = req.user!.id;
    const { name, city, address, phone, email } = req.body;

    if (!name) return res.status(400).json({ success: false, message: 'Name required' });

    const location = await prisma.location.create({
      data: { companyId, name, city, address, phone, email },
    });

    // Grant the creating user access
    await prisma.userLocationAccess.create({
      data: { userId, locationId: location.id },
    });

    res.status(201).json({ success: true, data: location });
  } catch (err) { next(err); }
});

// ---------- UPDATE (all fields) ----------
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const companyId = req.user!.companyId;

    const location = await prisma.location.findFirst({
      where: { id: req.params.id, companyId },
    });
    if (!location) return res.status(404).json({ success: false, message: 'Not found' });

    const { name, city, address, phone, email, status } = req.body;

    const updated = await prisma.location.update({
      where: { id: location.id },
      data: {
        ...(name !== undefined && { name }),
        ...(city !== undefined && { city }),
        ...(address !== undefined && { address }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(status !== undefined && { status }),
      },
    });

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// ---------- SET AS DEFAULT ----------
router.post('/:id/set-default', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const companyId = req.user!.companyId;

    const location = await prisma.location.findFirst({
      where: { id: req.params.id, companyId },
    });
    if (!location) return res.status(404).json({ success: false, message: 'Not found' });

    await prisma.$transaction([
      prisma.location.updateMany({
        where: { companyId, isDefault: true },
        data: { isDefault: false },
      }),
      prisma.location.update({
        where: { id: location.id },
        data: { isDefault: true },
      }),
    ]);

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ---------- DELETE ----------
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const companyId = req.user!.companyId;

    const location = await prisma.location.findFirst({
      where: { id: req.params.id, companyId },
    });
    if (!location) return res.status(404).json({ success: false, message: 'Not found' });

    // Guard 1: cannot delete the default location
    if (location.isDefault) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete the default branch. Mark another branch as default first.',
      });
    }

    // Guard 2: cannot delete if any records reference this location
    const [invoices, payments, transactions, movements, purchases, batches, attendance, leaves, payrolls, journal, productionOrders, transfers] =
      await Promise.all([
        prisma.invoice.count({ where: { locationId: location.id } }),
        prisma.payment.count({ where: { locationId: location.id } }),
        prisma.transaction.count({ where: { locationId: location.id } }),
        prisma.stockMovement.count({ where: { locationId: location.id } }),
        prisma.purchase.count({ where: { locationId: location.id } }),
        prisma.inventoryBatch.count({ where: { locationId: location.id } }),
        prisma.attendance.count({ where: { locationId: location.id } }),
        prisma.leave.count({ where: { locationId: location.id } }),
        prisma.payroll.count({ where: { locationId: location.id } }),
        prisma.journalEntry.count({ where: { locationId: location.id } }),
        prisma.productionOrder.count({ where: { locationId: location.id } }),
        prisma.stockTransfer.count({ where: { OR: [{ fromLocationId: location.id }, { toLocationId: location.id }] } }),
      ]);

    const totalRefs =
      invoices + payments + transactions + movements + purchases +
      batches + attendance + leaves + payrolls + journal + productionOrders + transfers;

    if (totalRefs > 0) {
      return res.status(400).json({
        success: false,
        message:
          `This branch has ${totalRefs} related record${totalRefs === 1 ? '' : 's'} ` +
          `(invoices, payments, stock, etc.). Deactivate it instead, or move the records to another branch first.`,
      });
    }

    // Safe to delete — remove user access rows then the location
    await prisma.userLocationAccess.deleteMany({ where: { locationId: location.id } });
    await prisma.location.delete({ where: { id: location.id } });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ---------- GRANT USER ACCESS ----------
router.post('/:id/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const companyId = req.user!.companyId;
    const { userId } = req.body;

    const location = await prisma.location.findFirst({
      where: { id: req.params.id, companyId },
    });
    if (!location) return res.status(404).json({ success: false, message: 'Not found' });

    const targetUser = await prisma.user.findFirst({
      where: { id: userId, companyId },
    });
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

    const exists = await prisma.userLocationAccess.findFirst({
      where: { userId, locationId: location.id },
    });
    if (exists) return res.json({ success: true });

    await prisma.userLocationAccess.create({
      data: { userId, locationId: location.id },
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ---------- REVOKE USER ACCESS ----------
router.delete('/:id/users/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const companyId = req.user!.companyId;

    const location = await prisma.location.findFirst({
      where: { id: req.params.id, companyId },
    });
    if (!location) return res.status(404).json({ success: false, message: 'Not found' });

    await prisma.userLocationAccess.deleteMany({
      where: { locationId: location.id, userId: req.params.userId },
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ---------- LIST USERS WITH ACCESS ----------
router.get('/:id/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const location = await prisma.location.findFirst({
      where: { id: req.params.id, companyId },
    });
    if (!location) return res.status(404).json({ success: false, message: 'Not found' });

    const accesses = await prisma.userLocationAccess.findMany({
      where: { locationId: location.id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    res.json({ success: true, data: accesses.map((a) => a.user) });
  } catch (err) { next(err); }
});

export default router;