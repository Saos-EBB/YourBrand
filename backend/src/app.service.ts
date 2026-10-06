import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  // Antwort des Health-Endpoints. Bewusst ohne DB-Zugriff: die Aussage soll
  // "Prozess laeuft und routet" sein — ein DB-Check hier wuerde einen kurzen
  // DB-Neustart als kaputten Backend-Prozess werten.
  getStatus(): { status: string; uptime: number } {
    return { status: 'ok', uptime: Math.floor(process.uptime()) };
  }
}
