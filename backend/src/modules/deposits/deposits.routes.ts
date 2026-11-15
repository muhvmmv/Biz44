import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { resolveLocation } from '../../middleware/locationAuth';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { prepareDeposit, recordDeposit, refundDeposit, withAvailable } from '../../lib/deposits';

/** Customer deposits (mounted behind authorize('sales')). */
const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const where: any = { companyId: req.user!.companyId };
    if (typeof req.query.customerId === 'string') where.customerId = req.query.customerId;
    if (typeof req.query.productionOrderId === 'string') where.productionOrderId = req.query.productionOrderId;
    const rows = await prisma.customerDeposit.findMany({
      where,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
        productionOrder: { select: { id: true, number: true } },
      },
      orderBy: { receivedAt: 'desc' },
    });
    res.json({ success: true, data: rows.map(withAvailable) });
  } catch (err) { next(err); }
});

router.post('/', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const prepared = await prepareDeposit(companyId, req.body ?? {});
    const location = req.locationId ?? req.allowedLocationIds[0] ?? null;
    const deposit = await prisma.$transaction((tx) => recordDeposit(tx, companyId, req.user!.id, location, prepared));
    res.status(201).json({ success: true, data: withAvailable(deposit) });
  } catch (err: any) {
    if (err?.code === 'P2002') return next(new AppError(409, 'Another deposit was saved at the same moment. Please try again.'));
    next(err);
  }
});

router.post('/:id/refund', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await refundDeposit(req.user!.companyId, req.params.id, req.user!.id, req.body ?? {}) });
  } catch (err) { next(err); }
});

export default router;
