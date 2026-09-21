import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
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
      const deductions = gross * (deductionRate / 100);
      const net = gross - deductions;

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
    const payroll = await prisma.payroll.findUnique({ where: { id: req.params.id } });
    if (!payroll) return res.status(404).json({ success: false, message: 'Not found' });
    if (payroll.status === 'paid') {
      return res.status(400).json({ success: false, message: 'Already paid' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.payroll.update({
        where: { id: payroll.id },
        data: { status: 'paid', paidAt: new Date() },
      });

      const salaryAccount = await tx.account.findFirst({
        where: { companyId, name: 'Salary Expense' },
      }) || await tx.account.create({
        data: { companyId, name: 'Salary Expense', type: 'expense', balance: 0 },
      });

      const cashAccount = await tx.account.findFirst({
        where: { companyId, name: 'Cash' },
      }) || await tx.account.create({
        data: { companyId, name: 'Cash', type: 'asset', balance: 0 },
      });

      await tx.transaction.create({
        data: {
          companyId,
          accountId: salaryAccount.id,
          type: 'payroll',
          description: `Payroll ${payroll.period}`,
          amount: payroll.net,
          date: new Date(),
        },
      });

      await tx.account.update({
        where: { id: salaryAccount.id },
        data: { balance: { increment: payroll.net } },
      });
      await tx.account.update({
        where: { id: cashAccount.id },
        data: { balance: { decrement: payroll.net } },
      });
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE payroll
router.delete('/:id', async (req, res, next) => {
  try {
    const payroll = await prisma.payroll.findUnique({ where: { id: req.params.id } });
    if (!payroll) return res.status(404).json({ success: false, message: 'Not found' });
    if (payroll.status === 'paid') {
      return res.status(400).json({ success: false, message: 'Cannot delete paid payroll' });
    }
    await prisma.payroll.delete({ where: { id: payroll.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;