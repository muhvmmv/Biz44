import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { resolveLocation, requireTargetLocation } from '../../middleware/locationAuth';
import { CrudService, pick } from '../../services/crud.service';
import { prisma } from '../../lib/prisma';
import { badRequest } from '../../lib/errors';
import { addStock, postInventoryIncrease, syncProductTotals, stockByProduct } from '../../lib/inventory';

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

/**
 * Replace the cached company-wide quantity/value with stock from batches at
 * the selected location(s). `recordedQuantity` keeps the cached number and
 * `needsStockCheck` flags products where the cache and batches disagree
 * company-wide (see Inventory → Stock Check).
 */
async function withLocationStock(req: Request, products: any[]) {
  const companyId = req.user!.companyId;
  const ids = products.map((p) => p.id);
  const [scoped, companyWide] = await Promise.all([
    stockByProduct(prisma, companyId, req.locationId ?? req.allowedLocationIds, ids),
    stockByProduct(prisma, companyId, null, ids),
  ]);
  return products.map((p) => {
    const here = scoped.get(p.id) || { quantity: 0, value: 0 };
    const all = companyWide.get(p.id) || { quantity: 0, value: 0 };
    return {
      ...p,
      quantity: here.quantity,
      totalCostValue: here.value,
      recordedQuantity: p.quantity,
      needsStockCheck: p.quantity !== all.quantity,
    };
  });
}

router.get('/', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const products = await productService.findMany(req.user!.companyId, { orderBy: { name: 'asc' } });
    res.json({ success: true, data: await withLocationStock(req, products) });
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
    // Opening stock must go to a specific location.
    const locationId = openingQty > 0 ? requireTargetLocation(req) : null;

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: { ...data, name: String(data.name).trim(), companyId, quantity: 0, totalCostValue: 0 },
      });

      if (openingQty > 0) {
        const { totalCost } = await addStock(tx, {
          companyId,
          locationId,
          productId: created.id,
          quantity: openingQty,
          unitCost,
          sellingPriceSnapshot: created.price,
          type: 'opening',
          reference: 'Opening stock',
        });
        await postInventoryIncrease(tx, {
          companyId, locationId, amount: totalCost, description: `Opening stock: ${created.name}`,
        });
        await syncProductTotals(tx, companyId, [created.id]);
      }

      return tx.product.findUnique({ where: { id: created.id } });
    });

    res.status(201).json({ success: true, data: product });
  } catch (err) { next(err); }
});

router.get('/:id', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await productService.findOne(req.params.id, req.user!.companyId);
    const [scoped] = await withLocationStock(req, [product]);
    res.json({ success: true, data: scoped });
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
