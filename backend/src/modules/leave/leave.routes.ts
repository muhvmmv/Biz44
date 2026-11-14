import { Router } from 'express';
import { authenticate } from '../../middleware/auth';

import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';

const LEAVE_STATUSES = ['pending', 'approved', 'rejected'];
const router = Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const leaves = await prisma.leave.findMany({
      where: { companyId: req.user?.companyId },
      orderBy: { createdAt: 'desc' },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
    res.json({ success: true, data: leaves });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;
    const { employeeId, type, startDate, endDate, reason } = req.body;

    if (!employeeId || !type || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Missing fields' });
    }
    const emp = await prisma.employee.findFirst({ where: { id: employeeId, companyId }, select: { id: true } });
    if (!emp) throw notFound('Employee not found');
    if (new Date(endDate) < new Date(startDate)) throw badRequest('End date cannot be before start date');

    const leave = await prisma.leave.create({
      data: {
        companyId,
        employeeId,
        type,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason,
      },
    });
    res.status(201).json({ success: true, data: leave });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.leave.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
    });
    if (!existing) throw notFound();

    const { type, startDate, endDate, reason, status } = req.body;
    if (status !== undefined && !LEAVE_STATUSES.includes(status)) throw badRequest('Invalid leave status');
    const leave = await prisma.leave.update({
      where: { id: existing.id },
      data: {
        ...(type !== undefined && { type }),
        ...(startDate !== undefined && { startDate: new Date(startDate) }),
        ...(endDate !== undefined && { endDate: new Date(endDate) }),
        ...(reason !== undefined && { reason }),
        ...(status !== undefined && { status }),
      },
    });
    res.json({ success: true, data: leave });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { count } = await prisma.leave.deleteMany({
      where: { id: req.params.id, companyId: req.user!.companyId },
    });
    if (count === 0) throw notFound();
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;