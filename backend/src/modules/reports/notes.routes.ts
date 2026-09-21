import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

router.use(authenticate);

// LIST notes
router.get('/', async (req, res, next) => {
  try {
    const { category } = req.query;
    const where: any = { companyId: req.user?.companyId };
    if (category) where.category = category;

    const notes = await prisma.reportNote.findMany({
      where,
      orderBy: { date: 'desc' },
    });
    res.json({ success: true, data: notes });
  } catch (err) { next(err); }
});

// CREATE note
router.post('/', async (req, res, next) => {
  try {
    const companyId = req.user?.companyId!;
    const { title, content, category = 'general', date } = req.body;

    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Title and content are required' });
    }

    const note = await prisma.reportNote.create({
      data: {
        companyId,
        title,
        content,
        category,
        date: date ? new Date(date) : new Date(),
      },
    });
    res.status(201).json({ success: true, data: note });
  } catch (err) { next(err); }
});

// UPDATE note
router.put('/:id', async (req, res, next) => {
  try {
    const { title, content, category, date } = req.body;
    const note = await prisma.reportNote.update({
      where: { id: req.params.id },
      data: {
        title,
        content,
        category,
        date: date ? new Date(date) : undefined,
      },
    });
    res.json({ success: true, data: note });
  } catch (err) { next(err); }
});

// DELETE note
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.reportNote.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;