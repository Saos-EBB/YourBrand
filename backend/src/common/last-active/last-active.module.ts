import { Global, Module } from '@nestjs/common';
import { LastActiveService } from './last-active.service';

// Global (like RedisModule) so JwtGuard/OptionalJwtGuard can inject it —
// they're re-declared as providers in 14 feature modules rather than shared
// through one module (see docs/architecture.md, Shared Auth-Modul), so
// anything they depend on has to be global too.
@Global()
@Module({
    providers: [LastActiveService],
    exports: [LastActiveService],
})
export class LastActiveModule { }
