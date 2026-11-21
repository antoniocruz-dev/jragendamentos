import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { PaymentsModule } from './payments/payments.module';
import { AppointmentsModule } from './appointments/appointments.module';

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
