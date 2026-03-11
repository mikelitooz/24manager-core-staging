import { Controller, Post, Body, Headers, Req, Logger, HttpCode, UnauthorizedException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { PaystackService } from './paystack.service';
import * as crypto from 'crypto';

/**
 * Separate controller for Paystack webhook — no auth guard.
 * Signature validation is done via x-paystack-signature header.
 */
@Controller('webhook')
export class WebhookController {
    private readonly logger = new Logger(WebhookController.name);

    constructor(
        private billing: BillingService,
        private paystack: PaystackService,
    ) { }

    @Post('paystack')
    @HttpCode(200)
    async handlePaystackWebhook(
        @Body() body: any,
        @Headers('x-paystack-signature') signature: string,
        @Req() req: any,
    ) {
        // Validate Paystack signature securely
        const secret = process.env.PAYSTACK_SECRET_KEY || '';
        const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(body)).digest('hex');

        if (hash !== signature) {
            this.logger.error('Unauthorized: Invalid Paystack webhook signature');
            throw new UnauthorizedException('Invalid webhook signature');
        }

        const { event, data } = body;
        this.logger.log(`Paystack webhook received: ${event}`);

        if (event === 'charge.success') {
            await this.billing.handlePaymentWebhook(event, data);
        }

        return { status: 'ok' };
    }
}
