import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { isValidMercadoPagoSignature } from './webhook-signature.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MercadoPagoService } from './providers/mercado-pago.service.js';
import {
  WorkOrderStatus,
  PaymentStatus,
  PaymentGateway,
  TransactionType,
  TransactionStatus,
  PaymentMethod,
  AlertType,
} from '@prisma/client';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadoPagoService: MercadoPagoService,
  ) {}

  /**
   * 1. Gera cobrança Pix para uma OS Concluída ou Aprovada
   */
  async createPixForWorkOrder(workOrderId: string) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        client: true,
      },
    });

    if (!workOrder) {
      throw new NotFoundException('Ordem de Serviço não encontrada.');
    }

    if (workOrder.status === WorkOrderStatus.BILLED) {
      throw new BadRequestException('Esta Ordem de Serviço já se encontra faturada e paga.');
    }

    if (
      workOrder.status !== WorkOrderStatus.COMPLETED &&
      workOrder.status !== WorkOrderStatus.APPROVED
    ) {
      throw new BadRequestException(
        `Cobrança não permitida para OS no status "${workOrder.status}". O status deve ser APPROVED ou COMPLETED.`,
      );
    }

    const amountNumber = Number(workOrder.finalAmount);
    if (amountNumber <= 0) {
      throw new BadRequestException('O valor final da Ordem de Serviço deve ser maior que zero.');
    }

    // Chama o gateway
    const pixResponse = await this.mercadoPagoService.generatePix({
      workOrderId: workOrder.id,
      code: workOrder.code,
      amount: amountNumber,
      clientName: workOrder.client.name,
      clientEmail: workOrder.client.email || 'financeiro@oficina.com.br',
      clientDocument: workOrder.client.document,
    });

    // Registra ou atualiza o log de pagamento associado
    await this.prisma.paymentLog.upsert({
      where: { externalPaymentId: pixResponse.paymentId },
      update: {
        status: PaymentStatus.PENDING,
        payload: pixResponse as any,
      },
      create: {
        workOrderId: workOrder.id,
        externalPaymentId: pixResponse.paymentId,
        gateway: PaymentGateway.MERCADO_PAGO,
        status: PaymentStatus.PENDING,
        payload: pixResponse as any,
      },
    });

    return {
      workOrderId: workOrder.id,
      workOrderCode: workOrder.code,
      finalAmount: workOrder.finalAmount,
      pix: pixResponse,
    };
  }

  /**
   * 2. Processamento Idempotente do Webhook do Mercado Pago
   */
  async handleWebhook(body: any, query: any, headers: { signature?: string; requestId?: string } = {}) {
    // O ID pode vir no query.id, query['data.id'] ou no body.data.id dependendo da versão do webhook
    const paymentId = body?.data?.id || query?.id || query?.['data.id'];
    const action = body?.action || body?.type || query?.topic;

    // Assinatura HMAC obrigatória: sem a chave configurada ou com assinatura inválida, o payload é descartado (401)
    const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    if (!secret) {
      this.logger.error('MERCADO_PAGO_WEBHOOK_SECRET não configurado: webhook recusado.');
      throw new UnauthorizedException('Assinatura do webhook não pode ser validada.');
    }
    const dataId = String(query?.['data.id'] ?? body?.data?.id ?? '');
    if (!isValidMercadoPagoSignature({ secret, signatureHeader: headers.signature, requestId: headers.requestId, dataId })) {
      this.logger.warn(`Webhook com assinatura inválida descartado (payment ${paymentId}).`);
      throw new UnauthorizedException('Assinatura do webhook inválida.');
    }

    this.logger.log(`Webhook recebido - Action: ${action}, PaymentID: ${paymentId}`);

    if (!paymentId) {
      return { received: true, ignored: true, reason: 'Sem payment ID no payload' };
    }

    // Idempotência: pagamento já processado como aprovado não é reprocessado
    const processed = await this.prisma.paymentLog.findUnique({ where: { externalPaymentId: String(paymentId) }, select: { status: true } });
    if (processed?.status === PaymentStatus.APPROVED) {
      return { received: true, already_processed: true };
    }

    // Consulta os detalhes reais no Mercado Pago para evitar adulteração de payload
    const paymentDetails = await this.mercadoPagoService.getPaymentDetails(String(paymentId));

    if (!paymentDetails || !paymentDetails.external_reference) {
      this.logger.warn(`Pagamento ${paymentId} não possui external_reference vinculado a uma OS.`);
      return { received: true, ignored: true };
    }

    const workOrderId = paymentDetails.external_reference;
    const mpStatus = paymentDetails.status; // 'approved', 'pending', 'rejected', etc.

    // Transação Atômica com Idempotência
    return this.prisma.$transaction(async (tx) => {
      const workOrder = await tx.workOrder.findUnique({
        where: { id: workOrderId },
      });

      if (!workOrder) {
        this.logger.error(`OS vinculada ${workOrderId} não encontrada no banco.`);
        return { received: true, error: 'OS não encontrada' };
      }

      // Se já está faturada e o pagamento já foi aprovado, não processa novamente (Idempotência)
      if (workOrder.status === WorkOrderStatus.BILLED && mpStatus === 'approved') {
        this.logger.log(`OS #${workOrder.code} já está faturada. Ignorando evento repetido.`);
        return { received: true, already_processed: true };
      }

      if (mpStatus === 'approved') {
        // 1. Atualiza a OS para BILLED (condicionado: duas notificações simultâneas não faturam duas vezes)
        const billed = await tx.workOrder.updateMany({
          where: { id: workOrderId, status: { in: [WorkOrderStatus.APPROVED, WorkOrderStatus.COMPLETED] } },
          data: {
            status: WorkOrderStatus.BILLED,
            finishedAt: workOrder.finishedAt || new Date(),
            // Fechamento financeiro: valores congelados na data do pagamento
            billedAt: new Date(),
            paymentMethod: PaymentMethod.PIX,
            issRate: (await tx.financialSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } })).issRate,
            commissionRate: workOrder.operatorId
              ? ((await tx.user.findUnique({ where: { id: workOrder.operatorId }, select: { commissionRate: true } }))?.commissionRate ?? null)
              : null,
          },
        });
        if (billed.count !== 1) {
          this.logger.warn(`OS #${workOrder.code} não está em status faturável (${workOrder.status}); pagamento ${paymentId} registrado sem faturar.`);
          await tx.paymentLog.upsert({
            where: { externalPaymentId: String(paymentId) },
            update: { status: PaymentStatus.APPROVED, payload: paymentDetails as any },
            create: { workOrderId: workOrder.id, externalPaymentId: String(paymentId), gateway: PaymentGateway.MERCADO_PAGO, status: PaymentStatus.APPROVED, payload: paymentDetails as any },
          });
          return { received: true, already_processed: true };
        }

        // 2. Lança a entrada automática no fluxo de caixa
        await tx.cashTransaction.create({
          data: {
            workOrderId: workOrder.id,
            type: TransactionType.INCOME,
            category: 'FATURAMENTO_OS',
            amount: workOrder.finalAmount,
            paymentMethod: PaymentMethod.PIX,
            status: TransactionStatus.PAID,
            notes: `Liquidação automática via Mercado Pago (ID: ${paymentId}) para OS #${workOrder.code}`,
            paidAt: new Date(),
          },
        });

        // 3. Registra auditoria no PaymentLog
        await tx.paymentLog.upsert({
          where: { externalPaymentId: String(paymentId) },
          update: {
            status: PaymentStatus.APPROVED,
            payload: paymentDetails as any,
          },
          create: {
            workOrderId: workOrder.id,
            externalPaymentId: String(paymentId),
            gateway: PaymentGateway.MERCADO_PAGO,
            status: PaymentStatus.APPROVED,
            payload: paymentDetails as any,
          },
        });

        this.logger.log(`✅ OS #${workOrder.code} faturada com sucesso via Pix!`);
      } else if (mpStatus === 'rejected') {
        await tx.paymentLog.upsert({
          where: { externalPaymentId: String(paymentId) },
          update: {
            status: PaymentStatus.REJECTED,
            payload: paymentDetails as any,
          },
          create: {
            workOrderId: workOrder.id,
            externalPaymentId: String(paymentId),
            gateway: PaymentGateway.MERCADO_PAGO,
            status: PaymentStatus.REJECTED,
            payload: paymentDetails as any,
          },
        });
        // Avisa a equipe no Dashboard
        await tx.systemAlert.create({
          data: {
            type: AlertType.PAYMENT_REJECTED,
            workOrderId: workOrder.id,
            message: `Pagamento Pix da OS #${workOrder.code} foi recusado pelo Mercado Pago (${paymentDetails.status_detail ?? 'sem detalhe'}). Contate o cliente.`.slice(0, 500),
          },
        });
      }

      return { received: true, status: mpStatus };
    });
  }
}
