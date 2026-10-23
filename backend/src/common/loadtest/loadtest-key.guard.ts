import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { isLoadtestRequest } from './loadtest-key';

// Laesst nur Requests mit passendem Loadtest-Schluessel durch. Alle anderen bekommen 404,
// als gaebe es die Route nicht (wie ausserhalb von LOADTEST_MODE).
@Injectable()
export class LoadtestKeyGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        if (!isLoadtestRequest(context.switchToHttp().getRequest())) throw new NotFoundException();
        return true;
    }
}
