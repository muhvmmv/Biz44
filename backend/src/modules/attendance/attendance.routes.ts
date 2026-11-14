import { Router } from 'express';
import { authenticate } from '../../middleware/auth';

import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';

const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'leave'];

async function assertEmployee(companyId: string, employeeId: unknown) {
  if (typeof employeeId !== 'string' || !employeeId) throw badRequest('Employee is required');
  const emp = await prisma.employee.findFirst({ where: { id: employeeId, companyId }, select: { id: true } });
  if (!emp) throw notFound('Employee not found');
}
const router = Router();

router.use(authenticate);

// LIST attendance (optionally filtered by employee or date range)
router.get('/', async (req, res, next) => {
  try {
    const { employeeId, from, to } = req.query;
    const where: any = { companyId: req.user?.companyId };
    if (employeeId) where.employeeId = employeeId;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(String(from));
      if (to) where.date.lte = new Date(String(to));
    }

    const records = await prisma.attendance.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 500,
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
    res.json({ success: true, data: records });
  } catch (err) { next(err); }
});

// MARK attendance
router.post('/', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;
    const { employeeId, date, status, notes } = req.body;

    if (!employeeId || !date || !status) {
      return res.status(400).json({ success: false, message: 'Missing fields' });
    }
    if (!ATTENDANCE_STATUSES.includes(status)) throw badRequest('Invalid attendance status');
    await assertEmployee(companyId, employeeId);

    const record = await prisma.attendance.create({
      data: {
        companyId,
        employeeId,
        date: new Date(date),
        status,
        notes,
      },
    });
    res.status(201).json({ success: true, data: record });
  } catch (err) { next(err); }
});

// UPDATE attendance
router.put('/:id', async (req, res, next) => {
  try {
    const companyId = req.user!.companyId;
    const existing = await prisma.attendance.findFirst({ where: { id: req.params.id, companyId } });
    if (!existing) throw notFound();

    const { date, status, notes } = req.body;
    if (status !== undefined && !ATTENDANCE_STATUSES.includes(status)) throw badRequest('Invalid attendance status');
    const record = await prisma.attendance.update({
      where: { id: existing.id },
      data: {
        ...(date !== undefined && { date: new Date(date) }),
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
      },
    });
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
});

// DELETE
router.delete('/:id', async (req, res, next) => {
  try {
    const { count } = await prisma.attendance.deleteMany({
      where: { id: req.params.id, companyId: req.user!.companyId },
    });
    if (count === 0) throw notFound();
    res.json({ success: true });
  } catch (err) { next(err); }
});

// SUMMARY per employee
router.get('/summary/:employeeId', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const where: any = {
      companyId: req.user?.companyId,
      employeeId: req.params.employeeId,
    };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(String(from));
      if (to) where.date.lte = new Date(String(to));
    }

    const records = await prisma.attendance.findMany({ where });
    const summary = {
      present: records.filter((r) => r.status === 'present').length,
      absent: records.filter((r) => r.status === 'absent').length,
      late: records.filter((r) => r.status === 'late').length,
      leave: records.filter((r) => r.status === 'leave').length,
    };
    res.json({ success: true, data: summary });
  } catch (err) { next(err); }
});

export default router;