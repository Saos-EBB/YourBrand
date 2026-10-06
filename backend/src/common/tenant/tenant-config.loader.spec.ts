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
});

describe('parseTenantConfig', () => {
    it('loest Tier-Defaults auf', () => {
        const config = parseTenantConfig(valid(), 'kiez');
        expect(config.modules).toEqual({ chat: true, matching: false, payments: true, hidden: false });
    });

    it('Overrides in "modules" schlagen die Tier-Defaults', () => {
        const config = parseTenantConfig({ ...valid(), modules: { matching: true, payments: false } }, 'kiez');
        expect(config.modules).toEqual({ chat: true, matching: true, payments: false, hidden: false });
    });

    it('premium schaltet alle Module an', () => {
        const config = parseTenantConfig({ ...valid(), tier: 'premium' }, 'kiez');
        expect(Object.values(config.modules).every(Boolean)).toBe(true);
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

    it('oeffentliche Config enthaelt kein seed', () => {
        expect(toPublicTenantConfig(parseTenantConfig(valid(), 'kiez'))).not.toHaveProperty('seed');
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
