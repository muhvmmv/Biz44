import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { resolveLocation, locationWhere, requireTargetLocation } from '../../middleware/locationAuth';
import { prisma } from '../../lib/prisma';
import { AppError, badRequest, notFound } from '../../lib/errors';
import { can } from '../../lib/permissions';
import { resolvePaymentAccount, parsePositiveAmount, parsePositiveQuantity, parseQuantity, roundQty } from '../../lib/accounts';
import { postJournal, systemAccount, round2 } from '../../lib/ledger';
import {
  addStock, consumeFifo, stockAt, averageCost, syncProductTotals, postInventoryLoss, inventoryAccountFor,
} from '../../lib/inventory';
import { runStockCheck, fixSafeStockIssues } from '../../lib/stockCheck';
import { returnToSupplier } from '../purchases/purchase.service';

const router = Router();

router.use(authenticate);

const RECEIVE_PAYMENT_STATUSES = ['paid', 'unpaid', 'partially_paid'];

/** Load a product only if it belongs to this company. */
async function findCompanyProduct(tx: any, companyId: string, productId: unknown) {
  if (typeof productId !== 'string' || !productId) throw badRequest('Product is required');
  const product = await tx.product.findFirst({ where: { id: productId, companyId } });
  if (!product) throw notFound('Product not found');
  return product;
}

// ---------- LIST movements (location-scoped) ----------
router.get('/', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.query;
    const where: any = { companyId: req.user?.companyId, ...locationWhere(req) };
    if (productId) where.productId = productId;

    const movements = await prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { product: { select: { name: true, sku: true } } },
    });
    res.json({ success: true, data: movements });
  } catch (err) { next(err); }
});

// ---------- LIST batches for a product (location-scoped) ----------
router.get('/batches/:productId', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    await findCompanyProduct(prisma, companyId, req.params.productId);
    const batches = await prisma.inventoryBatch.findMany({
      where: { companyId, productId: req.params.productId, ...locationWhere(req) },
      orderBy: { receivedAt: 'asc' },
      include: { supplier: { select: { name: true } }, location: { select: { name: true } }, productionOrder: { select: { id: true, number: true } } },
    });
    res.json({ success: true, data: batches });
  } catch (err) { next(err); }
});

// ---------- STOCK LEVELS of one product per location ----------
router.get('/levels/:productId', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    await findCompanyProduct(prisma, companyId, req.params.productId);
    const batches = await prisma.inventoryBatch.findMany({
      where: {
        companyId,
        productId: req.params.productId,
        quantityRemaining: { gt: 0 },
        locationId: { in: req.allowedLocationIds },
      },
      select: { locationId: true, quantityRemaining: true, unitCost: true, location: { select: { name: true } } },
    });
    const map = new Map<string, { locationId: string; name: string; quantity: number; value: number }>();
    for (const b of batches) {
      const key = b.locationId || 'none';
      const cur = map.get(key) || { locationId: key, name: b.location?.name || 'No location', quantity: 0, value: 0 };
      cur.quantity += b.quantityRemaining;
      cur.value += b.quantityRemaining * b.unitCost;
      map.set(key, cur);
    }
    res.json({ success: true, data: Array.from(map.values()) });
  } catch (err) { next(err); }
});

// ---------- RECEIVE INVENTORY ----------
router.post('/receive', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const locationId = requireTargetLocation(req);
    const {
      items: rawItems, supplierId, reference, notes, dueDate: rawDueDate,
      paymentStatus: requestedStatus = 'paid', amountPaid, paymentAccount, paymentAccountId,
    } = req.body as {
      items: { productId: string; quantity: number; unitCost: number; sellingPrice?: number }[];
      paymentAccountId?: string;
      supplierId?: string;
      reference?: string;
      notes?: string;
      paymentStatus?: string;
      amountPaid?: number;
      paymentAccount?: string;
      dueDate?: string;
    };
    let dueDate: Date | null = null;
    if (rawDueDate) {
      dueDate = new Date(rawDueDate);
      if (isNaN(dueDate.getTime())) throw badRequest('Invalid due date');
    }

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one item required' });
    }
    if (!RECEIVE_PAYMENT_STATUSES.includes(requestedStatus)) {
      throw badRequest('Payment status must be paid, unpaid or partially_paid');
    }

    const items = rawItems.map((it, i) => {
      const unitCost = Number(it?.unitCost);
      if (!Number.isFinite(unitCost) || unitCost < 0) {
        throw badRequest(`Line ${i + 1}: unit cost must be 0 or more`);
      }
      let sellingPrice: number | undefined;
      if (it?.sellingPrice !== undefined && it?.sellingPrice !== null) {
        sellingPrice = Number(it.sellingPrice);
        if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
          throw badRequest(`Line ${i + 1}: selling price must be 0 or more`);
        }
      }
      return {
        productId: String(it?.productId || ''),
        quantity: parsePositiveQuantity(it?.quantity, `Line ${i + 1} quantity`),
        unitCost,
        sellingPrice,
      };
    });

    // Every product and the supplier must belong to this company.
    const productIds = Array.from(new Set(items.map((it) => it.productId)));
    const ownedCount = await prisma.product.count({ where: { id: { in: productIds }, companyId } });
    if (ownedCount !== productIds.length) throw notFound('One or more products were not found');
    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, companyId }, select: { id: true } });
      if (!supplier) throw notFound('Supplier not found');
    }

    // Goods are valued without VAT; VAT charged by the supplier is recoverable
    // input VAT, owed to the supplier with the goods.
    const goodsValue = round2(items.reduce((s, it) => s + it.quantity * it.unitCost, 0));
    let vatAmount = 0;
    if (req.body?.vatAmount !== undefined && req.body?.vatAmount !== null && req.body?.vatAmount !== '' && Number(req.body.vatAmount) !== 0) {
      vatAmount = parsePositiveAmount(req.body.vatAmount, 'VAT');
      if (vatAmount > goodsValue + 0.01) throw badRequest('VAT cannot be more than the value of the goods');
    }
    const totalCost = round2(goodsValue + vatAmount);
    let paidAmount = 0;
    if (requestedStatus === 'paid') paidAmount = totalCost;
    else if (requestedStatus === 'partially_paid') {
      paidAmount = parsePositiveAmount(amountPaid, 'Amount paid');
      if (paidAmount > totalCost + 0.01) throw badRequest('Amount paid cannot be more than the purchase total');
      paidAmount = Math.min(paidAmount, totalCost);
    }
    const outstanding = totalCost - paidAmount;
    // Derive the stored status from the amounts so it is always consistent.
    const paymentStatus =
      outstanding <= 0.01 ? 'paid' : paidAmount > 0 ? 'partially_paid' : 'unpaid';

    if (paidAmount > 0 && !can(req.user!.role, 'money', 'write')) {
      throw new AppError(403, 'Your role can receive goods on credit only. Ask an accountant to record the payment.');
    }
    // Validate the payment account before writing anything.
    const payFromAccount = paidAmount > 0
      ? await resolvePaymentAccount(prisma, companyId, { accountId: paymentAccountId, account: paymentAccount })
      : null;

    const result = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          companyId,
          locationId,
          supplierId: supplierId || null,
          reference,
          subtotal: goodsValue,
          taxTotal: vatAmount,
          total: totalCost,
          amountPaid: paidAmount,
          status: paymentStatus,
          // A due date only matters while something is owed.
          dueDate: outstanding > 0.01 ? dueDate : null,
          notes,
          items: {
            create: items.map((it) => ({
              productId: it.productId,
              quantity: it.quantity,
              unitCost: it.unitCost,
              total: it.quantity * it.unitCost,
            })),
          },
        },
      });

      // Record the initial payment in the purchase's payment history.
      if (paidAmount > 0 && payFromAccount) {
        await tx.purchasePayment.create({
          data: {
            companyId,
            locationId,
            purchaseId: purchase.id,
            amount: paidAmount,
            method: 'on_receipt',
            account: payFromAccount.name,
            reference,
            notes: 'Paid when goods were received',
          },
        });
      }

      for (const item of items) {
        const product = await findCompanyProduct(tx, companyId, item.productId);
        await addStock(tx, {
          companyId,
          locationId,
          productId: product.id,
          quantity: item.quantity,
          unitCost: item.unitCost,
          supplierId: supplierId || null,
          purchaseId: purchase.id,
          sellingPriceSnapshot: item.sellingPrice ?? product.price,
          type: 'receipt',
          reference,
          notes,
        });
        // Remember the latest purchase cost and (if given) the new default selling price.
        await tx.product.update({
          where: { id: product.id },
          data: { cost: item.unitCost, price: item.sellingPrice ?? product.price },
        });
      }
      await syncProductTotals(tx, companyId, productIds);

      // Dr the inventory account for each item's stage (raw materials &
      // packaging, or finished goods) / Cr Cash-or-Bank (paid now) / Cr Accounts Payable (owed)
      const typeOf = new Map(
        (await tx.product.findMany({ where: { id: { in: productIds }, companyId }, select: { id: true, itemType: true } }))
          .map((p: { id: string; itemType: string }) => [p.id, p.itemType])
      );
      const debitByAccount = new Map<string, number>();
      for (const it of items) {
        const acc = await inventoryAccountFor(tx, companyId, typeOf.get(it.productId));
        debitByAccount.set(acc.id, (debitByAccount.get(acc.id) ?? 0) + it.quantity * it.unitCost);
      }
      if (vatAmount > 0) {
        const vatInput = await systemAccount(tx, companyId, 'vat_input');
        debitByAccount.set(vatInput.id, vatAmount);
      }
      const ap = await systemAccount(tx, companyId, 'ap');
      await postJournal(tx, {
        companyId,
        locationId,
        description: `Goods received${reference ? ` ${reference}` : ''}`,
        sourceType: 'purchase',
        sourceId: purchase.id,
        reference,
        createdById: req.user!.id,
        lines: [
          ...Array.from(debitByAccount, ([accountId, amount]) => ({ accountId, debit: amount })),
          ...(paidAmount > 0 && payFromAccount ? [{ accountId: payFromAccount.id, credit: paidAmount }] : []),
          ...(outstanding > 0 ? [{ accountId: ap.id, credit: outstanding }] : []),
        ],
      });

      return purchase;
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ---------- DAMAGE / WRITE-OFF ----------
// Removes stock FIFO at the selected location and books its cost as Inventory Loss.
router.post('/damage', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const locationId = requireTargetLocation(req);
    const { productId, reason, notes } = req.body as { productId: string; reason?: string; notes?: string };
    const quantity = parsePositiveQuantity(req.body?.quantity);

    await prisma.$transaction(async (tx) => {
      const product = await findCompanyProduct(tx, companyId, productId);
      const { totalCost } = await consumeFifo(tx, {
        companyId, locationId, productId: product.id, productName: product.name, unit: product.unit, quantity,
        type: 'damage', reference: reason || 'Damage/Write-off', notes,
      });
      await postInventoryLoss(tx, {
        companyId, locationId, itemType: product.itemType, amount: totalCost, sourceType: 'stock_writeoff', sourceId: product.id,
        reference: reason || 'Write-off',
        description: `Write-off: ${quantity} × ${product.name}${reason ? ` (${reason})` : ''}`,
      });
      await syncProductTotals(tx, companyId, [product.id]);
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ---------- SUPPLIER RETURN ----------
// Kept for API compatibility; the purchase page uses POST /purchases/:id/return.
router.post('/supplier-return', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { purchaseId, batchId, quantity, refundAccountId, reference, notes } = req.body || {};
    if (!purchaseId || !batchId) throw badRequest('purchaseId and batchId are required');
    const result = await returnToSupplier({
      companyId: req.user!.companyId, purchaseId, batchId, quantity, refundAccountId, reference, notes,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

/** Shared by /adjust and /count: change stock at a location by `delta` units. */
async function applyStockChange(
  companyId: string,
  locationId: string,
  productId: string,
  delta: number,
  type: 'adjustment' | 'count',
  notes?: string
) {
  return prisma.$transaction(async (tx) => {
    const product = await findCompanyProduct(tx, companyId, productId);
    let valueChange = 0; // + = stock value added, - = removed
    if (delta > 0) {
      // Found stock is valued at the current average cost at this location.
      const unitCost = await averageCost(tx, companyId, product.id, locationId, product.cost);
      const { totalCost } = await addStock(tx, {
        companyId, locationId, productId: product.id, quantity: delta, unitCost,
        sellingPriceSnapshot: product.price, type,
        reference: type === 'count' ? 'Stock count' : 'Adjustment', notes,
      });
      valueChange = totalCost;
    } else if (delta < 0) {
      const { totalCost } = await consumeFifo(tx, {
        companyId, locationId, productId: product.id, productName: product.name, unit: product.unit, quantity: -delta,
        type, reference: type === 'count' ? 'Stock count' : 'Adjustment', notes,
      });
      valueChange = -totalCost;
    }
    if (valueChange !== 0) {
      await postInventoryLoss(tx, {
        companyId, locationId, itemType: product.itemType, amount: -valueChange,
        sourceType: type === 'count' ? 'stock_count' : 'stock_adjustment', sourceId: product.id,
        description: `${type === 'count' ? 'Stock count' : 'Stock adjustment'}: ${delta > 0 ? '+' : ''}${delta} × ${product.name}`,
      });
    }
    await syncProductTotals(tx, companyId, [product.id]);
    return { productId: product.id, delta, valueChange, onHand: await stockAt(tx, companyId, product.id, locationId) };
  });
}

// ---------- ADJUST (add or remove units) ----------
router.post('/adjust', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const locationId = requireTargetLocation(req);
    const quantity = roundQty(Number(req.body?.quantity));
    if (!Number.isFinite(quantity) || quantity === 0) {
      throw badRequest('Adjustment quantity must be a number other than 0');
    }
    const result = await applyStockChange(companyId, locationId, req.body?.productId, quantity, 'adjustment', req.body?.notes);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ---------- COUNT (set the quantity physically counted) ----------
router.post('/count', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const locationId = requireTargetLocation(req);
    const counted = parseQuantity(req.body?.countedQuantity, 'Counted quantity');
    const product = await findCompanyProduct(prisma, companyId, req.body?.productId);
    const onHand = await stockAt(prisma, companyId, product.id, locationId);
    const delta = roundQty(counted - onHand);
    if (delta === 0) {
      return res.json({ success: true, data: { productId: product.id, delta: 0, valueChange: 0, onHand } });
    }
    const result = await applyStockChange(companyId, locationId, product.id, delta, 'count', req.body?.notes);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ---------- STOCK CHECK (read-only reconciliation) ----------
router.get('/check', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await runStockCheck(req.user!.companyId);
    res.json({ success: true, data: report });
  } catch (err) { next(err); }
});

// ---------- STOCK CHECK: apply only the safe, automatic fixes ----------
router.post('/check/fix', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const result = await fixSafeStockIssues(req.user!.companyId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export default router;
