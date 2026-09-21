import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { CrudService } from '../../services/crud.service';

const router = Router();
const productService = new CrudService('product');

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const products = await productService.findMany({ companyId: req.user?.companyId });
    res.json({ success: true, data: products });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const product = await productService.create({
      ...req.body,
      companyId: req.user?.companyId,
    });
    res.status(201).json({ success: true, data: product });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const product = await productService.findById(req.params.id);
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const product = await productService.update(req.params.id, req.body);
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await productService.delete(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;