import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createSecretKey } from 'crypto';

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
                // Als KeyObject statt String: jsonwebtoken 9 versucht einen String-Secret bei JEDEM verify/sign
                // zuerst als Public Key zu parsen, faengt die Exception und baut dann erst den Secret-Key — im
                // Lasttest ~30 % der CPU einer Instanz. Mit KeyObject entfaellt das komplett.
                secret: createSecretKey(Buffer.from(configService.getOrThrow<string>('JWT_SECRET'))),
                signOptions: { expiresIn: '15m' },
            }),
            inject: [ConfigService],
        }),
    ],
    exports: [JwtModule],
})
export class SharedJwtModule { }
