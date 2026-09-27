import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { CrudService } from '../../services/crud.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
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

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employees = await employeeService.findMany({ companyId: req.user?.companyId });
    res.json({ success: true, data: employees });
  } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.user?.companyId;
    const employee = await employeeService.create({ ...req.body, companyId });
    res.status(201).json({ success: true, data: employee });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employee = await employeeService.findById(req.params.id);
    res.json({ success: true, data: employee });
  } catch (err) { next(err); }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employee = await employeeService.update(req.params.id, req.body);
    res.json({ success: true, data: employee });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await employeeService.delete(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;