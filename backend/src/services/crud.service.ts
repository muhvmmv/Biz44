import { prisma } from '../lib/prisma';
import { notFound } from '../lib/errors';

type ScopedModel = 'customer' | 'supplier' | 'employee' | 'product';

/** Keep only the listed keys that are present in `body`. */
export function pick<T extends string>(body: any, fields: readonly T[]): Partial<Record<T, any>> {
  const out: Partial<Record<T, any>> = {};
  if (!body || typeof body !== 'object') return out;
  for (const f of fields) {
    if (body[f] !== undefined) out[f] = body[f];
  }
  return out;
}

/**
 * CRUD helper that is always scoped to one company. Every read, update and
 * delete checks `companyId`, so a record ID from another company returns
 * 404 instead of exposing or changing that company's data.
 */
export class CrudService {
  constructor(private modelName: ScopedModel) {}

  private get model(): any {
    return (prisma as any)[this.modelName];
  }

  findMany(companyId: string, opts: { orderBy?: any; include?: any } = {}) {
    return this.model.findMany({ where: { companyId }, ...opts });
  }

  async findOne(id: string, companyId: string, include?: any) {
    const record = await this.model.findFirst({ where: { id, companyId }, include });
    if (!record) throw notFound();
    return record;
  }

  create(companyId: string, data: Record<string, any>) {
    return this.model.create({ data: { ...data, companyId } });
  }

  async update(id: string, companyId: string, data: Record<string, any>) {
    await this.findOne(id, companyId);
    return this.model.update({ where: { id }, data });
  }

  async delete(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return this.model.delete({ where: { id } });
  }
}
