import { CallHandler, ExecutionContext, Injectable, NestInterceptor, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, finalize } from 'rxjs';
import { ROUTE_CLASS, RouteClassName } from './route-class.decorator';

// Hoechstens LIMIT[klasse] gleichzeitige Requests je Klasse und Instanz; darueber sofort 503 mit Retry-After,
// statt den Event-Loop fuer alle anderen Routen zu blockieren. Grenzen per Env (GATE_HEAVY usw.).
const LIMIT: Record<RouteClassName, number> = {
    heavy: Number(process.env.GATE_HEAVY) || 4,
    auth: Number(process.env.GATE_AUTH) || 8,
    upload: Number(process.env.GATE_UPLOAD) || 2,
};

@Injectable()
export class RouteClassGate implements NestInterceptor {
    private readonly inFlight: Record<RouteClassName, number> = { heavy: 0, auth: 0, upload: 0 };

    constructor(private readonly reflector: Reflector) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const cls = this.reflector.getAllAndOverride<RouteClassName | undefined>(ROUTE_CLASS, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!cls) return next.handle();

        if (this.inFlight[cls] >= LIMIT[cls]) {
            context.switchToHttp().getResponse().set('Retry-After', '2');
            throw new ServiceUnavailableException(`Gerade ausgelastet (${cls}), bitte gleich nochmal versuchen`);
        }
        this.inFlight[cls]++;
        return next.handle().pipe(finalize(() => { this.inFlight[cls]--; }));
    }
}
