import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { WorkOrdersModule } from './work-orders/work-orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { AppointmentsModule } from './appointments/appointments.module.js';
import { TeamModule } from './team/team.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { FinancialModule } from './financial/financial.module.js';
import { HealthModule } from './health/health.module.js';
import { PortalModule } from './portal/portal.module.js';
import { MechanicModule } from './mechanic/mechanic.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ClientsModule,
    WorkOrdersModule,
    PaymentsModule,
    AppointmentsModule,
    TeamModule,
    CatalogModule,
    DashboardModule,
    FinancialModule,
    HealthModule,
    PortalModule,
    MechanicModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
