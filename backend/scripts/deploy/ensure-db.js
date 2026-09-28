'use strict';
//
// Boot-Guard fuer Deployments ohne persistentes Postgres-Volume (Railway).
//
// Zwei Dinge, die lokal docker-compose uebernimmt und dort deshalb fehlen:
//
// 1. Warten auf die DB. Compose kann das ueber `depends_on: condition:
//    service_healthy`, Railway kennt keine Service-Abhaengigkeiten — der
//    Backend-Container startet parallel zum Postgres-Container, und der
//    private DNS-Name (*.railway.internal) loest erst ein paar Sekunden
//    nach Containerstart auf. Ohne Retry crasht der erste Boot.
//
// 2. Schema anlegen. db/Dockerfile legt migrations/001_baseline.sql nach
//    /docker-entrypoint-initdb.d/ — Postgres fuehrt das aber NUR auf einem
//    leeren Datenverzeichnis aus. Haengt an der DB ein Volume, das schon
//    Daten hat (oder zeigt DB_HOST auf eine fremde Postgres-Instanz), wird
//    das Schema nie angelegt und alle Seeds laufen gegen leere Relationen.
//    Deshalb hier: existiert public.users nicht, wird migrations/001_baseline.sql
//    eingespielt. Ist die Tabelle da, passiert nichts (idempotent).
//
// Bewusst plain JS mit `pg` statt ts-node/TypeORM: laeuft vor dem Build-
// Output und braucht keine Entity-Metadaten.
//
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const RETRIES = 30;
const RETRY_DELAY_MS = 2000;
const SCHEMA_FILE = path.join(__dirname, '..', '..', 'migrations', '001_baseline.sql');

const config = {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    database: process.env.DB_NAME ?? '',
    user: process.env.DB_USER ?? '',
    password: process.env.DB_PASSWORD ?? '',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// migrations/001_baseline.sql ist ein pg_dump und enthaelt `CREATE SCHEMA tiger;` /
// `tiger_data` / `topology` ohne IF NOT EXISTS. Ueber die Init-Schiene des
// DB-Images stoert das nicht: dort laeuft 000_schema.sql alphabetisch VOR dem
// PostGIS-eigenen Init-Skript, die Schemas existieren also noch nicht.
// Hier laeuft es umgekehrt — die DB ist zu diesem Zeitpunkt schon von PostGIS
// initialisiert und der Import wuerde an "schema tiger already exists"
// abbrechen. Die Extensions im Dump haben IF NOT EXISTS bereits, nur die drei
// CREATE SCHEMA nicht. Bewusst hier statt in der Baseline-Datei selbst, damit
// sie ein unveraenderter pg_dump-Output bleibt (siehe Kommentar in
// db/Dockerfile: wird bei Schemaaenderungen komplett neu erzeugt, ein Patch
// waere weg).
function loadSchema() {
    return fs
        .readFileSync(SCHEMA_FILE, 'utf8')
        .replace(/^CREATE SCHEMA (?!IF NOT EXISTS)/gm, 'CREATE SCHEMA IF NOT EXISTS ');
}

async function connectWithRetry() {
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
        const client = new Client(config);
        try {
            await client.connect();
            console.log(`[ensure-db] DB erreichbar (Versuch ${attempt})`);
            return client;
        } catch (err) {
            // end() aufraeumen, sonst haelt der fehlgeschlagene Client den
            // Event-Loop offen und der Prozess terminiert am Ende nicht.
            await client.end().catch(() => {});
            if (attempt === RETRIES) throw err;
            console.log(`[ensure-db] DB noch nicht bereit (${err.code ?? err.message}) — Versuch ${attempt}/${RETRIES}`);
            await sleep(RETRY_DELAY_MS);
        }
    }
}

async function main() {
    const client = await connectWithRetry();
    try {
        const { rows } = await client.query(`SELECT to_regclass('public.users') AS tbl`);
        if (rows[0].tbl) {
            console.log('[ensure-db] Schema vorhanden — nichts zu tun');
            return;
        }
        console.log('[ensure-db] public.users fehlt — spiele migrations/001_baseline.sql ein');
        await client.query(loadSchema());
        console.log('[ensure-db] Schema eingespielt');
    } finally {
        await client.end();
    }
}

main().catch((err) => {
    console.error('[ensure-db] FEHLER:', err.message);
    process.exit(1);
});
