describe('redisOr', () => {
    let redisOr: typeof import('./redis-fail-open').redisOr;
    beforeEach(() => {
        jest.resetModules();
        redisOr = require('./redis-fail-open').redisOr;
    });
    afterEach(() => jest.useRealTimers());

    it('gibt das Ergebnis zurueck, solange Redis antwortet', async () => {
        expect(await redisOr(async () => 'x', 'fallback')).toBe('x');
    });

    it('nimmt bei Fehler den Fallback und fragt Redis 5 s nicht mehr', async () => {
        jest.useFakeTimers({ now: 1_000_000 });
        expect(await redisOr(async () => { throw new Error('timeout'); }, 'fallback')).toBe('fallback');
        const op = jest.fn(async () => 'x');
        expect(await redisOr(op, 'fallback')).toBe('fallback');
        expect(op).not.toHaveBeenCalled();
        jest.setSystemTime(1_000_000 + 5001);
        expect(await redisOr(op, 'fallback')).toBe('x');
    });
});
