import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors';

export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ success: false, message: err.message });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }
    if (err.code === 'P2003') {
      return res.status(409).json({
        success: false,
        message: 'This record is used by other records (for example invoices or purchases) and cannot be removed',
      });
    }
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'A record with these details already exists' });
    }
  }

  // Malformed JSON body
  if ((err as any).type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON body' });
  }

  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
};
