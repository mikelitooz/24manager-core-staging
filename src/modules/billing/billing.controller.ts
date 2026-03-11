import {
    Controller,
    Get,
    Post,
    Patch,
    Body,
    Param,
    Query,
    Headers,
    Req,
    Res,
    Logger,
    HttpCode,
    UseGuards,
    UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { BillingService } from './billing.service';
import { PaystackService } from './paystack.service';
import { AdminJwtGuard } from './admin-jwt.guard';
import { BillingCycle, SubscriptionStatus } from '@prisma/client';

@Controller('billing')
export class BillingController {
    private readonly logger = new Logger(BillingController.name);

    constructor(
        private billing: BillingService,
        private paystack: PaystackService,
        private jwtService: JwtService,
    ) { }

    // =========================================================================
    // AUTHENTICATION (Public)
    // =========================================================================

    @Post('login')
    @HttpCode(200)
    async login(@Body() body: { email?: string; password?: string; apiKey?: string }, @Res({ passthrough: true }) res: Response) {
        // Backward compatibility for automated tests or legacy clients while we transition
        if (body.apiKey) {
            const validKey = process.env.ADMIN_API_KEY;
            if (body.apiKey !== validKey) throw new UnauthorizedException('Invalid credentials');
            return this.issueTokenAndCookie('admin', res);
        }

        if (!body.email || !body.password) {
            throw new UnauthorizedException('Email and password are required');
        }

        const admin = await this.billing.validateAdminUser(body.email, body.password);
        if (!admin) {
            throw new UnauthorizedException('Invalid credentials');
        }

        return this.issueTokenAndCookie(admin.role, res);
    }

    private issueTokenAndCookie(role: string, res: Response) {
        const token = this.jwtService.sign({ role });

        res.cookie('admin_session', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000, // 1 day
            path: '/',
        });

        return { message: 'Logged in successfully' };
    }

    @Post('logout')
    @HttpCode(200)
    logout(@Res({ passthrough: true }) res: Response) {
        res.clearCookie('admin_session', { path: '/' });
        return { message: 'Logged out successfully' };
    }

    // =========================================================================
    // TENANTS (Protected)
    // =========================================================================

    @Post('tenants')
    @UseGuards(AdminJwtGuard)
    createTenant(@Body() body: {
        name: string;
        slug: string;
        adminPhone: string;
        email?: string;
        whatsappNumber?: string;
    }) {
        return this.billing.createTenant(body);
    }

    @Get('tenants')
    @UseGuards(AdminJwtGuard)
    getTenants() {
        return this.billing.getTenants();
    }

    @Get('tenants/:id')
    @UseGuards(AdminJwtGuard)
    getTenant(@Param('id') id: string) {
        return this.billing.getTenant(id);
    }

    // =========================================================================
    // PLANS (Protected)
    // =========================================================================

    @Post('plans')
    @UseGuards(AdminJwtGuard)
    createPlan(@Body() body: {
        name: string;
        description?: string;
        defaultPrice: number;
        billingCycle?: BillingCycle;
        features?: string[];
    }) {
        return this.billing.createPlan(body);
    }

    @Get('plans')
    @UseGuards(AdminJwtGuard)
    getPlans(@Query('includeInactive') includeInactive?: string) {
        return this.billing.getPlans(includeInactive === 'true');
    }

    @Get('plans/:id')
    @UseGuards(AdminJwtGuard)
    getPlan(@Param('id') id: string) {
        return this.billing.getPlan(id);
    }

    @Patch('plans/:id')
    @UseGuards(AdminJwtGuard)
    updatePlan(@Param('id') id: string, @Body() body: {
        name?: string;
        description?: string;
        defaultPrice?: number;
        billingCycle?: BillingCycle;
        features?: string[];
        isActive?: boolean;
    }) {
        return this.billing.updatePlan(id, body);
    }

    // =========================================================================
    // SUBSCRIPTIONS (Protected)
    // =========================================================================

    @Post('subscriptions')
    @UseGuards(AdminJwtGuard)
    createSubscription(@Body() body: {
        tenantId: string;
        planId: string;
        email: string;
        customPrice?: number;
    }) {
        return this.billing.createSubscription(body);
    }

    @Get('subscriptions')
    @UseGuards(AdminJwtGuard)
    getSubscriptions(@Query('status') status?: SubscriptionStatus) {
        return this.billing.getSubscriptions(status);
    }

    @Get('subscriptions/:id')
    @UseGuards(AdminJwtGuard)
    getSubscription(@Param('id') id: string) {
        return this.billing.getSubscription(id);
    }

    @Post('subscriptions/:id/payment-link')
    @UseGuards(AdminJwtGuard)
    generatePaymentLink(
        @Param('id') id: string,
        @Body() body: { callbackUrl?: string },
    ) {
        return this.billing.generatePaymentLink(id, body.callbackUrl);
    }

    // =========================================================================
    // REVENUE (Protected)
    // =========================================================================

    @Get('revenue/summary')
    @UseGuards(AdminJwtGuard)
    getRevenueSummary() {
        return this.billing.getRevenueSummary();
    }

    @Get('revenue/logs')
    @UseGuards(AdminJwtGuard)
    getRevenueShareLogs(@Query('subscriptionId') subscriptionId?: string) {
        return this.billing.getRevenueShareLogs(subscriptionId);
    }

    // =========================================================================
    // MANUAL BILLING TRIGGER (Protected, admin only)
    // =========================================================================

    @Post('run-billing')
    @UseGuards(AdminJwtGuard)
    async runRecurringBilling(@Req() req: any) {
        await this.billing.processRecurringBilling();

        await this.billing.logAudit(
            'MANUAL_BILLING_RUN',
            'System',
            'ALL',
            null,
            req.user?.role || 'admin',
            null,
            { timestamp: new Date().toISOString() }
        );

        return { message: 'Recurring billing processed' };
    }
}
