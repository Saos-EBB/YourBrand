import * as fs from 'fs';
import * as path from 'path';
import { parseTenantConfig, toPublicTenantConfig } from './tenant-config.loader';

const valid = () => ({
    slug: 'kiez',
    brand: { name: 'KiezConnect', logo: 'logo.svg' },
    theme: { default: 'light', tokens: { '--color-primary-fixed-dim': '#E4572E' } },
    locale: { default: 'de', available: ['de', 'en'] },
    tier: 'core',
    legal: { name: 'Max Muster', address: 'Musterstr. 1, 12345 Musterstadt', email: 'kontakt@example.com' },
    seed: 'kiez',
    seedAgeDays: 30,
});

describe('parseTenantConfig', () => {
    it('loest Tier-Defaults auf', () => {
        const config = parseTenantConfig(valid(), 'kiez');
        expect(config.modules).toEqual({
            chat: true, matching: false, payments: true, hidden: false, board: false, caretaker: false, orgs: false,
        });
    });

    it('Overrides in "modules" schlagen die Tier-Defaults', () => {
        const config = parseTenantConfig({ ...valid(), modules: { matching: true, payments: false } }, 'kiez');
        expect(config.modules).toEqual({
            chat: true, matching: true, payments: false, hidden: false, board: false, caretaker: false, orgs: false,
        });
    });

    it('premium schaltet die Tier-Module an, board/caretaker/orgs bleiben opt-in', () => {
        const { modules } = parseTenantConfig({ ...valid(), tier: 'premium' }, 'kiez');
        expect([modules.chat, modules.matching, modules.payments, modules.hidden]).toEqual([true, true, true, true]);
        expect([modules.board, modules.caretaker, modules.orgs]).toEqual([false, false, false]);
    });

    it('board braucht chat, orgs braucht caretaker', () => {
        expect(() => parseTenantConfig({ ...valid(), modules: { board: true, chat: false } }, 'kiez'))
            .toThrow(/board erfordert modules.chat/);
        expect(() => parseTenantConfig({ ...valid(), modules: { orgs: true } }, 'kiez'))
            .toThrow(/orgs erfordert modules.caretaker/);
        const ok = parseTenantConfig({ ...valid(), modules: { caretaker: true, orgs: true } }, 'kiez');
        expect([ok.modules.caretaker, ok.modules.orgs]).toEqual([true, true]);
    });

    it('Layout: ohne Angabe die Werte des default-Mandanten', () => {
        const { theme } = parseTenantConfig(valid(), 'kiez');
        expect(theme.layout).toEqual({ nav: 'sidebar', font: 'jakarta', textScale: 1, assist: false, labels: {} });
        expect(theme.dark).toEqual({});
        expect(theme.light).toEqual({});
    });

    it('Layout: nur bekannte Werte, Menuenamen nur fuer bekannte Punkte und Sprachen', () => {
        const withLayout = (layout: object) => ({ ...valid(), theme: { default: 'light', layout } });
        const ok = parseTenantConfig(withLayout({
            nav: 'topbar', font: 'archivo', radius: 'sm', textScale: 1.125, assist: true,
            labels: { dashboard: 'Kiez', board: { de: 'Brett', en: 'Board' } },
        }), 'kiez');
        expect(ok.theme.layout.labels.board).toEqual({ de: 'Brett', en: 'Board' });
        expect(() => parseTenantConfig(withLayout({ nav: 'hamburger' }), 'kiez')).toThrow(/layout.nav/);
        expect(() => parseTenantConfig(withLayout({ font: 'comic-sans' }), 'kiez')).toThrow(/layout.font/);
        expect(() => parseTenantConfig(withLayout({ textScale: 3 }), 'kiez')).toThrow(/textScale/);
        expect(() => parseTenantConfig(withLayout({ labels: { kitchen: 'X' } }), 'kiez')).toThrow(/unbekannter Menuepunkt/);
        expect(() => parseTenantConfig(withLayout({ labels: { chat: { xx: 'X' } } }), 'kiez')).toThrow(/unbekannte Sprache/);
        expect(() => parseTenantConfig(withLayout({ labels: { chat: 'x'.repeat(30) } }), 'kiez')).toThrow(/1-24 Zeichen/);
    });

    it('Modus-Tokens (dark/light) werden wie tokens geprueft', () => {
        const raw = { ...valid(), theme: { default: 'dark', dark: { '--color-error': 'url(x)' }, light: { color: '#fff' } } };
        const message = (() => { try { parseTenantConfig(raw, 'kiez'); return ''; } catch (e) { return (e as Error).message; } })();
        expect(message).toMatch(/theme.dark.--color-error/);
        expect(message).toMatch(/theme.light: Key "color"/);
    });

    it('lehnt unbekannte Keys ab (Tippfehler bricht den Boot)', () => {
        expect(() => parseTenantConfig({ ...valid(), modlues: {} }, 'kiez')).toThrow(/modlues/);
        expect(() => parseTenantConfig({ ...valid(), modules: { video: true } }, 'kiez')).toThrow(/video/);
    });

    it('matching ohne chat ist ungueltig', () => {
        const raw = { ...valid(), modules: { matching: true, chat: false } };
        expect(() => parseTenantConfig(raw, 'kiez')).toThrow(/matching erfordert modules.chat/);
    });

    it('lehnt unbekannten Tier ab', () => {
        expect(() => parseTenantConfig({ ...valid(), tier: 'gold' }, 'kiez')).toThrow(/tier/);
    });

    it('slug muss zum Ordnernamen passen', () => {
        expect(() => parseTenantConfig(valid(), 'campus')).toThrow(/Ordnernamen/);
    });

    it('locale.default muss in available stehen', () => {
        const raw = { ...valid(), locale: { default: 'fr', available: ['de'] } };
        expect(() => parseTenantConfig(raw, 'kiez')).toThrow(/locale.default/);
    });

    it('Theme-Tokens: nur --color-* mit Hex-Wert (keine CSS-Injection)', () => {
        const badKey = { ...valid(), theme: { default: 'dark', tokens: { 'background': '#000' } } };
        const badValue = { ...valid(), theme: { default: 'dark', tokens: { '--color-error': 'red;}body{display:none' } } };
        expect(() => parseTenantConfig(badKey, 'kiez')).toThrow(/--color-/);
        expect(() => parseTenantConfig(badValue, 'kiez')).toThrow(/Hex-Farbe/);
    });

    it('Asset-Namen ohne Pfad', () => {
        const raw = { ...valid(), brand: { name: 'X', logo: '../../etc/passwd' } };
        expect(() => parseTenantConfig(raw, 'kiez')).toThrow(/brand.logo/);
    });

    it('meldet alle Fehler auf einmal', () => {
        const raw = { ...valid(), tier: 'gold', legal: { name: '', address: 'x', email: 'kein-mail' } };
        const message = (() => { try { parseTenantConfig(raw, 'kiez'); return ''; } catch (e) { return (e as Error).message; } })();
        expect(message).toMatch(/tier/);
        expect(message).toMatch(/legal.name/);
        expect(message).toMatch(/legal.email/);
    });

    it('oeffentliche Config enthaelt kein seed / seedAgeDays', () => {
        const publicConfig = toPublicTenantConfig(parseTenantConfig(valid(), 'kiez'));
        expect(publicConfig).not.toHaveProperty('seed');
        expect(publicConfig).not.toHaveProperty('seedAgeDays');
    });

    it('lehnt seedAgeDays ab, das keine positive Ganzzahl ist', () => {
        expect(() => parseTenantConfig({ ...valid(), seedAgeDays: 0 }, 'kiez')).toThrow(/seedAgeDays/);
        expect(() => parseTenantConfig({ ...valid(), seedAgeDays: 1.5 }, 'kiez')).toThrow(/seedAgeDays/);
    });
});

// Die eingecheckten Configs muessen gueltig sein — sonst merkt man es erst
// beim Container-Start.
describe('tenants/*/tenant.json im Repo', () => {
    const dir = path.resolve(__dirname, '../../../../tenants');
    const slugs = fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'tenant.json')));

    it('es gibt mindestens den default-Mandanten', () => {
        expect(slugs).toContain('default');
    });

    it.each(slugs.filter((s) => !s.startsWith('_')))('%s ist gueltig', (slug) => {
        const raw: unknown = JSON.parse(fs.readFileSync(path.join(dir, slug, 'tenant.json'), 'utf8'));
        expect(() => parseTenantConfig(raw, slug)).not.toThrow();
    });

    it('_template ist bis auf den Slug gueltig', () => {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, '_template', 'tenant.json'), 'utf8')) as { slug: string };
        expect(() => parseTenantConfig(raw, raw.slug)).not.toThrow();
    });
});
