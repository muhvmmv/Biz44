import { PrismaClient } from '@prisma/client';

// One shared client for the whole process. Each PrismaClient opens its own
// connection pool, so creating one per module exhausts database connections.
export const prisma = new PrismaClient();
