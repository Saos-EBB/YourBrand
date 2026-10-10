import { Module } from '@nestjs/common';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';

// Shop (Mandanten-Modul "shop"), nur geladen, wenn tenant.json es
// einschaltet — siehe FEATURE_MODULES in app.module.ts.
@Module({
    controllers: [ShopController],
    providers: [ShopService, JwtGuard],
})
export class ShopModule { }
