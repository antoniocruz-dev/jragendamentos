import {
  Controller,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePixPaymentDto } from './dto/create-pix-payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Endpoint chamado pelo Front-End / Atendente para gerar o Pix de uma OS
   */
  @Post('pix')
  async createPix(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: CreatePixPaymentDto,
  ) {
    return this.paymentsService.createPixForWorkOrder(dto.workOrderId);
  }

  /**
   * Endpoint público chamado exclusivamente pelos servidores do Mercado Pago
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() body: any,
    @Query() query: any,
  ) {
    return this.paymentsService.handleWebhook(body, query);
  }
}
