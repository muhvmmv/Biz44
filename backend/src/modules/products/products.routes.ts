import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { resolveLocation } from '../../middleware/locationAuth';
import { CrudService, pick } from '../../services/crud.service';
import { prisma } from '../../lib/prisma';
import { badRequest } from '../../lib/errors';
import { findOrCreateAccount } from '../../lib/accounts';

const router = Router();
const productService = new CrudService('product');

router.use(authenticate);

// `quantity` and `totalCostValue` are deliberately NOT writable here. Stock
// may only change through receiving, sales, adjustments, damage and returns,
// so every change has a stock movement and a cost.
const WRITABLE = ['name', 'sku', 'description', 'price', 'cost', 'reorderPoint'] as const;

function normalize(data: Record<string, any>) {
  for (const key of ['price', 'cost'] as const) {
    if (data[key] !== undefined) {
      const n = Number(data[key]);
      if (!Number.isFinite(n) || n < 0) throw badRequest(`${key} must be a non-negative number`);
      data[key] = n;
    }
  }
  if (data.reorderPoint !== undefined) {
    const n = Number(data.reorderPoint);
    if (!Number.isInteger(n) || n < 0) throw badRequest('reorderPoint must be a whole number of 0 or more');
    data.reorderPoint = n;
  }
  return data;
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const products = await productService.findMany(req.user!.companyId, { orderBy: { name: 'asc' } });
    res.json({ success: true, data: products });
  } catch (err) { next(err); }
});

// Create a product. An optional opening `quantity` is booked as an opening
// stock batch at the active location, valued at `cost`, so it can be sold
// through FIFO like any received stock.
router.post('/', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const data = normalize(pick(req.body, WRITABLE));
    if (!data.name || !String(data.name).trim()) throw badRequest('Product name is required');

    const openingQty = req.body?.quantity === undefined || req.body?.quantity === '' ? 0 : Number(req.body.quantity);
    if (!Number.isInteger(openingQty) || openingQty < 0) {
      throw badRequest('Opening quantity must be a whole number of 0 or more');
    }
    const unitCost = data.cost ?? 0;
    const locationId = req.locationId || req.allowedLocationIds[0];

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          ...data,
          name: String(data.name).trim(),
          companyId,
          quantity: openingQty,
          totalCostValue: openingQty * unitCost,
        },
      });

      if (openingQty > 0) {
        const batch = await tx.inventoryBatch.create({
          data: {
            companyId,
            locationId,
            productId: created.id,
            quantityReceived: openingQty,
            quantityRemaining: openingQty,
            unitCost,
            sellingPriceSnapshot: created.price,
            reference: 'Opening stock',
          },
        });
        await tx.stockMovement.create({
          data: {
            companyId,
            locationId,
            productId: created.id,
            batchId: batch.id,
            type: 'opening',
            quantity: openingQty,
            balance: openingQty,
            unitCost,
            totalCost: openingQty * unitCost,
            reference: 'Opening stock',
          },
        });

        const value = openingQty * unitCost;
        if (value > 0) {
          const inventoryAccount = await findOrCreateAccount(tx, companyId, 'Inventory', 'asset');
          await tx.account.update({
            where: { id: inventoryAccount.id },
            data: { balance: { increment: value } },
          });
          await tx.transaction.create({
            data: {
              companyId,
              locationId,
              accountId: inventoryAccount.id,
              type: 'inventory',
              description: `Opening stock: ${created.name}`,
              amount: value,
            },
          });
        }
      }

      return created;
    });

    res.status(201).json({ success: true, data: product });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await productService.findOne(req.params.id, req.user!.companyId);
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = normalize(pick(req.body, WRITABLE));
    if (data.name !== undefined && !String(data.name).trim()) throw badRequest('Product name is required');
    const product = await productService.update(req.params.id, req.user!.companyId, data);
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await productService.delete(req.params.id, req.user!.companyId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
