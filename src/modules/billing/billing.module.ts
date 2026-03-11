import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtModule } from '@nestjs/jwt';
import { BillingController } from './billing.controller';
import { WebhookController } from './webhook.controller';
import { BillingService } from './billing.service';
import { PaystackService } from './paystack.service';
import { BillingCronService } from './billing-cron.service';

@Module({
    imports: [
        ScheduleModule.forRoot(),
        JwtModule.register({
            secret: process.env.ADMIN_API_KEY || 'supersecretkey2026',
            signOptions: { expiresIn: '1d' },
        }),
    ],
    controllers: [BillingController, WebhookController],
    providers: [BillingService, PaystackService, BillingCronService],
    exports: [BillingService, PaystackService],
})
export class BillingModule { }
