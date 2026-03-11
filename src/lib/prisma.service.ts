import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    constructor() {
        super({
            log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
        });
    }

    async onModuleInit() {
        // Neon free-tier auto-suspends - retry connection up to 3 times
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await this.$connect();
                console.log(`✅ Database connected (attempt ${attempt})`);
                return;
            } catch (error) {
                console.log(`⚠️ DB connection attempt ${attempt}/3 failed:`, error.message);
                if (attempt < 3) {
                    console.log('   Retrying in 3 seconds...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                } else {
                    throw error;
                }
            }
        }
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }
}
