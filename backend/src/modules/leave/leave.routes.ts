import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
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
    const leave = await prisma.leave.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ success: true, data: leave });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.leave.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;