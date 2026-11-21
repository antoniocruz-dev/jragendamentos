import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { MercadoPagoConfig, Payment } from 'mercadopago';

export interface PixPaymentResponse {
  paymentId: string;
  status: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
}

@Injectable()
export class MercadoPagoService {
  private readonly client: MercadoPagoConfig;
  private readonly payment: Payment;
  private readonly logger = new Logger(MercadoPagoService.name);

  constructor() {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) {
      this.logger.warn('MERCADO_PAGO_ACCESS_TOKEN não configurado no ambiente.');
    }
    this.client = new MercadoPagoConfig({
      accessToken: accessToken || 'TEST-TOKEN-MOCK',
      options: { timeout: 10000 },
    });
    this.payment = new Payment(this.client);
  }

  async generatePix(params: {
    workOrderId: string;
    code: number;
    amount: number;
    clientName: string;
    clientEmail: string;
    clientDocument: string;
  }): Promise<PixPaymentResponse> {
    try {
      // API_PUBLIC_URL = origem pública (ex.: https://seu-app.vercel.app), sem /api no final
      const webhookUrl = `${process.env.API_PUBLIC_URL}/api/payments/webhook`;
      const nameParts = params.clientName.trim().split(' ');
      const firstName = nameParts[0] || 'Cliente';
      const lastName = nameParts.slice(1).join(' ') || 'Oficina';

      const response = await this.payment.create({
        body: {
          transaction_amount: params.amount,
          description: `Oficina Mecânica - OS #${params.code}`,
          payment_method_id: 'pix',
          notification_url: webhookUrl,
          external_reference: params.workOrderId,
          payer: {
            email: params.clientEmail || 'cliente@email.com',
            first_name: firstName,
            last_name: lastName,
            identification: {
              type: params.clientDocument.length === 11 ? 'CPF' : 'CNPJ',
              number: params.clientDocument,
            },
          },
        },
      });

      const pointOfInteraction = response.point_of_interaction;
      const transactionData = pointOfInteraction?.transaction_data;
      if (!transactionData) {
        throw new Error('Retorno da transação Pix não continha os dados do QR Code.');
      }

      return {
        paymentId: String(response.id),
        status: response.status || 'pending',
        qrCode: transactionData.qr_code || '',
        qrCodeBase64: transactionData.qr_code_base64 || '',
        ticketUrl: transactionData.ticket_url || '',
      };
    } catch (error: any) {
      this.logger.error(`Erro ao criar pagamento Pix no Mercado Pago: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Falha na comunicação com o gateway de pagamento.');
    }
  }

  async getPaymentDetails(paymentId: string) {
    try {
      return await this.payment.get({ id: paymentId });
    } catch (error: any) {
      this.logger.error(`Erro ao consultar pagamento ${paymentId}: ${error.message}`);
      throw new InternalServerErrorException('Não foi possível verificar os detalhes do pagamento no gateway.');
    }
  }
}
