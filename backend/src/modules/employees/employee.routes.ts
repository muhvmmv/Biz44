import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { CrudService, pick } from '../../services/crud.service';
import { badRequest } from '../../lib/errors';

import { prisma } from '../../lib/prisma';
const router = Router();
const employeeService = new CrudService('employee');

router.use(authenticate);

// Summary (must come BEFORE /:id)
router.get('/:id/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user?.companyId!;
    const employee = await prisma.employee.findFirst({
      where: { id: req.params.id, companyId },
    });
    if (!employee) return res.status(404).json({ success: false, message: 'Not found' });

    const attendance = await prisma.attendance.findMany({
      where: { employeeId: employee.id },
      orderBy: { date: 'desc' },
      take: 90,
    });
    const leaves = await prisma.leave.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: 'desc' },
    });
    const payrolls = await prisma.payroll.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: 'desc' },
    });

    const attendanceSummary = {
      present: attendance.filter((a) => a.status === 'present').length,
      absent: attendance.filter((a) => a.status === 'absent').length,
      late: attendance.filter((a) => a.status === 'late').length,
      leave: attendance.filter((a) => a.status === 'leave').length,
    };

    res.json({
      success: true,
      data: { employee, attendance, attendanceSummary, leaves, payrolls },
    });
  } catch (err) { next(err); }
});

const WRITABLE = ['firstName', 'lastName', 'email', 'phone', 'position', 'salary', 'hireDate'] as const;

function normalizeEmployee(data: Record<string, any>) {
  if (data.salary !== undefined) {
    const salary = Number(data.salary);
    if (!Number.isFinite(salary) || salary < 0) throw badRequest('Salary must be a non-negative number');
    data.salary = salary;
  }
  if (data.hireDate !== undefined) data.hireDate = data.hireDate ? new Date(data.hireDate) : null;
  return data;
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await employeeService.findMany(req.user!.companyId, { orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = normalizeEmployee(pick(req.body, WRITABLE));
    if (!data.firstName || !data.lastName) throw badRequest('firstName and lastName required');
    const row = await employeeService.create(req.user!.companyId, data);
    res.status(201).json({ success: true, data: row });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const row = await employeeService.findOne(req.params.id, req.user!.companyId);
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const row = await employeeService.update(req.params.id, req.user!.companyId, normalizeEmployee(pick(req.body, WRITABLE)));
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const where = { employeeId: req.params.id };
    const used = (await prisma.payroll.count({ where })) + (await prisma.attendance.count({ where })) + (await prisma.leave.count({ where }));
    if (used > 0) throw badRequest('This employee has payroll, attendance or leave records, so they cannot be deleted. Their history is kept.');
    await employeeService.delete(req.params.id, req.user!.companyId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
