import * as fs from 'fs';
import * as path from 'path';
import { loadTenantConfig, tenantDir } from '../../common/tenant/tenant-config.loader';

export type DemoSeedFile = 'demo-users.yaml' | 'demo-relations.yaml';

/**
 * Demo-Datensatz pro Mandant. tenant.json "seed": "<name>" ->
 * <TENANT_DIR>/<name>/seed/<datei>; ohne "seed" die mitgelieferten Dateien
 * neben diesem Skript (default-Mandant, 45 kuratierte User).
 *
 * demo-users.yaml muss im Mandanten-Datensatz existieren (Fehler, sonst
 * wuerde demo-full-reset gegen die falsche Liste loeschen). Fehlt
 * demo-relations.yaml, gibt es keine Relations (null) — die mitgelieferten
 * passen nicht, sie verweisen auf die default-Nicknames.
 */
export function demoSeedPath(
    file: DemoSeedFile,
    seed: string | undefined = loadTenantConfig().seed,
    dir: string = tenantDir(),
): string | null {
    if (!seed) return path.join(__dirname, file);

    const tenantFile = path.join(dir, seed, 'seed', file);
    if (fs.existsSync(tenantFile)) return tenantFile;
    if (file === 'demo-users.yaml') {
        throw new Error(`Seed "${seed}": ${tenantFile} fehlt`);
    }
    return null;
}
