import { Router } from 'express';
import { authenticate } from '../../middleware/auth';

import { prisma } from '../../lib/prisma';
const router = Router();

router.use(authenticate);

router.get('/company', async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user?.companyId },
    });
    res.json({ success: true, data: company });
  } catch (err) { next(err); }
});

router.put('/company', async (req, res, next) => {
  try {
    const {
      name, email, phone, address,
      businessType, industry, country, currency, teamSize,
    } = req.body;

    const company = await prisma.company.update({
      where: { id: req.user?.companyId },
      data: {
        name,
        email,
        phone,
        address,
        businessType,
        industry,
        country,
        currency,
        teamSize,
      },
    });
    res.json({ success: true, data: company });
  } catch (err) { next(err); }
});

router.get('/onboarding', async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user?.companyId },
      select: { onboardingCompleted: true },
    });
    res.json({
      success: true,
      data: { completed: company?.onboardingCompleted ?? false },
    });
  } catch (err) { next(err); }
});

router.post('/onboarding', async (req, res, next) => {
  try {
    const { businessType, industry, country, currency, teamSize, phone, address } = req.body;
    const company = await prisma.company.update({
      where: { id: req.user?.companyId },
      data: {
        businessType,
        industry,
        country,
        currency: currency || 'USD',
        teamSize,
        phone,
        address,
        onboardingCompleted: true,
      },
    });
    res.json({ success: true, data: company });
  } catch (err) { next(err); }
});

export default router;