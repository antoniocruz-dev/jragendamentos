import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { randomUUID } from 'node:crypto';

export interface PixPaymentResponse {
  paymentId: string;
  status: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
}

/** Erros transitórios (timeout, rede, 429, 5xx) merecem nova tentativa; 4xx de validação não. */
function isTransient(error: unknown) {
  const e = error as { status?: number; statusCode?: number; code?: string; name?: string; message?: string; cause?: { status?: number } };
  const status = e?.status ?? e?.statusCode ?? e?.cause?.status;
  if (typeof status === 'number') return status === 429 || status >= 500;
  return /timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket|network|AbortError/i.test(`${e?.code} ${e?.name} ${e?.message}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class MercadoPagoService {
  /** Até 3 tentativas com espera exponencial (500 ms, 1 s) entre elas. */
  private async withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown;
    for (let i = 1; i <= attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (i === attempts || !isTransient(err)) break;
        const wait = 500 * 2 ** (i - 1);
        this.logger.warn(`${label}: falha transitória (tentativa ${i}/${attempts}), nova tentativa em ${wait} ms`);
        await sleep(wait);
      }
    }
    throw lastError;
  }

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
    clientDocument: string | null;
  }): Promise<PixPaymentResponse> {
    try {
      // API_PUBLIC_URL = origem pública (ex.: https://seu-app.vercel.app), sem /api no final
      const webhookUrl = `${process.env.API_PUBLIC_URL}/api/payments/webhook`;
      const nameParts = params.clientName.trim().split(' ');
      const firstName = nameParts[0] || 'Cliente';
      const lastName = nameParts.slice(1).join(' ') || 'Oficina';

      // Mesma chave em todas as tentativas desta cobrança (um novo pedido de Pix gera outra chave)
      const idempotencyKey = randomUUID();
      const response = await this.withRetry('Criar Pix', () => this.payment.create({
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
            // Cliente sem CPF/CNPJ cadastrado: o Pix sai sem identificação do pagador
            ...(params.clientDocument
              ? { identification: { type: params.clientDocument.length === 11 ? 'CPF' : 'CNPJ', number: params.clientDocument } }
              : {}),
          },
        },
        // Mesma chave nas novas tentativas: o Mercado Pago não cria o Pix em dobro
        requestOptions: { idempotencyKey },
      }));

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
      return await this.withRetry('Consultar pagamento', () => this.payment.get({ id: paymentId }));
    } catch (error: any) {
      this.logger.error(`Erro ao consultar pagamento ${paymentId}: ${error.message}`);
      throw new InternalServerErrorException('Não foi possível verificar os detalhes do pagamento no gateway.');
    }
  }
}
