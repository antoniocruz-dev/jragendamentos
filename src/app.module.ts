import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { WorkOrdersModule } from './work-orders/work-orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { AppointmentsModule } from './appointments/appointments.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ClientsModule,
    WorkOrdersModule,
    PaymentsModule,
    AppointmentsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
