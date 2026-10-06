import { tenantSecretErrors } from './tenant-secrets';

const valid = {
    JWT_SECRET: 'a'.repeat(64),
    EMAIL_SALT: 'b'.repeat(32),
    APP_ENCRYPTION_KEY: 'c'.repeat(64),
};

describe('tenantSecretErrors', () => {
    it('gueltige generierte Secrets', () => {
        expect(tenantSecretErrors(valid)).toEqual([]);
    });

    it('meldet fehlende Secrets alle auf einmal', () => {
        expect(tenantSecretErrors({})).toHaveLength(3);
    });

    it('APP_ENCRYPTION_KEY muss 32 Byte Hex sein', () => {
        expect(tenantSecretErrors({ ...valid, APP_ENCRYPTION_KEY: 'your-64-char-hex-encryption-key' })).toEqual([
            'APP_ENCRYPTION_KEY muss 64 Hex-Zeichen haben (32 Byte)',
        ]);
    });

    it('zu kurzes JWT_SECRET', () => {
        expect(tenantSecretErrors({ ...valid, JWT_SECRET: 'kurz' })).toHaveLength(1);
    });
});
