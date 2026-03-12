import 'dotenv/config';
import { PrismaClient, BillingCycle } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function normalizeDatabaseUrl(rawValue: string | undefined): string | undefined {
    if (!rawValue) {
        return rawValue;
    }
    let value = rawValue.trim();
    if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("\'") && value.endsWith("\'"))
    ) {
        value = value.slice(1, -1).trim();
    }
    return value.replace(/[\r\n]+/g, '');
}

const connectionString = normalizeDatabaseUrl(process.env.DATABASE_URL);
if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Seeding default plans...');

    const plans = [
        {
            name: 'Starter',
            description: 'Perfect for single-location businesses.',
            defaultPrice: 5000,
            billingCycle: BillingCycle.MONTHLY,
            features: [
                '1 Location (Restaurant)',
                'WhatsApp Order Integration',
                'Basic Dashboard Analytics',
                'Email Support'
            ],
            isActive: true
        },
        {
            name: 'Pro',
            description: 'Best for growing businesses with multiple staff.',
            defaultPrice: 15000,
            billingCycle: BillingCycle.MONTHLY,
            features: [
                'Up to 3 Locations',
                'Priority WhatsApp Bot',
                'Advanced Revenue Analytics',
                'Staff Accounts & Roles',
                'Sales History Export'
            ],
            isActive: true
        },
        {
            name: 'Enterprise',
            description: 'Custom solutions for large franchises.',
            defaultPrice: 50000,
            billingCycle: BillingCycle.MONTHLY,
            features: [
                'Unlimited Locations',
                'White-label Bot Branding',
                'Custom API Integrations',
                'Dedicated Support Hero',
                'Performance Optimization Tools'
            ],
            isActive: true
        }
    ];

    for (const planData of plans) {
        const existingPlan = await prisma.plan.findFirst({
            where: { name: planData.name },
        });

        const plan = existingPlan
            ? await prisma.plan.update({
                where: { id: existingPlan.id },
                data: planData,
            })
            : await prisma.plan.create({
                data: planData,
            });
        console.log(`Created/Updated Plan: ${plan.name}`);
    }

    console.log('Seed complete!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
