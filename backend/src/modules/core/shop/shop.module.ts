import { Module } from '@nestjs/common';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';
import { ShopCheckoutService } from './shop-checkout.service';
import { ShopAdminController } from './shop-admin.controller';
import { ShopAdminService } from './shop-admin.service';
import { ShopOrdersAdminService } from './shop-orders-admin.service';
import { ShopFulfillmentService } from './shop-fulfillment.service';
import { ShopOrdersService } from './shop-orders.service';
import { ShopRedeemService } from './shop-redeem.service';
import { ShopCasesService } from './shop-cases.service';
import { ShopRefundService } from './shop-refund.service';
import { ShopAlertService } from './shop-alert.service';
import { ShopFollowUpService } from './shop-follow-up.service';
import { MailModule } from '../../../common/mail/mail.module';
import { BullModule } from '@nestjs/bullmq';
import { DEFAULT_JOB_OPTIONS, SHOP_INVOICE_QUEUE } from '../../../common/queue/queue.constants';
import { ShopInvoiceService } from './shop-invoice.service';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

// Shop (Mandanten-Modul "shop"), nur geladen, wenn tenant.json es
// einschaltet — siehe FEATURE_MODULES in app.module.ts. Zahlung und
// Gutschriften nur ueber ModuleBroker (shared), nie direkt aus anderen Modulen.
@Module({
    imports: [
        SystemSettingsModule, MailModule,
        // Rechnungen erzeugt der Worker (ShopInvoiceProcessor im WorkerModule)
        BullModule.registerQueue({ name: SHOP_INVOICE_QUEUE, defaultJobOptions: DEFAULT_JOB_OPTIONS }),
    ],
    controllers: [ShopController, ShopAdminController],
    providers: [ShopService, ShopCheckoutService, ShopAdminService, ShopOrdersAdminService, ShopFulfillmentService, ShopOrdersService, ShopRedeemService, ShopCasesService, ShopRefundService, ShopAlertService, ShopFollowUpService, ShopInvoiceService, JwtGuard],
})
export class ShopModule { }
