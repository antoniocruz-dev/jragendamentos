import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Traduz erros do Prisma em respostas HTTP limpas, sem derrubar o processo:
 * - P2002 (único violado, ex.: duas requisições simultâneas) → 409
 * - P2025 (registro não encontrado) → 404
 * - P2024 (pool de conexões esgotado) e falha de conexão → 503
 */
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientInitializationError, Prisma.PrismaClientRustPanicError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Prisma');

  catch(exception: Error, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<{ status(code: number): { json(body: unknown): void } }>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Erro inesperado no banco de dados.';

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          message = 'Registro duplicado: já existe um cadastro com esses dados.';
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Registro não encontrado.';
          break;
        case 'P2024':
        case 'P1001':
        case 'P1002':
        case 'P1017':
          status = HttpStatus.SERVICE_UNAVAILABLE;
          message = 'Banco de dados indisponível no momento. Tente novamente em instantes.';
          break;
      }
    } else {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = 'Banco de dados indisponível no momento. Tente novamente em instantes.';
    }

    if (status >= 500) this.logger.error(exception.message);
    res.status(status).json({ statusCode: status, message });
  }
}
