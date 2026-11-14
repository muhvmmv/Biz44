import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { resolveLocation, locationWhere } from '../../middleware/locationAuth';

import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import {
  findOrCreateAccount, resolvePaymentAccount, parsePositiveAmount, parsePositiveQuantity,
} from '../../lib/accounts';

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

function targetLocationId(req: Request): string {
  return req.locationId || req.allowedLocationIds[0];
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
    const companyId = req.user?.companyId!;
    const batches = await prisma.inventoryBatch.findMany({
      where: { companyId, productId: req.params.productId, ...locationWhere(req) },
      orderBy: { receivedAt: 'asc' },
      include: { supplier: { select: { name: true } } },
    });
    res.json({ success: true, data: batches });
  } catch (err) { next(err); }
});

// ---------- RECEIVE INVENTORY ----------
router.post('/receive', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const locationId = targetLocationId(req);
    const {
      items: rawItems, supplierId, reference, notes,
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
    };

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

    const totalCost = items.reduce((s, it) => s + it.quantity * it.unitCost, 0);
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
          subtotal: totalCost,
          total: totalCost,
          amountPaid: paidAmount,
          status: paymentStatus,
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

      for (const item of items) {
        const product = await findCompanyProduct(tx, companyId, item.productId);

        const batch = await tx.inventoryBatch.create({
          data: {
            companyId,
            locationId,
            productId: product.id,
            supplierId: supplierId || null,
            purchaseId: purchase.id,
            quantityReceived: item.quantity,
            quantityRemaining: item.quantity,
            unitCost: item.unitCost,
            sellingPriceSnapshot: item.sellingPrice ?? product.price,
            reference,
            receivedAt: new Date(),
          },
        });

        const addedCost = item.quantity * item.unitCost;
        const newQuantity = product.quantity + item.quantity;
        const newTotalValue = product.totalCostValue + addedCost;

        await tx.product.update({
          where: { id: product.id },
          data: {
            quantity: newQuantity,
            totalCostValue: newTotalValue,
            cost: item.unitCost,
            price: item.sellingPrice ?? product.price,
          },
        });

        await tx.stockMovement.create({
          data: {
            companyId,
            locationId,
            productId: product.id,
            batchId: batch.id,
            type: 'receipt',
            quantity: item.quantity,
            balance: newQuantity,
            unitCost: item.unitCost,
            totalCost: addedCost,
            reference,
            notes,
          },
        });
      }

      const inventoryAccount = await findOrCreateAccount(tx, companyId, 'Inventory', 'asset');
      await tx.account.update({
        where: { id: inventoryAccount.id },
        data: { balance: { increment: totalCost } },
      });
      await tx.transaction.create({
        data: {
          companyId,
          locationId,
          accountId: inventoryAccount.id,
          type: 'inventory',
          description: `Inventory receipt${reference ? ` ${reference}` : ''}`,
          amount: totalCost,
          date: new Date(),
        },
      });

      if (paidAmount > 0 && payFromAccount) {
        const cashAccount = payFromAccount;
        await tx.account.update({
          where: { id: cashAccount.id },
          data: { balance: { decrement: paidAmount } },
        });
        await tx.transaction.create({
          data: {
            companyId,
            locationId,
            accountId: cashAccount.id,
            type: 'payment',
            description: `Paid for inventory${reference ? ` ${reference}` : ''}`,
            amount: paidAmount,
            date: new Date(),
          },
        });
      }

      if (outstanding > 0) {
        const apAccount = await findOrCreateAccount(tx, companyId, 'Accounts Payable', 'liability');
        await tx.account.update({
          where: { id: apAccount.id },
          data: { balance: { increment: outstanding } },
        });
        await tx.transaction.create({
          data: {
            companyId,
            locationId,
            accountId: apAccount.id,
            type: 'purchase',
            description: `Inventory owed${reference ? ` ${reference}` : ''}`,
            amount: outstanding,
            date: new Date(),
          },
        });
      }

      return purchase;
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ---------- DAMAGE / WRITE-OFF ----------
router.post('/damage', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const locationId = targetLocationId(req);
    const { productId, reason, notes } = req.body as {
      productId: string;
      reason?: string;
      notes?: string;
    };
    const quantity = parsePositiveQuantity(req.body?.quantity);

    await prisma.$transaction(async (tx) => {
      const product = await findCompanyProduct(tx, companyId, productId);
      if (product.quantity < quantity) throw badRequest('Insufficient stock');

      const batches = await tx.inventoryBatch.findMany({
        where: { productId, locationId, quantityRemaining: { gt: 0 } },
        orderBy: { receivedAt: 'asc' },
      });

      let remaining = quantity;
      let totalWrittenOff = 0;
      let runningBalance = product.quantity;

      for (const batch of batches) {
        if (remaining <= 0) break;
        const consume = Math.min(batch.quantityRemaining, remaining);

        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: { quantityRemaining: batch.quantityRemaining - consume },
        });

        const cost = consume * batch.unitCost;
        totalWrittenOff += cost;
        runningBalance -= consume;

        await tx.stockMovement.create({
          data: {
            companyId,
            locationId,
            productId,
            batchId: batch.id,
            type: 'damage',
            quantity: -consume,
            balance: runningBalance,
            unitCost: batch.unitCost,
            totalCost: cost,
            reference: reason || 'Damage/Write-off',
            notes,
          },
        });

        remaining -= consume;
      }

      if (remaining > 0) {
        throw badRequest(
          `Only ${quantity - remaining} of ${product.name} is in stock at this location; cannot write off ${quantity}`
        );
      }

      const newQuantity = product.quantity - quantity;
      const newTotalValue = product.totalCostValue - totalWrittenOff;

      await tx.product.update({
        where: { id: productId },
        data: { quantity: newQuantity, totalCostValue: newTotalValue },
      });

      const inventoryAccount = await findOrCreateAccount(tx, companyId, 'Inventory', 'asset');
      const lossAccount = await findOrCreateAccount(tx, companyId, 'Inventory Loss', 'expense');

      await tx.account.update({
        where: { id: inventoryAccount.id },
        data: { balance: { decrement: totalWrittenOff } },
      });
      await tx.account.update({
        where: { id: lossAccount.id },
        data: { balance: { increment: totalWrittenOff } },
      });
      await tx.transaction.create({
        data: {
          companyId,
          locationId,
          accountId: lossAccount.id,
          type: 'expense',
          description: `Inventory write-off${reason ? `: ${reason}` : ''}`,
          amount: totalWrittenOff,
          date: new Date(),
        },
      });
    });

    res.json({ success: true });
  } catch (err: any) {
    if (err.message?.includes('Insufficient')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
});

// ---------- SUPPLIER RETURN ----------
router.post('/supplier-return', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const locationId = targetLocationId(req);
    const { productId, batchId, reference, notes } = req.body as {
      productId: string;
      batchId?: string;
      reference?: string;
      notes?: string;
    };
    const quantity = parsePositiveQuantity(req.body?.quantity);

    await prisma.$transaction(async (tx) => {
      const product = await findCompanyProduct(tx, companyId, productId);
      if (product.quantity < quantity) throw badRequest('Insufficient stock');

      let batch;
      if (batchId) {
        batch = await tx.inventoryBatch.findFirst({
          where: { id: batchId, companyId, productId: product.id, locationId },
        });
        if (!batch) throw badRequest('That batch does not belong to this product at this location');
      } else {
        const candidates = await tx.inventoryBatch.findMany({
          where: { companyId, productId: product.id, locationId, quantityRemaining: { gt: 0 } },
          orderBy: { receivedAt: 'desc' },
        });
        batch = candidates[0];
      }
      if (!batch || batch.quantityRemaining < quantity) {
        throw badRequest('Not enough stock in a single batch to return');
      }

      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: { quantityRemaining: batch.quantityRemaining - quantity },
      });

      const cost = quantity * batch.unitCost;
      const newQuantity = product.quantity - quantity;
      const newTotalValue = product.totalCostValue - cost;

      await tx.product.update({
        where: { id: productId },
        data: { quantity: newQuantity, totalCostValue: newTotalValue },
      });

      await tx.stockMovement.create({
        data: {
          companyId,
          locationId,
          productId,
          batchId: batch.id,
          type: 'supplier_return',
          quantity: -quantity,
          balance: newQuantity,
          unitCost: batch.unitCost,
          totalCost: cost,
          reference,
          notes,
        },
      });

      const inventoryAccount = await findOrCreateAccount(tx, companyId, 'Inventory', 'asset');
      const apAccount = await findOrCreateAccount(tx, companyId, 'Accounts Payable', 'liability');

      await tx.account.update({
        where: { id: inventoryAccount.id },
        data: { balance: { decrement: cost } },
      });
      await tx.account.update({
        where: { id: apAccount.id },
        data: { balance: { decrement: cost } },
      });

      await tx.transaction.create({
        data: {
          companyId,
          locationId,
          accountId: apAccount.id,
          type: 'refund',
          description: `Supplier return${reference ? ` ${reference}` : ''}`,
          amount: -cost,
          date: new Date(),
        },
      });
    });

    res.json({ success: true });
  } catch (err: any) {
    if (err.message?.includes('Insufficient') || err.message?.includes('Not enough')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
});

// ---------- ADJUST ----------
router.post('/adjust', resolveLocation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user!.companyId;
    const locationId = targetLocationId(req);
    const { productId, notes } = req.body;
    const quantity = Number(req.body?.quantity);
    if (!Number.isInteger(quantity) || quantity === 0) {
      throw badRequest('Adjustment quantity must be a whole number other than 0');
    }

    const product = await findCompanyProduct(prisma, companyId, productId);

    const newBalance = product.quantity + quantity;
    if (newBalance < 0) return res.status(400).json({ success: false, message: 'Insufficient stock' });

    const avgCost = product.quantity > 0 ? product.totalCostValue / product.quantity : product.cost;
    const totalDelta = quantity * avgCost;

    await prisma.$transaction(async (tx) => {
      let batchId: string | undefined;
      if (quantity > 0) {
        const batch = await tx.inventoryBatch.create({
          data: {
            companyId,
            locationId,
            productId,
            quantityReceived: quantity,
            quantityRemaining: quantity,
            unitCost: avgCost,
            reference: notes ? `Adjustment: ${String(notes).slice(0, 120)}` : 'Adjustment',
          },
        });
        batchId = batch.id;
      } else {
        const batches = await tx.inventoryBatch.findMany({
          where: { productId, locationId, quantityRemaining: { gt: 0 } },
          orderBy: { receivedAt: 'asc' },
        });
        let remaining = Math.abs(quantity);
        for (const b of batches) {
          if (remaining <= 0) break;
          const consume = Math.min(b.quantityRemaining, remaining);
          await tx.inventoryBatch.update({
            where: { id: b.id },
            data: { quantityRemaining: b.quantityRemaining - consume },
          });
          remaining -= consume;
        }
        if (remaining > 0) {
          throw badRequest(
            `Only ${Math.abs(quantity) - remaining} of ${product.name} is in stock at this location`
          );
        }
      }

      await tx.product.update({
        where: { id: productId },
        data: {
          quantity: newBalance,
          totalCostValue: product.totalCostValue + totalDelta,
        },
      });

      await tx.stockMovement.create({
        data: {
          companyId,
          locationId,
          productId,
          batchId,
          type: 'adjustment',
          quantity,
          balance: newBalance,
          unitCost: avgCost,
          totalCost: Math.abs(totalDelta),
          notes,
        },
      });
    });

    res.status(201).json({ success: true });
  } catch (err) { next(err); }
});

export default router;