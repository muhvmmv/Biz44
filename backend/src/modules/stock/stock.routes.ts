import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { resolveLocation, locationWhere } from '../../middleware/locationAuth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

router.use(authenticate);

async function findOrCreateAccount(tx: any, companyId: string, name: string, type: string) {
  const existing = await tx.account.findFirst({ where: { companyId, name } });
  if (existing) return existing;
  return tx.account.create({ data: { companyId, name, type, balance: 0 } });
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
      items, supplierId, reference, notes,
      paymentStatus = 'paid', amountPaid, paymentAccount = 'Cash',
    } = req.body as {
      items: { productId: string; quantity: number; unitCost: number; sellingPrice?: number }[];
      supplierId?: string;
      reference?: string;
      notes?: string;
      paymentStatus?: string;
      amountPaid?: number;
      paymentAccount?: string;
    };

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one item required' });
    }

    const totalCost = items.reduce((s, it) => s + it.quantity * it.unitCost, 0);
    const paidAmount =
      paymentStatus === 'paid' ? totalCost :
      paymentStatus === 'unpaid' ? 0 :
      Math.min(Number(amountPaid ?? 0), totalCost);
    const outstanding = totalCost - paidAmount;

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
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) throw new Error(`Product not found: ${item.productId}`);

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

      if (paidAmount > 0) {
        const cashAccount = await findOrCreateAccount(tx, companyId, paymentAccount, 'asset');
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
    const { productId, quantity, reason, notes } = req.body as {
      productId: string;
      quantity: number;
      reason?: string;
      notes?: string;
    };

    if (!productId || quantity <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid input' });
    }

    await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new Error('Product not found');
      if (product.quantity < quantity) throw new Error('Insufficient stock');

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
    const { productId, quantity, batchId, reference, notes } = req.body as {
      productId: string;
      quantity: number;
      batchId?: string;
      reference?: string;
      notes?: string;
    };

    if (!productId || quantity <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid input' });
    }

    await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new Error('Product not found');
      if (product.quantity < quantity) throw new Error('Insufficient stock');

      let batch;
      if (batchId) {
        batch = await tx.inventoryBatch.findFirst({ where: { id: batchId, locationId } });
      }
      if (!batch) {
        const candidates = await tx.inventoryBatch.findMany({
          where: { productId, locationId, quantityRemaining: { gt: 0 } },
          orderBy: { receivedAt: 'desc' },
        });
        batch = candidates[0];
      }
      if (!batch || batch.quantityRemaining < quantity) {
        throw new Error('Not enough stock in a single batch to return');
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
    const { productId, quantity, notes } = req.body;

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

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
            reference: 'Adjustment',
            notes,
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