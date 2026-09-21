import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { companyId: req.user?.companyId },
      orderBy: { paidAt: 'desc' },
      include: { invoice: { select: { invoiceNumber: true } } },
    });
    res.json({ success: true, data: payments });
  } catch (err) { next(err); }
});

export default router;