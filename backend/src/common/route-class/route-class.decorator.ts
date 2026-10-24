import { SetMetadata } from '@nestjs/common';

// Routen-Klassen fuer Schotten (Loadtest-Audit, Phase 1): teure oder CPU-lastige Routen bekommen ein eigenes
// Kontingent gleichzeitiger Requests pro Instanz (RouteClassGate). Ohne Decorator gilt die Route als schnell
// und hat kein Kontingent.
export type RouteClassName = 'heavy' | 'auth' | 'upload';

export const ROUTE_CLASS = 'route_class';
export const RouteClass = (name: RouteClassName) => SetMetadata(ROUTE_CLASS, name);
