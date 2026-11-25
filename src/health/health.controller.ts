import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Public } from '../auth/decorators/public.decorator.js';

const DB_TIMEOUT_MS = 3000;

/**
 * GET /api/health: testa o banco com SELECT 1.
 * 200 "healthy" com uptime; 503 se o banco falhar ou demorar mais de 3 s (ex.: pool esgotado).
 * O timeout responde rápido e o processo continua de pé.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    const started = Date.now();
    try {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`sem resposta do banco em ${DB_TIMEOUT_MS} ms`)), DB_TIMEOUT_MS);
        }),
      ]).finally(() => clearTimeout(timer));

      return {
        status: 'healthy',
        uptime: Math.round(process.uptime()),
        database: { status: 'up', latencyMs: Date.now() - started },
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      throw new HttpException(
        {
          status: 'unhealthy',
          uptime: Math.round(process.uptime()),
          database: { status: 'down', error: err instanceof Error ? err.message.split('\n')[0].slice(0, 200) : 'erro desconhecido' },
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
