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
    const companyName = data.company || `${data.firstName} ${data.lastName}'s Company`;

    // 1. Create the user + company + default accounts in one transaction
    const user = await prisma.user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: hashedPassword,
        company: {
          create: {
            name: companyName,
            currency: 'USD',
            accounts: {
              create: [
                { name: 'Cash', type: 'asset', balance: 0 },
                { name: 'Bank Account', type: 'asset', balance: 0 },
                { name: 'Accounts Receivable', type: 'asset', balance: 0 },
                { name: 'Inventory', type: 'asset', balance: 0 },
                { name: 'Accounts Payable', type: 'liability', balance: 0 },
                { name: 'Sales Revenue', type: 'revenue', balance: 0 },
                { name: 'Cost of Goods Sold', type: 'expense', balance: 0 },
                { name: 'Operating Expenses', type: 'expense', balance: 0 },
                { name: 'Inventory Loss', type: 'expense', balance: 0 },
                { name: 'Rent Expense', type: 'expense', balance: 0 },
                { name: 'Utilities Expense', type: 'expense', balance: 0 },
                { name: 'Salary Expense', type: 'expense', balance: 0 },
                { name: 'General Expense', type: 'expense', balance: 0 },
              ],
            },
          },
        },
      },
      include: { company: true },
    });

    // 2. Create a default location for the new company
    const location = await prisma.location.create({
      data: {
        companyId: user.companyId,
        name: companyName,
        isDefault: true,
        status: 'active',
      },
    });

    // 3. Grant the new user access to that default location
    await prisma.userLocationAccess.create({
      data: {
        userId: user.id,
        locationId: location.id,
      },
    });

    // 4. Return token + sanitized user
    const token = this.generateToken(user);
    return { user: this.sanitizeUser(user), token };
  }

  async login(data: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: { company: true },
    });
    if (!user) throw new Error('Invalid email or password');

    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) throw new Error('Invalid email or password');

    // Safety net: if the user somehow has no location access yet, grant them
    // access to the company's default location.
    const accessCount = await prisma.userLocationAccess.count({
      where: { userId: user.id },
    });
    if (accessCount === 0) {
      let defaultLoc = await prisma.location.findFirst({
        where: { companyId: user.companyId, isDefault: true },
      });
      if (!defaultLoc) {
        defaultLoc = await prisma.location.create({
          data: {
            companyId: user.companyId,
            name: user.company?.name || 'Main',
            isDefault: true,
            status: 'active',
          },
        });
      }
      await prisma.userLocationAccess.create({
        data: { userId: user.id, locationId: defaultLoc.id },
      });
    }

    const token = this.generateToken(user);
    return { user: this.sanitizeUser(user), token };
  }

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });
    if (!user) throw new Error('User not found');
    return this.sanitizeUser(user);
  }

  private generateToken(user: { id: string; email: string; role: string; companyId: string }) {
    return jwt.sign(
      { id: user.id, email: user.email, role: user.role, companyId: user.companyId },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );
  }

  private sanitizeUser(user: any) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      companyId: user.companyId,
      businessType: user.company?.businessType ?? null,
      currency: user.company?.currency ?? 'USD',
    };
  }
}