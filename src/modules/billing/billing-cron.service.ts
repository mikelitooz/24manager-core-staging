import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BillingService } from './billing.service';

@Injectable()
export class BillingCronService {
    private readonly logger = new Logger(BillingCronService.name);

    constructor(private billing: BillingService) { }

    /**
     * Run recurring billing every day at 2:00 AM WAT (1:00 AM UTC).
     * Finds all active subscriptions that are past due and charges them.
     */
    @Cron('0 1 * * *', { name: 'recurring-billing', timeZone: 'Africa/Lagos' })
    async handleRecurringBilling() {
        this.logger.log('⏰ Cron: Starting recurring billing run...');
        try {
            await this.billing.processRecurringBilling();
            this.logger.log('✅ Cron: Recurring billing completed');
        } catch (error) {
            this.logger.error(`❌ Cron: Recurring billing failed: ${error.message}`);
        }
    }

    /**
     * Retry failed payments every 6 hours.
     * Only retries subscriptions that haven't been suspended yet.
     */
    @Cron('0 */6 * * *', { name: 'retry-failed-payments', timeZone: 'Africa/Lagos' })
    async handleRetryFailedPayments() {
        this.logger.log('🔄 Cron: Retrying failed payments...');
        try {
            await this.billing.processRecurringBilling();
            this.logger.log('✅ Cron: Retry run completed');
        } catch (error) {
            this.logger.error(`❌ Cron: Failed payment retry failed: ${error.message}`);
        }
    }
}
