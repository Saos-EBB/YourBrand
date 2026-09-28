import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService } from './app.service';

// Haengt unter GET /api/v1 (globaler Prefix aus main.ts) und ist der
// healthcheckPath aus railway.json.
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Ohne das zaehlt der Deploy-Healthcheck gegen das globale Limit von
  // 100 Requests/60s pro IP — auf Railway kommen alle internen Checks aus
  // demselben Netz und koennten die Quote fuer echte Nutzer aufbrauchen.
  @SkipThrottle()
  @Get()
  getStatus() {
    return this.appService.getStatus();
  }

  // Unter dem globalen Prefix ausgenommen (main.ts) — erreichbar als
  // <ngrok-url>/health, ungeprefixt, reiner Prozess-Alive-Check ohne
  // Rate-Limit (haeufiges Polling vom Frontend-Fallback alle 30s).
  @SkipThrottle()
  @Get('health')
  getHealth() {
    return { status: 'ok' };
  }
}
