import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

interface PaystackInitializeResponse {
    status: boolean;
    message: string;
    data: {
        authorization_url: string;
        access_code: string;
        reference: string;
    };
}

interface PaystackChargeResponse {
    status: boolean;
    message: string;
    data: {
        status: string;
        reference: string;
        amount: number;
        authorization: {
            authorization_code: string;
            card_type: string;
            last4: string;
            exp_month: string;
            exp_year: string;
            bank: string;
        };
        customer: {
            customer_code: string;
            email: string;
        };
    };
}

@Injectable()
export class PaystackService {
    private readonly logger = new Logger(PaystackService.name);
    private readonly baseUrl = 'https://api.paystack.co';
    private readonly secretKey = process.env.PAYSTACK_SECRET_KEY;

    private get headers() {
        return {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
        };
    }

    /**
     * Initialize a transaction — generates a payment link for a new client.
     */
    async initializeTransaction(params: {
        email: string;
        amount: number; // Amount in kobo (NGN * 100)
        reference: string;
        metadata?: Record<string, any>;
        callback_url?: string;
    }): Promise<PaystackInitializeResponse> {
        try {
            const response = await axios.post<PaystackInitializeResponse>(
                `${this.baseUrl}/transaction/initialize`,
                {
                    email: params.email,
                    amount: params.amount,
                    reference: params.reference,
                    metadata: params.metadata,
                    callback_url: params.callback_url,
                },
                { headers: this.headers },
            );
            this.logger.log(`Transaction initialized: ${params.reference}`);
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to initialize transaction: ${error.message}`);
            throw error;
        }
    }

    /**
     * Charge an authorization — used for recurring billing.
     */
    async chargeAuthorization(params: {
        authorization_code: string;
        email: string;
        amount: number; // Amount in kobo (NGN * 100)
        reference: string;
        metadata?: Record<string, any>;
    }): Promise<PaystackChargeResponse> {
        try {
            const response = await axios.post<PaystackChargeResponse>(
                `${this.baseUrl}/transaction/charge_authorization`,
                {
                    authorization_code: params.authorization_code,
                    email: params.email,
                    amount: params.amount,
                    reference: params.reference,
                    metadata: params.metadata,
                },
                { headers: this.headers },
            );
            this.logger.log(`Authorization charged: ${params.reference} — Status: ${response.data.data.status}`);
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to charge authorization: ${error.message}`);
            throw error;
        }
    }

    /**
     * Verify a transaction by reference.
     */
    async verifyTransaction(reference: string): Promise<PaystackChargeResponse> {
        try {
            const response = await axios.get<PaystackChargeResponse>(
                `${this.baseUrl}/transaction/verify/${reference}`,
                { headers: this.headers },
            );
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to verify transaction ${reference}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Validate incoming webhook signature from Paystack.
     */
    validateWebhookSignature(body: string, signature: string): boolean {
        const crypto = require('crypto');
        const hash = crypto
            .createHmac('sha512', this.secretKey)
            .update(body)
            .digest('hex');
        return hash === signature;
    }

    /**
     * Refund a transaction by reference.
     */
    async refundTransaction(reference: string, amount?: number): Promise<{ success: boolean; message: string }> {
        try {
            const body: any = { transaction: reference };
            if (amount) {
                body.amount = amount;
            }

            const response = await axios.post(
                `${this.baseUrl}/refund`,
                body,
                { headers: this.headers },
            );

            this.logger.log(`Refund initiated for ${reference}: ${response.data.message}`);
            return { success: true, message: response.data.message || 'Refund initiated' };
        } catch (error: any) {
            this.logger.error(`Failed to refund transaction ${reference}: ${error.response?.data?.message || error.message}`);
            return { success: false, message: error.response?.data?.message || error.message };
        }
    }
}
