import { CanActivate, ExecutionContext, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_MODULE_KEY } from './requires-module.decorator';
import { TENANT_CONFIG } from './tenant.types';
import type { TenantConfig, TenantModule } from './tenant.types';

// Global registriert (APP_GUARD in app.module.ts). Erste Linie ist, dass
// abgeschaltete Module gar nicht erst importiert werden; das hier faengt
// alles ab, was trotzdem registriert ist — v.a. die Chat-Routen, deren
// Modul wegen ChatGateway (Notifications, Bans) immer geladen bleibt.
@Injectable()
export class FeatureGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        @Inject(TENANT_CONFIG) private readonly config: TenantConfig,
    ) { }

    canActivate(context: ExecutionContext): boolean {
        const module = this.reflector.getAllAndOverride<TenantModule | undefined>(
            REQUIRES_MODULE_KEY,
            [context.getHandler(), context.getClass()],
        );
        if (!module || this.config.modules[module]) return true;
        throw new NotFoundException();
    }
}
