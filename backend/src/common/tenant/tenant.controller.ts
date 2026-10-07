import * as path from 'path';
import { Controller, Get, Inject, NotFoundException, Param, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { tenantDir, toPublicTenantConfig } from './tenant-config.loader';
import { TENANT_CONFIG } from './tenant.types';
import type { PublicTenantConfig, TenantConfig } from './tenant.types';

const ASSET_TYPES: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

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

    // Logo/Favicon aus tenants/<slug>/ — nur die zwei Dateien, die tenant.json
    // nennt (per Schema reine Dateinamen ohne Pfad), nie beliebige Dateien
    // aus dem Ordner (.env!). CSP gegen Script in einem direkt geoeffneten SVG.
    @SkipThrottle()
    @Get('asset/:name')
    getAsset(@Param('name') name: string, @Res() res: Response) {
        const { logo, favicon } = this.config.brand;
        if (name !== logo && name !== favicon) throw new NotFoundException();
        res.set('Content-Type', ASSET_TYPES[path.extname(name).toLowerCase()] ?? 'application/octet-stream');
        res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
        res.set('Cache-Control', 'public, max-age=300');
        res.sendFile(path.resolve(tenantDir(), this.config.slug, name));
    }
}
