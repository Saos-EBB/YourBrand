import { Module } from '@nestjs/common';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';
import { ShopCheckoutService } from './shop-checkout.service';
import { StripeService } from '../payment/stripe.service';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

// Shop (Mandanten-Modul "shop"), nur geladen, wenn tenant.json es
// einschaltet — siehe FEATURE_MODULES in app.module.ts. StripeService als
// eigener Provider (zustandslos), PaymentModule exportiert ihn nicht.
@Module({
    imports: [SystemSettingsModule],
    controllers: [ShopController],
    providers: [ShopService, ShopCheckoutService, StripeService, JwtGuard],
})
export class ShopModule { }
