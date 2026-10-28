import type { NextFunction, Request, Response } from 'express';

// Lastabwurf vor Guards, JWT und DB. Ohne ihn kippt eine Instanz bei Ueberlast: Requests stauen sich,
// der Proxy gibt nach 5 s auf (504), Node arbeitet die verwaisten Requests trotzdem ab — die CPU geht
// an Clients, die laengst weg sind, und der Stau loest sich nicht mehr auf (Loadtest Ramp 14/15).
//   GATE_INFLIGHT        max. gleichzeitige Requests je Instanz, darueber sofort 503 (0/leer = aus)
//   REQUEST_DEADLINE_MS  verwirft Requests, die seit X-Request-Start (vom Proxy, "t=<sek.ms>") laenger
//                        gewartet haben (0/leer = aus)
const EXEMPT = new Set(['/health', '/ready']);

export function loadShed() {
    const maxInFlight = Number(process.env.GATE_INFLIGHT) || 0;
    const deadlineMs = Number(process.env.REQUEST_DEADLINE_MS) || 0;
    let inFlight = 0;

    const reject = (res: Response, reason: string) => {
        res.setHeader('Retry-After', '1');
        res.status(503).json({ statusCode: 503, message: `Gerade ausgelastet (${reason}), bitte gleich nochmal versuchen` });
    };

    return (req: Request, res: Response, next: NextFunction) => {
        if (EXEMPT.has(req.path)) return next();

        if (deadlineMs) {
            const start = /t=(\d+(?:\.\d+)?)/.exec(String(req.headers['x-request-start'] ?? ''));
            if (start && Date.now() - Number(start[1]) * 1000 > deadlineMs) return reject(res, 'deadline');
        }
        if (maxInFlight) {
            if (inFlight >= maxInFlight) return reject(res, 'inflight');
            inFlight++;
            res.once('close', () => { inFlight--; });
        }
        next();
    };
}
