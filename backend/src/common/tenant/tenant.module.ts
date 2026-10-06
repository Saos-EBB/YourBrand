import { Global, Module } from '@nestjs/common';
import { TenantController } from './tenant.controller';
import { loadTenantConfig } from './tenant-config.loader';
import { TENANT_CONFIG } from './tenant.types';

// Global: jeder Service kann @Inject(TENANT_CONFIG) nutzen, ohne das Modul
// selbst zu importieren. Die Factory laeuft beim Boot — ungueltige Config
// = App startet nicht.
@Global()
@Module({
    controllers: [TenantController],
    providers: [{ provide: TENANT_CONFIG, useFactory: loadTenantConfig }],
    exports: [TENANT_CONFIG],
})
export class TenantModule { }
