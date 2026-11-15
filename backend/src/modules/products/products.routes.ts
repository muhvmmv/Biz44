import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { resolveLocation, requireTargetLocation } from '../../middleware/locationAuth';
import { CrudService, pick } from '../../services/crud.service';
import { prisma } from '../../lib/prisma';
import { badRequest } from '../../lib/errors';
import {
  addStock, postOpeningStock, syncProductTotals, stockByProduct, inventoryAccountFor, stageKeyFor, ITEM_TYPES,
} from '../../lib/inventory';
import { parseQuantity } from '../../lib/accounts';
import { postJournal } from '../../lib/ledger';

const router = Router();
const productService = new CrudService('product');

router.use(authenticate);

// `quantity` and `totalCostValue` are deliberately NOT writable here. Stock
// may only change through receiving, sales, adjustments, damage and returns,
// so every change has a stock movement and a cost.
const WRITABLE = ['name', 'sku', 'description', 'price', 'cost', 'reorderPoint', 'itemType', 'unit'] as const;

export const UNITS = ['pcs', 'kg', 'g', 't', 'l', 'ml', 'm', 'bag', 'roll', 'carton', 'pack', 'box'] as const;

function normalize(data: Record<string, any>) {
  for (const key of ['price', 'cost'] as const) {
    if (data[key] !== undefined) {
      const n = Number(data[key]);
      if (!Number.isFinite(n) || n < 0) throw badRequest(`${key} must be a non-negative number`);
      data[key] = n;
    }
  }
  if (data.reorderPoint !== undefined) data.reorderPoint = parseQuantity(data.reorderPoint, 'Reorder point');
  if (data.itemType !== undefined && !(ITEM_TYPES as readonly string[]).includes(data.itemType)) {
    throw badRequest('Item type must be raw_material, packaging or finished_good');
  }
  if (data.unit !== undefined) {
    data.unit = String(data.unit).trim().toLowerCase();
    if (!(UNITS as readonly string[]).includes(data.unit)) throw badRequest(`Unit must be one of: ${UNITS.join(', ')}`);
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
      needsStockCheck: Math.abs(p.quantity - all.quantity) > 0.0001,
    };
  });
}

router.get('/', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = typeof req.query.type === 'string' ? req.query.type : '';
    const products = (await productService.findMany(req.user!.companyId, { orderBy: { name: 'asc' } }))
      .filter((p: { itemType: string }) => !type || type.split(',').includes(p.itemType));
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

    const openingQty =
      req.body?.quantity === undefined || req.body?.quantity === '' ? 0 : parseQuantity(req.body.quantity, 'Opening quantity');
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
        await postOpeningStock(tx, {
          companyId, locationId, itemType: created.itemType, amount: totalCost, description: `Opening stock: ${created.name}`, sourceId: created.id,
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
    const companyId = req.user!.companyId;
    const data = normalize(pick(req.body, WRITABLE));
    if (data.name !== undefined && !String(data.name).trim()) throw badRequest('Product name is required');
    const existing = await productService.findOne(req.params.id, companyId);

    const product = await prisma.$transaction(async (tx) => {
      // Changing the item type moves its stock value between inventory
      // accounts (e.g. finished goods -> raw materials) with one journal entry.
      if (data.itemType && stageKeyFor(data.itemType) !== stageKeyFor(existing.itemType)) {
        const value = (await stockByProduct(tx, companyId, null, [existing.id])).get(existing.id)?.value ?? 0;
        if (value > 0) {
          const from = await inventoryAccountFor(tx, companyId, existing.itemType);
          const to = await inventoryAccountFor(tx, companyId, data.itemType);
          await postJournal(tx, {
            companyId,
            description: `Reclassify ${existing.name} as ${String(data.itemType).replace('_', ' ')}`,
            sourceType: 'stock_reclass',
            sourceId: existing.id,
            createdById: req.user!.id,
            lines: [
              { accountId: to.id, debit: value },
              { accountId: from.id, credit: value },
            ],
          });
        }
      }
      return tx.product.update({ where: { id: existing.id }, data });
    });
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
