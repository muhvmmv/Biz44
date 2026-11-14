import { Router } from 'express';
import { authenticate } from '../../middleware/auth';

import { prisma } from '../../lib/prisma';
import { badRequest } from '../../lib/errors';
import { resolvePaymentAccount } from '../../lib/accounts';
import { postJournal, systemAccount } from '../../lib/ledger';
const router = Router();

router.use(authenticate);

// LIST payrolls
router.get('/', async (req, res, next) => {
  try {
    const payrolls = await prisma.payroll.findMany({
      where: { companyId: req.user?.companyId },
      orderBy: { createdAt: 'desc' },
      include: { employee: { select: { firstName: true, lastName: true, position: true } } },
    });
    res.json({ success: true, data: payrolls });
  } catch (err) { next(err); }
});

// RUN payroll for a month — creates payroll records for all employees
router.post('/run', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;
    const { period, deductionRate = 0 } = req.body; // period = "2026-03"

    if (!period) return res.status(400).json({ success: false, message: 'Period required' });
    const rate = Number(deductionRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return res.status(400).json({ success: false, message: 'Deduction rate must be between 0 and 100' });
    }

    const employees = await prisma.employee.findMany({ where: { companyId } });
    if (employees.length === 0) {
      return res.status(400).json({ success: false, message: 'No employees found' });
    }

    // Skip employees already processed for this period
    const existing = await prisma.payroll.findMany({
      where: { companyId, period },
      select: { employeeId: true },
    });
    const processed = new Set(existing.map((p) => p.employeeId));

    const created = [];
    for (const emp of employees) {
      if (processed.has(emp.id)) continue;

      const gross = emp.salary;
      const deductions = Math.round(gross * (rate / 100) * 100) / 100;
      const net = Math.round((gross - deductions) * 100) / 100;

      const payroll = await prisma.payroll.create({
        data: {
          companyId,
          employeeId: emp.id,
          period,
          gross,
          deductions,
          net,
          status: 'pending',
        },
      });
      created.push(payroll);
    }

    res.status(201).json({ success: true, data: created });
  } catch (err) { next(err); }
});

// MARK paid — creates accounting transaction
router.post('/:id/pay', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;
    const payroll = await prisma.payroll.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId } });
    if (!payroll) return res.status(404).json({ success: false, message: 'Not found' });
    if (payroll.status === 'paid') {
      return res.status(400).json({ success: false, message: 'Already paid' });
    }

    const payFrom = await resolvePaymentAccount(prisma, companyId, {
      accountId: req.body?.accountId,
      account: req.body?.account,
    });
    const employee = await prisma.employee.findFirst({
      where: { id: payroll.employeeId, companyId },
      select: { firstName: true, lastName: true },
    });

    await prisma.$transaction(async (tx) => {
      // Claim it first so a double click cannot pay twice.
      const claimed = await tx.payroll.updateMany({
        where: { id: payroll.id, status: { not: 'paid' } },
        data: { status: 'paid', paidAt: new Date() },
      });
      if (claimed.count === 0) throw badRequest('Already paid');

      // Dr Salary Expense (gross) / Cr Cash-or-Bank (net) / Cr Payroll Deductions Payable (withheld)
      const salaries = await systemAccount(tx, companyId, 'salaries');
      const deductionsPayable = await systemAccount(tx, companyId, 'payroll_liabilities');
      const deductions = Math.max(0, Math.round((payroll.gross - payroll.net) * 100) / 100);
      await postJournal(tx, {
        companyId,
        locationId: payroll.locationId,
        description: `Payroll ${payroll.period}${employee ? ` — ${employee.firstName} ${employee.lastName}` : ''}`,
        sourceType: 'payroll',
        sourceId: payroll.id,
        reference: payroll.period,
        createdById: req.user!.id,
        lines: [
          { accountId: salaries.id, debit: payroll.gross },
          { accountId: payFrom.id, credit: payroll.net },
          { accountId: deductionsPayable.id, credit: deductions },
        ],
      });
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE payroll
router.delete('/:id', async (req, res, next) => {
  try {
    const payroll = await prisma.payroll.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId } });
    if (!payroll) return res.status(404).json({ success: false, message: 'Not found' });
    if (payroll.status === 'paid') {
      return res.status(400).json({ success: false, message: 'Cannot delete paid payroll' });
    }
    await prisma.payroll.delete({ where: { id: payroll.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;