import { Module } from '@nestjs/common';
import { MechanicController } from './mechanic.controller.js';
import { MechanicService } from './mechanic.service.js';
import { WorkOrdersModule } from '../work-orders/work-orders.module.js';

@Module({ imports: [WorkOrdersModule], controllers: [MechanicController], providers: [MechanicService] })
export class MechanicModule {}
