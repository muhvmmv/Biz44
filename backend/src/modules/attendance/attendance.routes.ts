import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
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
    const record = await prisma.attendance.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
});

// DELETE
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.attendance.delete({ where: { id: req.params.id } });
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