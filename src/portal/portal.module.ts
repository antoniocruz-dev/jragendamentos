import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller.js';
import { WorkOrdersModule } from '../work-orders/work-orders.module.js';
import { AppointmentsModule } from '../appointments/appointments.module.js';

@Module({ imports: [WorkOrdersModule, AppointmentsModule], controllers: [PortalController] })
export class PortalModule {}
