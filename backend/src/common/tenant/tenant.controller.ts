import { Controller, Get, Inject } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { toPublicTenantConfig } from './tenant-config.loader';
import { TENANT_CONFIG } from './tenant.types';
import type { PublicTenantConfig, TenantConfig } from './tenant.types';

@Controller('tenant')
export class TenantController {
    constructor(@Inject(TENANT_CONFIG) private readonly config: TenantConfig) { }

    // Oeffentlich (kein Guard): das Frontend braucht Branding/Theme/Module
    // schon vor dem Login. SkipThrottle wie /health — wird bei jedem
    // Seitenaufruf geladen und soll nicht vom 100/60s-Limit pro IP zehren.
    @SkipThrottle()
    @Get()
    getTenant(): PublicTenantConfig {
        return toPublicTenantConfig(this.config);
    }
}
