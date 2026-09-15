import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { getCorsOrigins } from './common/config/cors-origins.helper';

async function bootstrap() {
  if (!process.env.CORS_ORIGIN) throw new Error('CORS_ORIGIN env var is not set');
  const corsOrigin = getCorsOrigins('http://localhost:3001');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  app.use(cookieParser());
  app.use(helmet());

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    // ngrok-skip-browser-warning: ngrok Free zeigt sonst eine HTML-Warnseite
    // vor jedem GET, wenn dieser Header fehlt — bricht sonst jeden Fetch/WS-
    // Handshake vom Frontend gegen den ngrok-Tunnel.
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  });

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // /health bleibt unprefixed erreichbar (ngrok-Smoketest per curl auf den
  // Tunnel-Port, ohne den /api/v1-Umweg) — der Railway-Healthcheck unter
  // /api/v1 (AppController-Root-Route) ist davon unberuehrt.
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  await app.getHttpAdapter().getInstance().set('trust proxy', 1);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
