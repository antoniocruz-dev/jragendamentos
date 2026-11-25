import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller.js';
import { WorkOrdersModule } from '../work-orders/work-orders.module.js';

@Module({ imports: [WorkOrdersModule], controllers: [PortalController] })
export class PortalModule {}
