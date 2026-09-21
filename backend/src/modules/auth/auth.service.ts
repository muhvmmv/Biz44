import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

const prisma = new PrismaClient();

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  company?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export class AuthService {
  async register(data: RegisterInput) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new Error('Email already registered');

    const hashedPassword = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: hashedPassword,
        company: {
          create: {
            name: data.company || `${data.firstName} ${data.lastName}'s Company`,
            accounts: {
              create: [
                { name: 'Cash', type: 'asset', balance: 0 },
                { name: 'Bank Account', type: 'asset', balance: 0 },
                { name: 'Accounts Receivable', type: 'asset', balance: 0 },
                { name: 'Inventory', type: 'asset', balance: 0 },
                { name: 'Accounts Payable', type: 'liability', balance: 0 },
                { name: 'Sales Revenue', type: 'revenue', balance: 0 },
                { name: 'Cost of Goods Sold', type: 'expense', balance: 0 },
                { name: 'Rent Expense', type: 'expense', balance: 0 },
                { name: 'Utilities Expense', type: 'expense', balance: 0 },
                { name: 'Salary Expense', type: 'expense', balance: 0 },
                { name: 'General Expense', type: 'expense', balance: 0 },
              ],
            },
          },
        },
      },
    });

    const token = this.generateToken(user);
    return { user: this.sanitizeUser(user), token };
  }

  async login(data: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) throw new Error('Invalid email or password');

    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) throw new Error('Invalid email or password');

    const token = this.generateToken(user);
    return { user: this.sanitizeUser(user), token };
  }

  async getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { company: { select: { businessType: true } } },
  });
  if (!user) throw new Error('User not found');
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    companyId: user.companyId,
    businessType: user.company?.businessType ?? null,
  };
}

  private generateToken(user: { id: string; email: string; role: string; companyId: string }) {
    return jwt.sign(
      { id: user.id, email: user.email, role: user.role, companyId: user.companyId },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );
  }

  private sanitizeUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    companyId: string;
    createdAt: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      companyId: user.companyId,
    };
  }
}