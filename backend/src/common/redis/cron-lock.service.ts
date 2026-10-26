import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

// Nach dem Lauf: Sperre nur anfassen, wenn sie noch dieser Lauf haelt (nach MAX_RUN_MS kann sie schon ein anderer haben)
const RELEASE = `if redis.call('get', KEYS[1]) == ARGV[1] then
  if tonumber(ARGV[2]) > 0 then return redis.call('pexpire', KEYS[1], ARGV[2]) end
  return redis.call('del', KEYS[1])
end
return 0`;
// Laeuft ein Job laenger (oder stirbt die Instanz mittendrin), gibt die Sperre spaetestens dann frei
const MAX_RUN_MS = 10 * 60_000;

/**
 * Alle Instanzen planen die Crons, pro Termin fuehrt genau eine aus (Audit B3; vorher nur eine Instanz mit Crons, ohne
 * Ausfallschutz). Wer den Schluessel zuerst setzt, laeuft; er bleibt waehrend des Laufs stehen und danach bis
 * minGapMs nach dem Start — sonst liefe eine Instanz, deren Uhr ein paar Sekunden nachgeht, denselben Termin noch
 * einmal. minGapMs also kuerzer als das Intervall. Redis weg: der Lauf faellt aus.
 */
@Injectable()
export class CronLockService {
    private readonly logger = new Logger('CronLock');

    constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) { }

    async runOnce(name: string, minGapMs: number, fn: () => Promise<void>): Promise<void> {
        const key = `cron:${name}`;
        const token = randomUUID();
        try {
            if (!(await this.redis.set(key, token, 'PX', MAX_RUN_MS, 'NX'))) return;
        } catch (err) {
            this.logger.warn(`${name}: Redis nicht erreichbar, Lauf ausgelassen (${(err as Error).message})`);
            return;
        }
        const start = Date.now();
        try {
            await fn();
        } finally {
            await this.redis.eval(RELEASE, 1, key, token, Math.max(0, minGapMs - (Date.now() - start)))
                .catch(() => undefined);
        }
    }
}
