import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Habilita validação global de DTOs e transformação de tipos
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Habilita CORS para quando conectarmos o Front-End Next.js
  app.enableCors();

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Servidor rodando na porta http://localhost:${port}`);
}

bootstrap();
