import { registerAs } from '@nestjs/config';
import { tenantInfra } from '../common/tenant/tenant-infra.helper';

export default registerAs('database', () => ({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    name: tenantInfra().database,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    // Default 10 = node-postgres' eigener Default, hier nur explizit gemacht.
    // DB_POOL_MAX erlaubt den Override pro Umgebung (der Loadtest-Stack setzt
    // ihn in docker-compose.loadtest.yml hoeher). Number(...) statt parseInt,
    // damit ein kaputter Wert (Tippfehler, leer) auf den Default faellt statt
    // als NaN im Pool zu landen.
    poolMax: Number(process.env.DB_POOL_MAX) || 10,
    // Zeitlimit pro Abfrage in ms. Je Instanz-Gruppe verschieden (Loadtest: schnelle Routen 2 s, schwere 10 s),
    // damit eine haengende Abfrage ihre Verbindung frueh freigibt. Default 5 s.
    statementTimeoutMs: Number(process.env.DB_STATEMENT_TIMEOUT_MS) || 5_000,
}));