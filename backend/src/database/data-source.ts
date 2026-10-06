import 'dotenv/config';
import { DataSource } from 'typeorm';
import { tenantInfra } from '../common/tenant/tenant-infra.helper';

export const AppDataSource = new DataSource({
    type: 'postgres',
    host:     process.env.DB_HOST     ?? 'localhost',
    port:     parseInt(process.env.DB_PORT ?? '5432', 10),
    database: tenantInfra().database,
    username: process.env.DB_USER     ?? '',
    password: process.env.DB_PASSWORD ?? '',
    entities:   ['src/**/*.entity.ts'],
    migrations: ['src/database/migrations/*.ts'],
    migrationsTableName: 'typeorm_migrations',
    extra: { options: '-c client_encoding=UTF8' },
});
