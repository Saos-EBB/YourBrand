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
        pool = new Piscina({
            filename: path.join(__dirname, isTs ? 'bcrypt.worker.ts' : 'bcrypt.worker.js'),
            execArgv: isTs ? ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register'] : [],
        });
    }
    return pool;
}

export function hashPassword(password: string, rounds: number): Promise<string> {
    return getPool().run({ password, rounds }, { name: 'hash' });
}

export function comparePassword(password: string, encrypted: string): Promise<boolean> {
    return getPool().run({ password, encrypted }, { name: 'compare' });
}
