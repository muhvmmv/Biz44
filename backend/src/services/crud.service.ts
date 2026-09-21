import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class CrudService<T extends keyof PrismaClient> {
  private model: PrismaClient[T];

  constructor(modelName: T) {
    this.model = prisma[modelName];
  }

  async findMany(where?: any, include?: any) {
    return (this.model as any).findMany({ where, include });
  }

  async findById(id: string, include?: any) {
    return (this.model as any).findUnique({ where: { id }, include });
  }

  async create(data: any) {
    return (this.model as any).create({ data });
  }

  async update(id: string, data: any) {
    return (this.model as any).update({ where: { id }, data });
  }

  async delete(id: string) {
    return (this.model as any).delete({ where: { id } });
  }
}