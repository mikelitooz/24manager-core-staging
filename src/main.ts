import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Middleware
  app.use((cookieParser as any)());
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  // Global Prefix for API
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`🚀 SaaS Core is running on: http://localhost:${port}/api`);
  logger.log(`📊 Admin Dashboard available at: http://localhost:${port}/admin`);
}
bootstrap();
