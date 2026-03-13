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
            name: 'Basic Plan',
            description: 'Perfect for startups or solo entrepreneurs automating customer engagement and order management.',
            defaultPrice: 40000,
            billingCycle: BillingCycle.MONTHLY,
            features: [
                '1 WhatsApp AI Bot (predefined template)',
                '1 User Access',
                'Manage orders, bookings, and FAQs',
                'AI ↔ Human mode switching',
                'Bulk messaging (approved templates)',
                'Delivery integration (Glovo, etc.)',
                'Social media account management'
            ],
            isActive: true
        },
        {
            name: 'Professional Plan',
            description: 'For growing businesses managing multiple brands or departments.',
            defaultPrice: 75000,
            billingCycle: BillingCycle.MONTHLY,
            features: [
                '3 WhatsApp AI Accounts',
                'Unlimited Users',
                'Front Office AI, Back Office AI, and Management AI',
                'Everything in Basic + advanced workflow integrations',
                'Priority support',
                'Custom templates',
                'Advanced analytics'
            ],
            isActive: true
        },
        {
            name: 'Enterprise Plan',
            description: 'For franchises or large operations needing full automation. Custom pricing available.',
            defaultPrice: 150000,
            billingCycle: BillingCycle.MONTHLY,
            features: [
                '7 WhatsApp AI Accounts',
                'Unlimited Users',
                'Centralized analytics & multi-branch integration',
                'Advanced automation workflows',
                'Priority support',
                'Dedicated account manager',
                'Custom integrations'
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
