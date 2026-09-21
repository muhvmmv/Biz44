import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { CrudService } from '../../services/crud.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();
const employeeService = new CrudService('employee');

router.use(authenticate);

// ---------- EMPLOYEE SUMMARY (must be ABOVE /:id) ----------
router.get('/:id/summary', async (req, res, next) => {
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

// ---------- LIST ----------
router.get('/', async (req, res, next) => {
  try {
    const employees = await employeeService.findMany({ companyId: req.user?.companyId });
    res.json({ success: true, data: employees });
  } catch (err) { next(err); }
});

// ---------- CREATE ----------
router.post('/', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId;
    const employee = await employeeService.create({ ...req.body, companyId });
    res.status(201).json({ success: true, data: employee });
  } catch (err) { next(err); }
});

// ---------- GET ONE ----------
router.get('/:id', async (req, res, next) => {
  try {
    const employee = await employeeService.findById(req.params.id);
    res.json({ success: true, data: employee });
  } catch (err) { next(err); }
});

// ---------- UPDATE ----------
router.put('/:id', async (req, res, next) => {
  try {
    const employee = await employeeService.update(req.params.id, req.body);
    res.json({ success: true, data: employee });
  } catch (err) { next(err); }
});

// ---------- DELETE ----------
router.delete('/:id', async (req, res, next) => {
  try {
    await employeeService.delete(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;