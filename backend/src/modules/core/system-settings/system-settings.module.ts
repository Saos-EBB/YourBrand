import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemSetting } from './entities/system-setting.entity';
import { SystemSettingsService } from './system-settings.service';
import { SystemSettingsController } from './system-settings.controller';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { OwnerGuard } from '../../../common/guards/owner.guard';

@Module({
    imports: [
        TypeOrmModule.forFeature([SystemSetting]),
    ],
    controllers: [SystemSettingsController],
    providers: [SystemSettingsService, JwtGuard, OwnerGuard],
    exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
