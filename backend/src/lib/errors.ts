/**
 * An error with an HTTP status that is safe to show to the user.
 * Throw it from routes or inside prisma.$transaction callbacks; the
 * global error handler turns it into a JSON response with that status.
 */
export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string) => new AppError(400, message);
export const notFound = (message = 'Not found') => new AppError(404, message);
