import { Module } from '@nestjs/common';
import { FinancialModule } from '../financial/financial.module.js';
import { CronController } from './cron.controller.js';
import { PayablesReminderService } from './payables-reminder.service.js';

/** Notificações automáticas (lembrete de contas a pagar por WhatsApp, via Vercel Cron). */
@Module({
  imports: [FinancialModule],
  controllers: [CronController],
  providers: [PayablesReminderService],
})
export class NotificationsModule {}
