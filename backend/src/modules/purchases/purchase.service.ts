import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { findOrCreateAccount, resolvePaymentAccount, parsePositiveQuantity } from '../../lib/accounts';
import { consumeFromBatch, syncProductTotals } from '../../lib/inventory';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** What is still owed to the supplier on a purchase. */
export function purchaseBalance(p: { total: number; amountPaid: number; returnedAmount?: number | null }) {
  return round2(p.total - p.amountPaid - (p.returnedAmount ?? 0));
}

/** Payment status from amounts (and due date for overdue). */
export function purchaseStatus(
  p: { total: number; amountPaid: number; returnedAmount?: number | null; dueDate?: Date | null }
) {
  const balance = purchaseBalance(p);
  if (balance <= 0.01) return 'paid';
  const overdue = !!p.dueDate && new Date() > new Date(p.dueDate);
  if (overdue) return 'overdue';
  return p.amountPaid > 0 ? 'partially_paid' : 'unpaid';
}

/**
 * Return goods from one delivery (batch) to its supplier.
 *
 * The value returned (quantity × the batch's unit cost) first reduces what is
 * still owed on that purchase (Accounts Payable). If the purchase is already
 * paid beyond that, the supplier refunds the difference into the chosen
 * cash/bank account (`refundAccountId` is then required). The original
 * purchase total is never rewritten.
 */
export async function returnToSupplier(args: {
  companyId: string;
  purchaseId: string;
  batchId: string;
  quantity: unknown;
  refundAccountId?: unknown;
  reference?: string;
  notes?: string;
}) {
  const { companyId, purchaseId, batchId } = args;
  const quantity = parsePositiveQuantity(args.quantity);

  const purchase = await prisma.purchase.findFirst({ where: { id: purchaseId, companyId } });
  if (!purchase) throw notFound('Purchase not found');
  const batch = await prisma.inventoryBatch.findFirst({
    where: { id: batchId, companyId, purchaseId: purchase.id },
    include: { product: { select: { name: true } } },
  });
  if (!batch) throw badRequest('That delivery line does not belong to this purchase');
  if (batch.quantityRemaining < quantity) {
    throw badRequest(
      `Only ${batch.quantityRemaining} of ${batch.product.name} from this delivery is still in stock`
    );
  }

  const value = round2(quantity * batch.unitCost);
  const owed = Math.max(0, purchaseBalance(purchase));
  const appliedToBalance = Math.min(value, owed);
  const refund = round2(value - appliedToBalance);

  let refundAccount = null;
  if (refund > 0.009) {
    if (typeof args.refundAccountId !== 'string' || !args.refundAccountId) {
      throw badRequest(
        `This purchase is already paid, so the supplier owes you ${refund.toFixed(2)}. ` +
          'Choose the cash or bank account the refund is received into.'
      );
    }
    refundAccount = await resolvePaymentAccount(prisma, companyId, { accountId: args.refundAccountId });
  }

  const reference = args.reference || purchase.reference || 'Supplier return';

  return prisma.$transaction(async (tx) => {
    await consumeFromBatch(tx, {
      companyId,
      batchId: batch.id,
      quantity,
      type: 'supplier_return',
      reference,
      notes: args.notes,
    });

    // Inventory asset goes down by the cost returned.
    const inventory = await findOrCreateAccount(tx, companyId, 'Inventory', 'asset');
    await tx.account.update({ where: { id: inventory.id }, data: { balance: { decrement: value } } });

    if (appliedToBalance > 0) {
      const ap = await findOrCreateAccount(tx, companyId, 'Accounts Payable', 'liability');
      await tx.account.update({ where: { id: ap.id }, data: { balance: { decrement: appliedToBalance } } });
      await tx.transaction.create({
        data: {
          companyId,
          locationId: batch.locationId,
          accountId: ap.id,
          type: 'supplier_return',
          description: `Returned to supplier: ${quantity} × ${batch.product.name} (${reference})`,
          amount: -appliedToBalance,
        },
      });
    }

    if (refund > 0 && refundAccount) {
      await tx.account.update({ where: { id: refundAccount.id }, data: { balance: { increment: refund } } });
      await tx.transaction.create({
        data: {
          companyId,
          locationId: batch.locationId,
          accountId: refundAccount.id,
          type: 'refund',
          description: `Supplier refund for returned goods (${reference})`,
          amount: refund,
        },
      });
      // Record the refund in the purchase's payment history as a negative
      // payment so amountPaid always equals the sum of its payments.
      await tx.purchasePayment.create({
        data: {
          companyId,
          locationId: purchase.locationId,
          purchaseId: purchase.id,
          amount: -refund,
          method: 'refund',
          account: refundAccount.name,
          reference,
          notes: args.notes || 'Refund for returned goods',
        },
      });
    }

    const updated = {
      total: purchase.total,
      amountPaid: round2(purchase.amountPaid - refund),
      returnedAmount: round2((purchase.returnedAmount ?? 0) + value),
      dueDate: purchase.dueDate,
    };
    const result = await tx.purchase.update({
      where: { id: purchase.id },
      data: {
        amountPaid: updated.amountPaid,
        returnedAmount: updated.returnedAmount,
        status: purchaseStatus(updated),
      },
    });

    await syncProductTotals(tx, companyId, [batch.productId]);
    return { purchase: result, value, appliedToBalance, refund };
  });
}
