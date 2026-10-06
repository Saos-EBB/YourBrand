import { tenantInfra } from './tenant-infra.helper';

describe('tenantInfra', () => {
    const env = { ...process.env };
    afterEach(() => { process.env = { ...env }; });

    it('leitet alle Namen aus dem Slug ab', () => {
        delete process.env.DB_NAME;
        delete process.env.S3_BUCKET;
        expect(tenantInfra('campus-match')).toEqual({
            database: 'yb_campus_match',
            bucket: 'campus-match-media',
            redisPrefix: 'campus-match:',
            queuePrefix: 'campus-match:bull',
        });
    });

    it('verschiedene Mandanten teilen sich nichts', () => {
        delete process.env.DB_NAME;
        delete process.env.S3_BUCKET;
        const a = tenantInfra('kiez');
        const b = tenantInfra('underground');
        for (const key of Object.keys(a) as (keyof typeof a)[]) expect(a[key]).not.toBe(b[key]);
    });

    it('explizites DB_NAME / S3_BUCKET gewinnt (default-Stack)', () => {
        process.env.DB_NAME = 'legacy_db';
        process.env.S3_BUCKET = 'yourbrand-media';
        const infra = tenantInfra('default');
        expect(infra.database).toBe('legacy_db');
        expect(infra.bucket).toBe('yourbrand-media');
        expect(infra.redisPrefix).toBe('default:');
    });
});
