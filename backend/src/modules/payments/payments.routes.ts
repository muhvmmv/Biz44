import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { resolveLocation, locationWhere } from '../../middleware/locationAuth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

router.use(authenticate);

router.get('/', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { companyId: req.user?.companyId, ...locationWhere(req) },
      orderBy: { paidAt: 'desc' },
      include: { invoice: { select: { invoiceNumber: true } } },
    });
    res.json({ success: true, data: payments });
  } catch (err) { next(err); }
});

export default router;