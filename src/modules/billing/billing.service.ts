import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import { PaystackService } from './paystack.service';
import { BillingCycle, SubscriptionStatus, PaymentStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class BillingService implements OnModuleInit {
    private readonly logger = new Logger(BillingService.name);

    constructor(
        private prisma: PrismaService,
        private paystack: PaystackService,
    ) { }

    async onModuleInit() {
        // Ensure a default admin exists for Email/Password login
        const defaultEmail = 'admin@24manager.com';
        const existing = await this.prisma.adminUser.findUnique({ where: { email: defaultEmail } });

        if (!existing) {
            const defaultPassword = process.env.ADMIN_API_KEY || 'supersecretkey2026';
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(defaultPassword, salt);

            await this.prisma.adminUser.create({
                data: {
                    email: defaultEmail,
                    password: hashedPassword,
                    name: 'Super Admin',
                    role: 'superadmin'
                }
            });
            this.logger.log(`Default admin created: ${defaultEmail}`);
        }

        // Ensure default plans exist so the frontend Select Plan UI populates correctly
        const defaultPlans = [
            {
                name: 'Starter',
                description: 'Perfect for single-location businesses.',
                defaultPrice: 5000,
                billingCycle: BillingCycle.MONTHLY,
                features: ['1 Location (Restaurant)', 'WhatsApp Order Integration', 'Basic Dashboard Analytics', 'Email Support'],
                isActive: true
            },
            {
                name: 'Pro',
                description: 'Best for growing businesses with multiple staff.',
                defaultPrice: 15000,
                billingCycle: BillingCycle.MONTHLY,
                features: ['Up to 3 Locations', 'Priority WhatsApp Bot', 'Advanced Revenue Analytics', 'Staff Accounts & Roles', 'Sales History Export'],
                isActive: true
            },
            {
                name: 'Enterprise',
                description: 'Custom solutions for large franchises.',
                defaultPrice: 50000,
                billingCycle: BillingCycle.MONTHLY,
                features: ['Unlimited Locations', 'White-label Bot Branding', 'Custom API Integrations', 'Dedicated Support Hero', 'Performance Optimization Tools'],
                isActive: true
            }
        ];

        for (const planData of defaultPlans) {
            const existingPlan = await this.prisma.plan.findFirst({
                where: { name: planData.name },
            });
            if (!existingPlan) {
                await this.prisma.plan.create({ data: planData });
                this.logger.log(`Default Plan seeded: ${planData.name}`);
            }
        }
    }

    async validateAdminUser(email: string, passwordAttempt: string) {
        const admin = await this.prisma.adminUser.findUnique({ where: { email } });
        if (!admin) return null;

        const isMatch = await bcrypt.compare(passwordAttempt, admin.password);
        if (!isMatch) return null;

        return admin;
    }

    // =========================================================================
    // PLAN MANAGEMENT
    // =========================================================================

    async createPlan(data: {
        name: string;
        description?: string;
        defaultPrice: number;
        billingCycle?: BillingCycle;
        features?: string[];
    }) {
        const plan = await this.prisma.plan.create({
            data: {
                name: data.name,
                description: data.description,
                defaultPrice: data.defaultPrice,
                billingCycle: data.billingCycle || 'MONTHLY',
                features: data.features || [],
            },
        });

        await this.logAudit('PLAN_CREATED', 'Plan', plan.id, null, 'system', null, {
            name: plan.name,
            defaultPrice: plan.defaultPrice,
            billingCycle: plan.billingCycle,
        });

        this.logger.log(`Plan created: ${plan.name} @ ₦${plan.defaultPrice}/${plan.billingCycle}`);
        return plan;
    }

    async getPlans(includeInactive = false) {
        return this.prisma.plan.findMany({
            where: includeInactive ? {} : { isActive: true },
            include: {
                _count: { select: { subscriptions: true } },
            },
            orderBy: { defaultPrice: 'asc' },
        });
    }

    async getPlan(planId: string) {
        const plan = await this.prisma.plan.findUnique({
            where: { id: planId },
            include: {
                subscriptions: {
                    include: {
                        tenant: true,
                        transactions: { orderBy: { createdAt: 'desc' }, take: 5 },
                    },
                },
            },
        });
        if (!plan) throw new NotFoundException('Plan not found');
        return plan;
    }

    async updatePlan(planId: string, data: {
        name?: string;
        description?: string;
        defaultPrice?: number;
        billingCycle?: BillingCycle;
        features?: string[];
        isActive?: boolean;
    }) {
        const existing = await this.prisma.plan.findUnique({ where: { id: planId } });
        if (!existing) throw new NotFoundException('Plan not found');

        const plan = await this.prisma.plan.update({
            where: { id: planId },
            data,
        });

        await this.logAudit('PLAN_UPDATED', 'Plan', planId, null, 'system', {
            name: existing.name,
            defaultPrice: existing.defaultPrice,
            billingCycle: existing.billingCycle,
        }, {
            name: plan.name,
            defaultPrice: plan.defaultPrice,
            billingCycle: plan.billingCycle,
        });

        return plan;
    }

    // =========================================================================
    // SUBSCRIPTION MANAGEMENT
    // =========================================================================

    async createSubscription(data: {
        tenantId: string;
        planId: string;
        email: string;
        customPrice?: number;
    }) {
        const tenant = await this.prisma.tenant.findUnique({ where: { id: data.tenantId } });
        if (!tenant) throw new NotFoundException('Tenant not found');

        const plan = await this.prisma.plan.findUnique({ where: { id: data.planId } });
        if (!plan) throw new NotFoundException('Plan not found');

        const existing = await this.prisma.subscription.findUnique({ where: { tenantId: data.tenantId } });
        if (existing && ['ACTIVE', 'PENDING'].includes(existing.status)) {
            throw new BadRequestException('Tenant already has an active subscription');
        }

        const subscription = await this.prisma.subscription.create({
            data: {
                tenantId: data.tenantId,
                planId: data.planId,
                paystackEmail: data.email,
                customPrice: data.customPrice !== undefined ? data.customPrice : null,
                status: 'PENDING',
            },
            include: { tenant: true, plan: true },
        });

        this.logger.log(`Subscription created for ${tenant.name} on ${plan.name}`);
        return subscription;
    }

    async generatePaymentLink(subscriptionId: string, callbackUrl?: string) {
        const sub = await this.prisma.subscription.findUnique({
            where: { id: subscriptionId },
            include: { plan: true, tenant: true },
        });
        if (!sub) throw new NotFoundException('Subscription not found');
        if (!sub.paystackEmail) throw new BadRequestException('No email set for this subscription');

        const price = sub.customPrice || sub.plan.defaultPrice;
        const amountInKobo = Math.round(Number(price) * 100);

        const reference = `SUB_${sub.id}_${Date.now()}`;

        const result = await this.paystack.initializeTransaction({
            email: sub.paystackEmail,
            amount: amountInKobo,
            reference,
            metadata: {
                subscription_id: sub.id,
                tenant_id: sub.tenantId,
                plan_id: sub.planId,
                billing_type: 'subscription_initial',
            },
            callback_url: callbackUrl,
        });

        await this.prisma.subscriptionTransaction.create({
            data: {
                subscriptionId: sub.id,
                amount: Number(price),
                status: 'PENDING',
                paystackRef: reference,
            },
        });

        this.logger.log(`Payment link generated for ${sub.tenant.name}: ${result.data.authorization_url}`);

        return {
            paymentUrl: result.data.authorization_url,
            reference,
            amount: Number(price),
            tenant: sub.tenant.name,
            plan: sub.plan.name,
        };
    }

    async handlePaymentWebhook(event: string, data: any) {
        if (event !== 'charge.success') return;

        const reference = data.reference;
        if (!reference) return;

        const metadata = data.metadata || {};
        const billingType = metadata.billing_type || metadata.custom_fields?.find((f: any) => f.variable_name === 'billing_type')?.value;

        // Decoupled: We only care about subscription billing in this core
        if (billingType !== 'subscription_initial' && billingType !== 'subscription_recurring') {
            this.logger.log(`Non-subscription webhook received: ${billingType}`);
            return;
        }

        const transaction = await this.prisma.subscriptionTransaction.findUnique({
            where: { paystackRef: reference },
            include: { subscription: { include: { plan: true, tenant: true } } },
        });

        if (!transaction) {
            this.logger.warn(`No transaction found for reference: ${reference}`);
            return;
        }

        if (transaction.status === 'PAID') {
            this.logger.log(`Transaction ${reference} already processed (idempotent)`);
            return;
        }

        await this.prisma.subscriptionTransaction.update({
            where: { id: transaction.id },
            data: {
                status: 'PAID',
                providerResponse: data as any,
            },
        });

        const sub = transaction.subscription;
        const authorizationCode = data.authorization?.authorization_code;
        const customerCode = data.customer?.customer_code;
        const nextBillingDate = this.calculateNextBillingDate(sub.billingCycle);

        await this.prisma.subscription.update({
            where: { id: sub.id },
            data: {
                status: 'ACTIVE',
                paystackAuthorizationCode: authorizationCode || sub.paystackAuthorizationCode,
                paystackCustomerCode: customerCode || sub.paystackCustomerCode,
                lastBilledAt: new Date(),
                nextBillingDate,
            },
        });

        const amountCharged = Number(transaction.amount);
        const partnerPercentage = Number(sub.revenueSharePercentage);
        const partnerAmount = (amountCharged * partnerPercentage) / 100;
        const platformAmount = amountCharged - partnerAmount;

        await this.prisma.revenueShareLog.create({
            data: {
                subscriptionId: sub.id,
                amountCharged,
                partnerPercentage,
                partnerAmount,
                platformAmount,
                billingDate: new Date(),
            },
        });

        this.logger.log(
            `✅ Payment processed for ${sub.tenant.name}: ₦${amountCharged} → ` +
            `Partner: ₦${partnerAmount.toFixed(2)} | Platform: ₦${platformAmount.toFixed(2)}`,
        );

        // TODO: In the future, trigger a generic webhook to notify external bots
    }

    async processRecurringBilling() {
        const now = new Date();

        const dueSubscriptions = await this.prisma.subscription.findMany({
            where: {
                status: 'ACTIVE',
                nextBillingDate: { lte: now },
                paystackAuthorizationCode: { not: null },
                isProcessingBilling: false,
            },
            include: { plan: true, tenant: true },
        });

        this.logger.log(`Processing ${dueSubscriptions.length} recurring charges`);

        for (const sub of dueSubscriptions) {
            await this.prisma.subscription.update({
                where: { id: sub.id },
                data: { isProcessingBilling: true },
            });

            try {
                await this.chargeSubscription(sub);
            } catch (error) {
                this.logger.error(`Failed to charge ${sub.tenant.name}: ${error.message}`);
            } finally {
                await this.prisma.subscription.update({
                    where: { id: sub.id },
                    data: { isProcessingBilling: false },
                });
            }
        }
    }

    private async chargeSubscription(sub: any) {
        const price = sub.customPrice || sub.plan.defaultPrice;
        const amountInKobo = Math.round(Number(price) * 100);
        const reference = `REC_${sub.id}_${Date.now()}`;

        const transaction = await this.prisma.subscriptionTransaction.create({
            data: {
                subscriptionId: sub.id,
                amount: Number(price),
                status: 'PENDING',
                paystackRef: reference,
            },
        });

        try {
            const result = await this.paystack.chargeAuthorization({
                authorization_code: sub.paystackAuthorizationCode!,
                email: sub.paystackEmail!,
                amount: amountInKobo,
                reference,
                metadata: {
                    subscription_id: sub.id,
                    tenant_id: sub.tenantId,
                    billing_type: 'subscription_recurring',
                },
            });

            if (result.data.status === 'success') {
                this.logger.log(`Recurring charge sent for ${sub.tenant.name}`);
            }
        } catch (error) {
            await this.prisma.subscriptionTransaction.update({
                where: { id: transaction.id },
                data: {
                    status: 'FAILED',
                    failureReason: error.message,
                    retryCount: { increment: 1 },
                },
            });

            const recentFailures = await this.prisma.subscriptionTransaction.count({
                where: {
                    subscriptionId: sub.id,
                    status: 'FAILED',
                    createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
                },
            });

            if (recentFailures >= 3) {
                await this.prisma.subscription.update({
                    where: { id: sub.id },
                    data: { status: 'SUSPENDED' },
                });
                this.logger.warn(`Subscription SUSPENDED for ${sub.tenant.name} after 3 failed attempts`);
            }
        }
    }

    async getSubscriptions(status?: SubscriptionStatus) {
        return this.prisma.subscription.findMany({
            where: status ? { status } : {},
            include: {
                tenant: true,
                plan: true,
                transactions: { orderBy: { createdAt: 'desc' }, take: 1 },
                _count: { select: { transactions: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getSubscription(subscriptionId: string) {
        const sub = await this.prisma.subscription.findUnique({
            where: { id: subscriptionId },
            include: {
                tenant: true,
                plan: true,
                transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
                revenueShareLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
            },
        });
        if (!sub) throw new NotFoundException('Subscription not found');
        return sub;
    }

    async getRevenueSummary() {
        const [
            totalRevenue,
            partnerRevenue,
            platformRevenue,
            activeSubscriptions,
            totalSubscribers,
            monthlyRevenue,
        ] = await Promise.all([
            this.prisma.revenueShareLog.aggregate({ _sum: { amountCharged: true } }),
            this.prisma.revenueShareLog.aggregate({ _sum: { partnerAmount: true } }),
            this.prisma.revenueShareLog.aggregate({ _sum: { platformAmount: true } }),
            this.prisma.subscription.count({ where: { status: 'ACTIVE' } }),
            this.prisma.subscription.count(),
            this.prisma.revenueShareLog.aggregate({
                _sum: { amountCharged: true, partnerAmount: true, platformAmount: true },
                where: {
                    billingDate: {
                        gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                    },
                },
            }),
        ]);

        const activeSubs = await this.prisma.subscription.findMany({
            where: { status: 'ACTIVE' },
            include: { plan: true },
        });

        const mrr = activeSubs.reduce((sum, sub) => {
            const price = Number(sub.customPrice || sub.plan.defaultPrice);
            const monthlyMultiplier = {
                WEEKLY: 4.33,
                MONTHLY: 1,
                QUARTERLY: 1 / 3,
                YEARLY: 1 / 12,
            };
            return sum + price * (monthlyMultiplier[sub.billingCycle] || 1);
        }, 0);

        return {
            totalRevenue: Number(totalRevenue._sum.amountCharged || 0),
            partnerRevenue: Number(partnerRevenue._sum.partnerAmount || 0),
            platformRevenue: Number(platformRevenue._sum.platformAmount || 0),
            mrr: Math.round(mrr * 100) / 100,
            activeSubscriptions,
            totalSubscribers,
            currentMonth: {
                total: Number(monthlyRevenue._sum.amountCharged || 0),
                partner: Number(monthlyRevenue._sum.partnerAmount || 0),
                platform: Number(monthlyRevenue._sum.platformAmount || 0),
            },
        };
    }

    async getRevenueShareLogs(subscriptionId?: string) {
        return this.prisma.revenueShareLog.findMany({
            where: subscriptionId ? { subscriptionId } : {},
            include: { subscription: { include: { tenant: true, plan: true } } },
            orderBy: { createdAt: 'desc' },
        });
    }

    async createTenant(data: {
        name: string;
        slug: string;
        adminPhone: string;
        email?: string;
        whatsappNumber?: string;
    }) {
        return this.prisma.tenant.create({ data });
    }

    async getTenants() {
        return this.prisma.tenant.findMany({
            include: {
                subscription: { include: { plan: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getTenant(tenantId: string) {
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            include: {
                subscription: {
                    include: { plan: true, transactions: { orderBy: { createdAt: 'desc' }, take: 10 } },
                },
            },
        });
        if (!tenant) throw new NotFoundException('Tenant not found');
        return tenant;
    }

    private calculateNextBillingDate(cycle: BillingCycle): Date {
        const now = new Date();
        switch (cycle) {
            case 'WEEKLY': return new Date(now.setDate(now.getDate() + 7));
            case 'MONTHLY': return new Date(now.setMonth(now.getMonth() + 1));
            case 'QUARTERLY': return new Date(now.setMonth(now.getMonth() + 3));
            case 'YEARLY': return new Date(now.setFullYear(now.getFullYear() + 1));
            default: return new Date(now.setMonth(now.getMonth() + 1));
        }
    }

    public async logAudit(
        action: string,
        entityType: string,
        entityId: string,
        tenantId: string | null,
        changedBy: string,
        oldValue: any,
        newValue: any,
    ) {
        return this.prisma.auditLog.create({
            data: { action, entityType, entityId, tenantId, changedBy, oldValue, newValue },
        });
    }
}
