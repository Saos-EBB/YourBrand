import { SetMetadata } from '@nestjs/common';
import type { TenantModule } from './tenant.types';

export const REQUIRES_MODULE_KEY = 'requiresModule';

// Markiert Controller/Handler als Teil eines Mandanten-Moduls. Ist das Modul
// in tenant.json aus, antwortet FeatureGuard mit 404 — als gaebe es die Route
// nicht, wie bei Modulen, die gar nicht erst registriert werden.
export const RequiresModule = (module: TenantModule) => SetMetadata(REQUIRES_MODULE_KEY, module);
