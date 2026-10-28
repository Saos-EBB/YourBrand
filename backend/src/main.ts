import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { getCorsOrigins } from './common/config/cors-origins.helper';
import { describeTenantInfra } from './common/tenant/tenant-infra.helper';
import { RedisIoAdapter } from './common/realtime/redis-io.adapter';
import { loadShed } from './common/load-shed/load-shed.middleware';

async function bootstrap() {
  if (!process.env.CORS_ORIGIN) throw new Error('CORS_ORIGIN env var is not set');
  const corsOrigin = getCorsOrigins('http://localhost:3001');

  // Ohne debug/verbose: der Exception-Filter loggt erwartbare 4xx auf debug (Loadtest-Audit B11).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: ['fatal', 'error', 'warn', 'log'],
  });

  // Request-ID: von nginx uebernehmen (X-Request-Id) oder neu vergeben, in jeder Fehlerzeile und in der Antwort.
  // Nur kurze, harmlose IDs uebernehmen, damit niemand ueber den Header ins Log schreibt.
  app.use((req: any, res: any, next: () => void) => {
    const given = req.headers['x-request-id'];
    const id = typeof given === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(given) ? given : randomUUID();
    req.headers['x-request-id'] = id;
    res.setHeader('X-Request-Id', id);
    next();
  });

  app.use(loadShed());

  app.use(cookieParser());

  // helmet setzt per Default Cross-Origin-Resource-Policy: same-origin. Lokal
  // faellt das nicht auf (Frontend und /uploads liegen beide auf localhost),
  // im Split-Deploy schon: liegt das Frontend auf einer anderen Domain als das
  // Backend, blockt der Browser damit jedes Profilbild und jede Audiodatei aus
  // /uploads — sichtbar nur als leeres <img>, die Requests selbst sind 200.
  // CORS erlaubt das nicht mit, CORP ist eine eigene Entscheidung.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const ioAdapter = new RedisIoAdapter(app);
  ioAdapter.connectToRedis();
  app.useWebSocketAdapter(ioAdapter);

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // /health bleibt unprefixed erreichbar (Alive-Check fuer curl und den
  // Frontend-Offline-Fallback, ohne den /api/v1-Umweg) — der Status unter
  // /api/v1 (AppController.getStatus) ist davon unberuehrt.
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }, { path: 'ready', method: RequestMethod.GET }],
  });

  // SIGTERM (docker stop, Deploy) schliesst den Server sauber: keine neuen Verbindungen, laufende Requests
  // werden fertig. Vorher ignorierte node als PID 1 das Signal und wurde nach 10 s hart beendet.
  // Ab dem Signal bekommt jede Antwort "Connection: close": sonst schickt der Proxy ueber seine Keep-Alive-
  // Verbindungen weiter Requests, die Verbindungen werden nie frei und close() wartet bis zum harten Kill.
  let shuttingDown = false;
  process.once('SIGTERM', () => { shuttingDown = true; });
  app.use((_req: unknown, res: { setHeader(k: string, v: string): void }, next: () => void) => {
    if (shuttingDown) res.setHeader('Connection', 'close');
    next();
  });
  app.enableShutdownHooks();

  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  await app.getHttpAdapter().getInstance().set('trust proxy', 1);

  await app.listen(process.env.PORT ?? 3000);
  // Laenger als jeder Proxy davor seine Keep-Alive-Verbindungen offen haelt (nginx im Loadtest: 4 s,
  // typische Cloud-LBs: 60 s), sonst schliesst Node eine Verbindung, die der Proxy gerade benutzt → 502.
  const server = app.getHttpServer();
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  new Logger('Tenant').log(describeTenantInfra());
}
bootstrap();
