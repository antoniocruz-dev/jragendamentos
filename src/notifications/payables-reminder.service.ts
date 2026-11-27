import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { FinancialService } from '../financial/financial.service.js';
import { normalizeWhatsapp } from '../common/roles.js';
import { D, ZERO, money } from '../financial/financial-calc.js';
import { createWhatsAppSender, type WhatsAppSender } from './whatsapp.js';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Lembrete diário (Vercel Cron, 07:00 em Parauapebas) das contas que vencem hoje, por WhatsApp,
 * para os números de `WHATSAPP_REMINDER_PHONES` (separados por vírgula). Os números ficam só na
 * variável de ambiente, nunca no código nem nos logs.
 */
@Injectable()
export class PayablesReminderService {
  private readonly logger = new Logger('PayablesReminder');
  private readonly sender: WhatsAppSender = createWhatsAppSender();

  constructor(
    private readonly prisma: PrismaService,
    private readonly financial: FinancialService,
  ) {}

  private recipients() {
    return (process.env.WHATSAPP_REMINDER_PHONES ?? '')
      .split(',')
      .map((p) => normalizeWhatsapp(p))
      .filter((p): p is string => !!p)
      .map((p) => `55${p}`);
  }

  async run() {
    const { today, expenses } = await this.financial.payables();
    const dueToday = expenses.filter((e) => e.dueDate === today);
    if (dueToday.length === 0) return { sent: 0, dueToday: 0, disabled: !this.sender.enabled };

    const recipients = this.recipients();
    if (!this.sender.enabled || recipients.length === 0) {
      return { sent: 0, dueToday: dueToday.length, disabled: true };
    }

    // Idempotência: uma vez por dia, mesmo que o cron dispare de novo (chave diária na tabela de limites)
    const key = `payables-reminder:${today}`;
    const inserted = await this.prisma.$queryRaw<{ key: string }[]>`
      INSERT INTO "auth_rate_limits" ("key", "window_start", "count") VALUES (${key}, now(), 1)
      ON CONFLICT ("key") DO NOTHING RETURNING "key"`;
    if (inserted.length === 0) return { sent: 0, dueToday: dueToday.length, alreadySent: true };

    const [, m, d] = today.split('-');
    const total = money(dueToday.reduce((acc, e) => acc.add(D(e.amount)), ZERO)); // soma em Decimal
    const text = [
      `JR Garage Center: contas que vencem hoje (${d}/${m})`,
      ...dueToday.map((e) => `• ${e.description}: ${brl.format(e.amount)}`),
      `Total: ${brl.format(total)}`,
      'Dê baixa em Financeiro → Despesas depois de pagar.',
    ].join('\n');

    let sent = 0;
    for (const to of recipients) {
      try {
        await this.sender.send(to, text);
        sent++;
      } catch (err) {
        this.logger.error(`Falha ao enviar lembrete por WhatsApp: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    // Nenhum envio deu certo: libera a chave para uma nova tentativa no mesmo dia
    if (sent === 0) await this.prisma.$executeRaw`DELETE FROM "auth_rate_limits" WHERE "key" = ${key}`;
    return { sent, dueToday: dueToday.length };
  }
}
