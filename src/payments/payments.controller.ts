import {
  Controller,
  Post,
  Body,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { CreatePixPaymentDto } from './dto/create-pix-payment.dto.js';
import { Public } from '../auth/decorators/public.decorator.js';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Gera o Pix de uma OS. Público porque o cliente paga pelo link da OS
   * (identificada pelo UUID, que não é adivinhável).
   */
  @Public()
  @Post('pix')
  async createPix(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: CreatePixPaymentDto,
  ) {
    return this.paymentsService.createPixForWorkOrder(dto.workOrderId);
  }

  /**
   * Endpoint público chamado exclusivamente pelos servidores do Mercado Pago
   */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() body: any,
    @Query() query: any,
    @Headers('x-signature') signature?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.paymentsService.handleWebhook(body, query, { signature, requestId });
  }
}
