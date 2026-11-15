import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { resolveLocation, locationWhere, requireTargetLocation, guardRecordLocation, reportLocationIds } from '../../middleware/locationAuth';
import { prisma } from '../../lib/prisma';
import { badRequest } from '../../lib/errors';
import { parsePositiveQuantity } from '../../lib/accounts';
import * as production from './production.service';

const router = Router();
router.use(authenticate);

// Every /orders/:id route: the order must belong to this company and to a
// location the user can access.
router.param(
  'orderId',
  guardRecordLocation((id, companyId) =>
    prisma.productionOrder.findFirst({ where: { id, companyId }, select: { locationId: true } })
  )
);

const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

// ---------- Bills of materials ----------
router.get('/boms', wrap(async (req, res) => ok(res, await production.listBoms(req.user!.companyId))));
router.get('/boms/:id', wrap(async (req, res) => ok(res, await production.getBom(req.user!.companyId, req.params.id))));
router.post('/boms', wrap(async (req, res) => ok(res, await production.saveBom(req.user!.companyId, req.body), 201)));
router.put('/boms/:id', wrap(async (req, res) => ok(res, await production.saveBom(req.user!.companyId, req.body, req.params.id))));
router.delete('/boms/:id', wrap(async (req, res) => {
  await production.deleteBom(req.user!.companyId, req.params.id);
  ok(res, null);
}));

// ---------- Planning ----------
// GET /production/plan?productId=...&quantity=...
router.get('/plan', resolveLocation, wrap(async (req, res) => {
  if (typeof req.query.productId !== 'string') throw badRequest('Choose a product');
  const quantity = parsePositiveQuantity(req.query.quantity, 'Quantity');
  const locationId = req.locationId ?? (req.allowedLocationIds.length === 1 ? req.allowedLocationIds[0] : null);
  ok(res, await production.planRequirements(req.user!.companyId, req.query.productId, quantity, locationId));
}));

// ---------- Orders ----------
router.get('/orders', resolveLocation, wrap(async (req, res) => {
  const where: Record<string, unknown> = { ...locationWhere(req) };
  if (typeof req.query.status === 'string' && req.query.status && req.query.status !== 'all') where.status = req.query.status;
  ok(res, await production.listOrders(req.user!.companyId, where));
}));
router.get('/orders/:orderId', wrap(async (req, res) => ok(res, await production.getOrder(req.user!.companyId, req.params.orderId))));
router.post('/orders', resolveLocation, wrap(async (req, res) => {
  const order = await production.createOrder(req.user!.companyId, req.user!.id, requireTargetLocation(req), req.body ?? {});
  ok(res, order, 201);
}));
router.put('/orders/:orderId', wrap(async (req, res) => {
  await production.updateDraft(req.user!.companyId, req.params.orderId, req.body ?? {});
  ok(res, await production.getOrder(req.user!.companyId, req.params.orderId));
}));
router.post('/orders/:orderId/start', wrap(async (req, res) => {
  await production.startOrder(req.user!.companyId, req.params.orderId, req.user!.id, req.body?.quantities);
  ok(res, await production.getOrder(req.user!.companyId, req.params.orderId));
}));
router.post('/orders/:orderId/issue', wrap(async (req, res) => {
  await production.issueMore(req.user!.companyId, req.params.orderId, req.user!.id, req.body ?? {});
  ok(res, await production.getOrder(req.user!.companyId, req.params.orderId));
}));
router.post('/orders/:orderId/return', wrap(async (req, res) => {
  await production.returnUnused(req.user!.companyId, req.params.orderId, req.user!.id, req.body ?? {});
  ok(res, await production.getOrder(req.user!.companyId, req.params.orderId));
}));
router.post('/orders/:orderId/complete', wrap(async (req, res) => {
  await production.completeOrder(req.user!.companyId, req.params.orderId, req.user!.id, req.body ?? {});
  ok(res, await production.getOrder(req.user!.companyId, req.params.orderId));
}));
router.post('/orders/:orderId/cancel', wrap(async (req, res) => {
  await production.cancelOrder(req.user!.companyId, req.params.orderId, req.user!.id);
  ok(res, await production.getOrder(req.user!.companyId, req.params.orderId));
}));

// ---------- Analytics ----------
router.get('/summary', resolveLocation, wrap(async (req, res) => {
  const from = typeof req.query.from === 'string' && req.query.from ? new Date(req.query.from) : undefined;
  let to = typeof req.query.to === 'string' && req.query.to ? new Date(req.query.to) : undefined;
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to))) to.setHours(23, 59, 59, 999);
  ok(res, await production.productionSummary(req.user!.companyId, from, to, await reportLocationIds(req)));
}));

export default router;
