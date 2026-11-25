import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';
import { PrismaExceptionFilter } from './common/prisma-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Todas as rotas ficam sob /api: na Vercel, o rewrite "/api/(.*)" envia a requisição
  // para este serviço SEM remover o prefixo (GET /api/clients chega como /api/clients).
  app.setGlobalPrefix('api');

  // Fecha as conexões do Prisma ao receber SIGTERM/SIGINT (deploy, escala ou parada)
  app.enableShutdownHooks();

  // Erros do banco viram 404/409/503 limpos em vez de 500
  app.useGlobalFilters(new PrismaExceptionFilter());

  // Atrás do proxy da Vercel: o IP real do cliente vem em X-Forwarded-For (limite de login por IP)
  app.getHttpAdapter().getInstance().set('trust proxy', true);

  // Habilita validação global de DTOs e transformação de tipos
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // CORS: em produção front e back estão no mesmo domínio (não é necessário).
  // Em dev o Next (porta 3000) chama a API (porta 3001). CORS_ORIGIN restringe as origens, se definido.
  app.enableCors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) : true,
  });

  // A Vercel define PORT; app.listen() é obrigatório para o runtime NestJS da Vercel.
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 API rodando em http://localhost:${port}/api`);
}

bootstrap();
