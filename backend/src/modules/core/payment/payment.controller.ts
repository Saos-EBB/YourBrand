import { Controller, Get, Post, Delete, Body, Param, Req, Headers, HttpCode, Request, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PaymentService } from './payment.service';
import { JwtGuard } from '../../../common/guards/jwt.guard';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { RequiresPremium } from '../../../common/decorators/requires-premium.decorator';
import { RequiresModule } from '../../../common/tenant/requires-module.decorator';

// IMPORTANT: the webhook endpoint requires access to the raw request body for
// Stripe signature verification. Add the following to main.ts:
//
//   const app = await NestFactory.create(AppModule, { rawBody: true });
//
// Without this, constructEvent() will always throw a signature mismatch error.

@RequiresModule('payments')
@Controller('payment')
export class PaymentController {
    constructor(private readonly paymentService: PaymentService) { }

    @Get('subscriptions')
    @UseGuards(JwtGuard)
    getActiveSubscription(@Request() req: any) {
        return this.paymentService.getActiveSubscription(req.user.sub);
    }

    @Post('subscriptions')
    @UseGuards(JwtGuard)
    createSubscription(@Request() req: any, @Body() dto: CreateSubscriptionDto) {
        return this.paymentService.createSubscription(req.user.sub, dto);
    }

    @Delete('subscriptions/:id')
    @UseGuards(JwtGuard)
    cancelSubscription(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
        return this.paymentService.cancelSubscription(req.user.sub, id);
    }

    @Get('logs')
    @RequiresPremium()
    getPaymentLogs(@Request() req: any) {
        return this.paymentService.getPaymentLogs(req.user.sub);
    }

    @Post('webhook')
    @HttpCode(200)
    @SkipThrottle()
    handleWebhook(
        @Headers('stripe-signature') sig: string,
        @Req() req: any,
    ) {
        return this.paymentService.handleWebhook(sig, req.rawBody);
    }
}
