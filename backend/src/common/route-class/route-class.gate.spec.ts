import { Reflector } from '@nestjs/core';
import { Subject, of } from 'rxjs';

describe('RouteClassGate', () => {
    let gate: any;
    const res = { set: jest.fn() };
    const ctx = (cls?: string) => ({
        getHandler: () => cls, getClass: () => undefined,
        switchToHttp: () => ({ getResponse: () => res }),
    }) as any;

    beforeEach(() => {
        jest.resetModules();
        process.env.GATE_HEAVY = '2';
        const { RouteClassGate } = require('./route-class.gate');
        const reflector = { getAllAndOverride: (_k: string, [handler]: any[]) => handler } as unknown as Reflector;
        gate = new RouteClassGate(reflector);
    });

    it('laesst Routen ohne Klasse immer durch', () => {
        for (let i = 0; i < 10; i++) expect(() => gate.intercept(ctx(), { handle: () => of(1) })).not.toThrow();
    });

    it('weist ueber der Grenze mit 503 ab und gibt nach Abschluss wieder frei', () => {
        const running = [new Subject(), new Subject()];
        running.forEach((s) => gate.intercept(ctx('heavy'), { handle: () => s }).subscribe());
        expect(() => gate.intercept(ctx('heavy'), { handle: () => of(1) })).toThrow(/ausgelastet \(heavy\)/);
        expect(res.set).toHaveBeenCalledWith('Retry-After', '2');
        running[0].complete();
        expect(() => gate.intercept(ctx('heavy'), { handle: () => of(1) }).subscribe()).not.toThrow();
    });
});
