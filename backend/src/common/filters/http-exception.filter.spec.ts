import { ArgumentsHost, BadRequestException, ConflictException, HttpException, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { HttpExceptionFilter } from './http-exception.filter';

function run(exception: unknown) {
    const res: any = { headers: {} as Record<string, string> };
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    res.set = jest.fn((k: string, v: string) => { res.headers[k] = v; return res; });
    const host = {
        switchToHttp: () => ({ getRequest: () => ({ method: 'GET', url: '/x?y=1', headers: { 'x-request-id': 'abc-1' } }), getResponse: () => res }),
    } as unknown as ArgumentsHost;
    new HttpExceptionFilter().catch(exception, host);
    return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0], headers: res.headers };
}

const pgError = (code: string) => new QueryFailedError('SELECT 1', [], Object.assign(new Error('db'), { code }));

describe('HttpExceptionFilter', () => {
    let error: jest.SpyInstance, warn: jest.SpyInstance, debug: jest.SpyInstance;
    beforeEach(() => {
        error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('UNIQUE-Verletzung (23505) → 409', () => expect(run(pgError('23505')).status).toBe(409));
    it('FK-Verletzung (23503) → 409', () => expect(run(pgError('23503')).status).toBe(409));
    it('statement_timeout (57014) → 503 mit Retry-After', () => {
        const r = run(pgError('57014'));
        expect(r.status).toBe(503);
        expect(r.headers['Retry-After']).toBe('2');
    });
    it('andere DB-Fehler bleiben 500', () => expect(run(pgError('42P01')).status).toBe(500));
    it('HttpException behaelt Status und Nachricht', () => {
        const r = run(new ConflictException('schon da'));
        expect(r.status).toBe(409);
        expect(r.body.message).toBe('schon da');
    });

    it('500 als ERROR mit Stack und Request-ID', () => {
        run(new Error('kaputt'));
        expect(error).toHaveBeenCalledWith(expect.stringContaining('req:abc-1'), expect.stringContaining('kaputt'));
    });
    it('erwartbare 4xx (401/403/404/429) nur debug', () => {
        for (const code of [401, 403, 404, 429]) run(new HttpException('x', code));
        expect(debug).toHaveBeenCalledTimes(4);
        expect(error).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });
    it('andere 4xx als WARN', () => {
        run(new BadRequestException('falsch'));
        expect(warn).toHaveBeenCalledTimes(1);
        expect(error).not.toHaveBeenCalled();
    });
});
