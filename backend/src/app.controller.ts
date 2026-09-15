import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
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
