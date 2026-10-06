import { Controller, Get, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureGuard } from './feature.guard';
import { RequiresModule } from './requires-module.decorator';
import type { TenantConfig } from './tenant.types';

@RequiresModule('matching')
@Controller()
class MatchingRoutes {
    @Get() list() { return []; }
}

@Controller()
class OpenRoutes {
    @Get() list() { return []; }
    @RequiresModule('hidden') @Get('secret') secret() { return []; }
}

const config = (modules: Partial<TenantConfig['modules']>) =>
    ({ modules: { chat: true, matching: true, payments: true, hidden: true, ...modules } }) as TenantConfig;

const ctx = (cls: new () => object, handler: string) => {
    const proto = cls.prototype as Record<string, () => unknown>;
    return { getClass: () => cls, getHandler: () => proto[handler] } as never;
};

describe('FeatureGuard', () => {
    const reflector = new Reflector();

    it('laesst Routen ohne @RequiresModule durch', () => {
        const guard = new FeatureGuard(reflector, config({ matching: false, hidden: false }));
        expect(guard.canActivate(ctx(OpenRoutes, 'list'))).toBe(true);
    });

    it('laesst aktive Module durch', () => {
        expect(new FeatureGuard(reflector, config({})).canActivate(ctx(MatchingRoutes, 'list'))).toBe(true);
    });

    it('404 fuer abgeschaltetes Modul (Klassen-Decorator)', () => {
        const guard = new FeatureGuard(reflector, config({ matching: false }));
        expect(() => guard.canActivate(ctx(MatchingRoutes, 'list'))).toThrow(NotFoundException);
    });

    it('404 fuer abgeschaltetes Modul (Handler-Decorator)', () => {
        const guard = new FeatureGuard(reflector, config({ hidden: false }));
        expect(() => guard.canActivate(ctx(OpenRoutes, 'secret'))).toThrow(NotFoundException);
    });
});
