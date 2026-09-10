import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { StripeService } from './stripe.service';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { Subscription } from './entities/subscription.entity';
import { PaymentLog } from './entities/payment-log.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Subscription, PaymentLog]),
        NotificationsModule,
    ],
    controllers: [PaymentController],
    providers: [PaymentService, StripeService, JwtGuard],
})
export class PaymentModule { }
