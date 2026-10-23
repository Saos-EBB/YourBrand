// Fail-open fuer Redis-Zugriffe, die nur Cache oder Zaehler sind. Scheitert ein Befehl (Timeout, Verbindung weg),
// wird Redis fuer 5 s in diesem Prozess uebersprungen und sofort der Fallback genommen; sonst kostete jeder
// Request bei haengendem Redis einen commandTimeout pro Befehl (vorher 3 x 500 ms = 1,5 s).
const SKIP_MS = 5000;
let skipUntil = 0;

export async function redisOr<T>(op: () => Promise<T>, fallback: T): Promise<T> {
    if (Date.now() < skipUntil) return fallback;
    try {
        return await op();
    } catch {
        skipUntil = Date.now() + SKIP_MS;
        return fallback;
    }
}
