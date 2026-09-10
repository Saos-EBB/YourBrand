import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(WorkerModule);
    app.enableShutdownHooks();
    new Logger('Worker').log('Worker gestartet — verbunden mit DB und Redis, wartet auf Jobs.');
}

bootstrap();
