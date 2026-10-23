import { isLoadtestRequest, loadtestTokenTtlSeconds } from './loadtest-key';

describe('loadtest-key', () => {
    const KEY = 'k'.repeat(40);
    const env = { ...process.env };
    const req = (key?: string) => ({ headers: key === undefined ? {} : { 'x-loadtest-key': key } });

    afterEach(() => { process.env = { ...env }; });

    it('passt nur mit LOADTEST_MODE=true, Schluessel im Backend und gleichem Header', () => {
        process.env.LOADTEST_MODE = 'true';
        process.env.LOADTEST_KEY = KEY;
        expect(isLoadtestRequest(req(KEY))).toBe(true);
        expect(isLoadtestRequest(req(KEY + 'x'))).toBe(false);
        expect(isLoadtestRequest(req('falsch'))).toBe(false);
        expect(isLoadtestRequest(req())).toBe(false);
    });

    it('ist aus ohne LOADTEST_MODE, auch mit passendem Header', () => {
        process.env.LOADTEST_MODE = 'false';
        process.env.LOADTEST_KEY = KEY;
        expect(isLoadtestRequest(req(KEY))).toBe(false);
    });

    it('ist aus mit zu kurzem oder leerem Schluessel', () => {
        process.env.LOADTEST_MODE = 'true';
        process.env.LOADTEST_KEY = 'kurz';
        expect(isLoadtestRequest(req('kurz'))).toBe(false);
        process.env.LOADTEST_KEY = '';
        expect(isLoadtestRequest(req(''))).toBe(false);
    });

    it('Token-Laufzeit: Default 12 h, sonst LOADTEST_TOKEN_TTL_S', () => {
        delete process.env.LOADTEST_TOKEN_TTL_S;
        expect(loadtestTokenTtlSeconds()).toBe(43200);
        process.env.LOADTEST_TOKEN_TTL_S = '3600';
        expect(loadtestTokenTtlSeconds()).toBe(3600);
    });
});
