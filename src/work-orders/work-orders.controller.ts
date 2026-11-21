import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  ValidationPipe,
} from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderStatusDto } from './dto/update-status.dto';
import { WorkOrderStatus } from '@prisma/client';

@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Post()
  async create(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: CreateWorkOrderDto,
  ) {
    return this.workOrdersService.create(dto);
  }

  @Get()
  async listAll(@Query('status') status?: WorkOrderStatus) {
    return this.workOrdersService.listAll(status);
  }

  @Get(':id')
  async findById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.workOrdersService.findById(id);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: UpdateWorkOrderStatusDto,
  ) {
    return this.workOrdersService.updateStatus(id, dto);
  }
}
