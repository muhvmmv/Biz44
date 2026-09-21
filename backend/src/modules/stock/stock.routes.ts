import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

router.use(authenticate);

// List movements (optionally filtered by product)
router.get('/', async (req, res, next) => {
  try {
    const { productId } = req.query;
    const where: any = { companyId: req.user?.companyId };
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

// Receive inventory (bulk)
router.post('/receive', async (req, res, next) => {
  try {
    const { items, reference, notes } = req.body as {
      items: { productId: string; quantity: number; unitCost: number }[];
      reference?: string;
      notes?: string;
    };
    const companyId = req.user?.companyId;

    const results = await prisma.$transaction(async (tx) => {
      const created = [];
      for (const item of items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) throw new Error(`Product not found: ${item.productId}`);

        const newBalance = product.quantity + item.quantity;

        await tx.product.update({
          where: { id: product.id },
          data: {
            quantity: newBalance,
            cost: item.unitCost || product.cost,
          },
        });

        const movement = await tx.stockMovement.create({
          data: {
            companyId,
            productId: product.id,
            type: 'receipt',
            quantity: item.quantity,
            balance: newBalance,
            reference,
            notes,
          },
        });
        created.push(movement);
      }
      return created;
    });

    res.status(201).json({ success: true, data: results });
  } catch (err) { next(err); }
});

// Adjust stock manually
router.post('/adjust', async (req, res, next) => {
  try {
    const { productId, quantity, notes } = req.body;
    const companyId = req.user?.companyId;

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const newBalance = product.quantity + quantity;
    if (newBalance < 0) return res.status(400).json({ success: false, message: 'Insufficient stock' });

    await prisma.product.update({
      where: { id: productId },
      data: { quantity: newBalance },
    });

    const movement = await prisma.stockMovement.create({
      data: {
        companyId,
        productId,
        type: 'adjustment',
        quantity,
        balance: newBalance,
        notes,
      },
    });

    res.status(201).json({ success: true, data: movement });
  } catch (err) { next(err); }
});

export default router;