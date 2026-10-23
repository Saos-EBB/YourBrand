import { timingSafeEqual } from 'crypto';

// Loadtest-Handshake: Der Loadtest-Modus gilt nur fuer Requests, die den richtigen Schluessel mitbringen.
// Beide Seiten muessen ihn kennen: das Backend ueber LOADTEST_MODE=true + LOADTEST_KEY (mind. 32 Zeichen),
// der Lastgenerator schickt ihn im Header X-Loadtest-Key. Fehlt eins davon oder passt der Schluessel nicht,
// laeuft der Request ganz normal (Rate-Limits, 15-min-Tokens, kein Test-Kauf).
//
// Was ein passender Request bekommt:
//   - kein Throttling (globales 100/60s und das Login-Limit), siehe app.module.ts
//   - beim Login ein Access-Token mit LOADTEST_TOKEN_TTL_S Sekunden Laufzeit (Default 12 h), siehe auth.service.ts
//   - Zugriff auf POST /hidden/coin/test-purchase, siehe coin-test-purchase.controller.ts

export const LOADTEST_HEADER = 'x-loadtest-key';

const MIN_KEY_LENGTH = 32;

export function loadtestEnabled(): boolean {
    return process.env.LOADTEST_MODE === 'true' && (process.env.LOADTEST_KEY ?? '').length >= MIN_KEY_LENGTH;
}

export function isLoadtestRequest(req: { headers?: Record<string, string | string[] | undefined> } | undefined): boolean {
    if (!loadtestEnabled()) return false;
    const sent = req?.headers?.[LOADTEST_HEADER];
    if (typeof sent !== 'string') return false;
    const a = Buffer.from(sent);
    const b = Buffer.from(process.env.LOADTEST_KEY as string);
    return a.length === b.length && timingSafeEqual(a, b);
}

export function loadtestTokenTtlSeconds(): number {
    const n = Number(process.env.LOADTEST_TOKEN_TTL_S);
    return Number.isFinite(n) && n > 0 ? n : 12 * 60 * 60;
}
