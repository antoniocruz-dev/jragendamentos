import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Public } from '../auth/decorators/public.decorator.js';
import { PayablesReminderService } from './payables-reminder.service.js';

/**
 * Rotas chamadas pelo Vercel Cron (vercel.json → "crons"). A Vercel envia
 * `Authorization: Bearer ${CRON_SECRET}`; sem CRON_SECRET definido, a rota sempre recusa.
 */
@Controller('cron')
export class CronController {
  constructor(private readonly reminder: PayablesReminderService) {}

  @Public()
  @Get('payables-reminder')
  payablesReminder(@Headers('authorization') authorization?: string) {
    const secret = process.env.CRON_SECRET;
    const expected = Buffer.from(`Bearer ${secret ?? ''}`);
    const got = Buffer.from(authorization ?? '');
    if (!secret || got.length !== expected.length || !timingSafeEqual(got, expected)) {
      throw new UnauthorizedException();
    }
    return this.reminder.run();
  }
}
