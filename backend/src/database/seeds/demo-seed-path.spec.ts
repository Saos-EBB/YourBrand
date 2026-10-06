import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { demoSeedPath } from './demo-seed-path';

function seedDir(files: string[]): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenants-'));
    fs.mkdirSync(path.join(dir, 'set', 'seed'), { recursive: true });
    for (const f of files) fs.writeFileSync(path.join(dir, 'set', 'seed', f), 'users: []');
    return dir;
}

describe('demoSeedPath', () => {
    it('ohne "seed": mitgelieferte Dateien (default-Mandant)', () => {
        const dir = seedDir([]);
        expect(demoSeedPath('demo-users.yaml', undefined, dir)).toBe(path.join(__dirname, 'demo-users.yaml'));
        expect(demoSeedPath('demo-relations.yaml', undefined, dir)).toBe(path.join(__dirname, 'demo-relations.yaml'));
    });

    it('mit "seed": Dateien aus <TENANT_DIR>/<seed>/seed/', () => {
        const dir = seedDir(['demo-users.yaml', 'demo-relations.yaml']);
        expect(demoSeedPath('demo-users.yaml', 'set', dir)).toBe(path.join(dir, 'set', 'seed', 'demo-users.yaml'));
        expect(demoSeedPath('demo-relations.yaml', 'set', dir)).toBe(path.join(dir, 'set', 'seed', 'demo-relations.yaml'));
    });

    it('fehlende Relations -> null, nie die default-Datei (andere Nicknames)', () => {
        expect(demoSeedPath('demo-relations.yaml', 'set', seedDir(['demo-users.yaml']))).toBeNull();
    });

    it('fehlende Users -> Fehler (demo-full-reset wuerde sonst falsch loeschen)', () => {
        expect(() => demoSeedPath('demo-users.yaml', 'set', seedDir([]))).toThrow(/fehlt/);
    });
});

// Die eingecheckten Mandanten-Datensaetze muessen zu ihren Relations passen —
// sonst scheitert demo-relations-seed erst beim Container-Start.
describe('tenants/*/seed im Repo', () => {
    const tenantsDir = path.resolve(__dirname, '../../../../tenants');
    const sets = fs.readdirSync(tenantsDir).filter((d) => fs.existsSync(path.join(tenantsDir, d, 'seed', 'demo-users.yaml')));

    it.each(sets)('%s: alle Nicknames in demo-relations.yaml existieren', (set) => {
        const read = (f: string) => yaml.load(fs.readFileSync(path.join(tenantsDir, set, 'seed', f), 'utf8')) as Record<string, unknown[]>;
        const nicknames = new Set((read('demo-users.yaml').users as { nickname: string }[]).map((u) => u.nickname));
        const relations = JSON.stringify(read('demo-relations.yaml'));
        const keys = ['sender', 'receiver', 'user_a', 'user_b', 'initiator', 'target', 'winner', 'voter', 'user', 'blocker', 'blocked'];
        const referenced = [...relations.matchAll(new RegExp(`"(?:${keys.join('|')})":"([^"]+)"`, 'g'))].map((m) => m[1]);
        expect(referenced.filter((n) => !nicknames.has(n))).toEqual([]);
    });
});
