import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Was a copy-pasted JwtModule.registerAsync block in 14 feature modules —
// one registration, global (like RedisModule/LastActiveModule) so JwtService
// is available wherever JwtGuard/OptionalJwtGuard get instantiated without
// every module re-importing it.
@Global()
@Module({
    imports: [
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                secret: configService.get<string>('JWT_SECRET'),
                signOptions: { expiresIn: '15m' },
            }),
            inject: [ConfigService],
        }),
    ],
    exports: [JwtModule],
})
export class SharedJwtModule { }
