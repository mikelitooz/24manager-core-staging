import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { LibModule } from './lib/lib.module';
import { BillingModule } from './modules/billing/billing.module';

@Module({
  imports: [
    LibModule,
    BillingModule,
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      serveRoot: '/admin', // Dashboard served at /admin
    }),
  ],
})
export class AppModule { }
