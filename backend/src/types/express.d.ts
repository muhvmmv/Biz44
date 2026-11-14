import { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        companyId: string;
      };
      /** Set by resolveLocation: undefined = "all accessible" scope */
      locationId?: string;
      /** Locations this user may query */
      allowedLocationIds: string[];
    }
  }
}