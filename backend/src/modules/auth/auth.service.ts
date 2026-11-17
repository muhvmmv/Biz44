import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { eraseCompany } from '../../lib/companyErase';
import { env } from '../../config/env';
import { DEFAULT_ACCOUNT_KEYS, SYSTEM_ACCOUNTS } from '../../lib/ledger';

import { prisma } from '../../lib/prisma';
import { AppError, badRequest } from '../../lib/errors';
import { permissionsFor } from '../../lib/permissions';

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
  async register(input: RegisterInput) {
    const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const data = {
      firstName: clean(input.firstName),
      lastName: clean(input.lastName),
      email: clean(input.email).toLowerCase(),
      password: typeof input.password === 'string' ? input.password : '',
      company: clean(input.company) || undefined,
    };
    if (!data.firstName || !data.lastName) throw badRequest('Enter your first and last name');
    if (data.firstName.length > 80 || data.lastName.length > 80) throw badRequest('Name is too long');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw badRequest('Enter a valid email address');
    if (data.password.length < 8) throw badRequest('The password must be at least 8 characters');
    if (data.company && data.company.length > 120) throw badRequest('Company name is too long');
    const existing = await prisma.user.findFirst({ where: { email: { equals: data.email, mode: 'insensitive' } } });
    if (existing) throw badRequest('An account with this email already exists. Sign in instead.');

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
            // New companies start on the double-entry ledger with no opening balances.
            ledgerStartedAt: new Date(),
            accounts: {
              create: [
                ...DEFAULT_ACCOUNT_KEYS.map((key) => {
                  const def = SYSTEM_ACCOUNTS[key];
                  return {
                    name: def.name,
                    type: def.type,
                    code: def.code,
                    subtype: (def as any).subtype ?? null,
                    systemKey: key,
                    balance: 0,
                  };
                }),
                { name: 'Bank Account', type: 'asset', subtype: 'bank', code: '1010', balance: 0 },
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
    const email = typeof data.email === 'string' ? data.email.trim() : '';
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      include: { company: true },
    });
    if (!user) throw new AppError(401, 'Incorrect email or password');

    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) throw new AppError(401, 'Incorrect email or password');
    if (!user.isActive) throw new AppError(403, 'This account has been deactivated. Ask your administrator.');

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

  async updateProfile(userId: string, data: { firstName?: unknown; lastName?: unknown }) {
    const clean = (v: unknown, label: string) => {
      if (v === undefined) return undefined;
      const t = typeof v === 'string' ? v.trim() : '';
      if (!t) throw badRequest(`${label} is required`);
      if (t.length > 80) throw badRequest(`${label} is too long`);
      return t;
    };
    const user = await prisma.user.update({
      where: { id: userId },
      data: { firstName: clean(data.firstName, 'First name'), lastName: clean(data.lastName, 'Last name') },
      include: { company: true },
    });
    return this.sanitizeUser(user);
  }

  async changePassword(userId: string, currentPassword: unknown, newPassword: unknown) {
    if (typeof currentPassword !== 'string' || !currentPassword) throw badRequest('Enter your current password');
    if (typeof newPassword !== 'string' || newPassword.length < 8) throw badRequest('The new password must be at least 8 characters');
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw badRequest('User not found');
    if (!(await bcrypt.compare(currentPassword, user.password))) throw badRequest('Your current password is not correct');
    if (await bcrypt.compare(newPassword, user.password)) throw badRequest('Choose a password different from the current one');
    await prisma.user.update({ where: { id: userId }, data: { password: await bcrypt.hash(newPassword, 12) } });
  }

  /**
   * Delete the signed-in person's account.
   *  - Their name, email and password are erased and they can no longer sign
   *    in. Invoices, payments and other records they made stay with the
   *    company (the books must not change), now shown as "Deleted user".
   *  - With deleteCompany (administrators only), the whole company and all of
   *    its records are removed for good.
   */
  async deleteAccount(userId: string, body: { password?: unknown; deleteCompany?: unknown; companyName?: unknown }) {
    if (typeof body.password !== 'string' || !body.password) throw badRequest('Enter your password to confirm');
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { company: true } });
    if (!user || user.deletedAt) throw new AppError(404, 'Account not found');
    if (!(await bcrypt.compare(body.password, user.password))) throw badRequest('Your password is not correct');

    const others = { companyId: user.companyId, isActive: true, deletedAt: null, id: { not: user.id } };

    if (body.deleteCompany === true) {
      if (user.role !== 'admin') throw new AppError(403, 'Only an administrator can delete the company');
      const typed = typeof body.companyName === 'string' ? body.companyName.trim().toLowerCase() : '';
      if (typed !== user.company.name.trim().toLowerCase()) {
        throw badRequest('Type the company name exactly as shown to confirm');
      }
      await prisma.$transaction((tx) => eraseCompany(tx, user.companyId), { timeout: 120_000 });
      return { deleted: 'company' as const };
    }

    const [othersActive, otherAdmins] = await Promise.all([
      prisma.user.count({ where: others }),
      prisma.user.count({ where: { ...others, role: 'admin' } }),
    ]);
    if (othersActive === 0) {
      throw badRequest(`You are the only person using ${user.company.name}. To delete your account, delete the company.`);
    }
    if (user.role === 'admin' && otherAdmins === 0) {
      throw badRequest('You are the only administrator. Make another team member an administrator first (Settings → Team), or delete the company.');
    }

    await prisma.$transaction([
      prisma.userLocationAccess.deleteMany({ where: { userId: user.id } }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          firstName: 'Deleted',
          lastName: 'user',
          email: `deleted-${user.id}@deleted.invalid`,
          password: await bcrypt.hash(randomBytes(32).toString('hex'), 12),
          isActive: false,
          deletedAt: new Date(),
        },
      }),
    ]);
    return { deleted: 'user' as const };
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
      companyName: user.company?.name ?? null,
      currency: user.company?.currency ?? 'USD',
      permissions: permissionsFor(user.role),
    };
  }
}