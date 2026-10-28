import * as os from 'os';
import * as path from 'path';
import Piscina from 'piscina';

let pool: Piscina | undefined;

function getPool(): Piscina {
    if (!pool) {
        // __filename ends in .ts under ts-node (start:dev/start:worker:dev),
        // .js once compiled (start:prod/start:worker) — same dual-mode
        // resolution TypeORM already uses for entities in this codebase
        // (entities: [__dirname + '/**/*.entity{.ts,.js}']). Piscina loads
        // worker files as real files (not through the app's own module
        // loader), so it needs ts-node registered in the worker thread too
        // when running the .ts variant.
        const isTs = __filename.endsWith('.ts');
        // Piscina nimmt sonst bis 1,5 × os.availableParallelism() Threads; im Container sind das die Kerne des
        // Hosts, also pro Instanz so viele bcrypt-Threads wie der ganze Rechner Kerne hat (Loadtest-Audit B15).
        // BCRYPT_MAX_THREADS = CPU-Kontingent der Instanz.
        const maxThreads = parseInt(process.env.BCRYPT_MAX_THREADS ?? '', 10) || os.availableParallelism();
        pool = new Piscina({
            minThreads: 1,
            maxThreads,
            filename: path.join(__dirname, isTs ? 'bcrypt.worker.ts' : 'bcrypt.worker.js'),
            execArgv: isTs ? ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register'] : [],
        });
    }
    return pool;
}

// 10 statt 12: ein Viertel der CPU pro Login (Loadtest: auth-Pool belegte ~1,6 Kerne fuer 0,5 % der Requests).
// OWASP-Minimum fuer bcrypt ist 10. Alte 12er-Hashes werden beim naechsten Login umgehasht (needsRehash).
export const BCRYPT_ROUNDS = 10;

export function needsRehash(hash: string): boolean {
    const rounds = Number(/^\$2[aby]\$(\d{2})\$/.exec(hash)?.[1]);
    return rounds !== BCRYPT_ROUNDS;
}

export function hashPassword(password: string, rounds: number): Promise<string> {
    return getPool().run({ password, rounds }, { name: 'hash' });
}

export function comparePassword(password: string, encrypted: string): Promise<boolean> {
    return getPool().run({ password, encrypted }, { name: 'compare' });
}
