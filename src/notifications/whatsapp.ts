import { Logger } from '@nestjs/common';

/**
 * Envio de WhatsApp atrás de uma interface: o provedor (WhatsApp Cloud API da Meta, Z-API,
 * Twilio...) ainda não foi escolhido. Enquanto `WHATSAPP_PROVIDER` não estiver definido, o envio
 * fica DESLIGADO (NoopWhatsAppSender) e nada sai do sistema.
 *
 * Para ligar: implemente um sender para o provedor escolhido (POST na API dele com
 * `WHATSAPP_TOKEN`), registre-o em `createWhatsAppSender` e defina as variáveis na Vercel.
 */
export interface WhatsAppSender {
  /** false = envio desligado (sem provedor configurado) */
  readonly enabled: boolean;
  /** `to`: número com DDI, só dígitos (ex.: 5594991234567) */
  send(to: string, text: string): Promise<void>;
}

export class NoopWhatsAppSender implements WhatsAppSender {
  readonly enabled = false;
  private readonly logger = new Logger('WhatsApp');

  send(): Promise<void> {
    // Não registra o número nem o texto (dados pessoais/financeiros): só que a mensagem não saiu
    this.logger.log('Envio de WhatsApp desligado (WHATSAPP_PROVIDER não definido); mensagem não enviada.');
    return Promise.resolve();
  }
}

export function createWhatsAppSender(env: NodeJS.ProcessEnv = process.env): WhatsAppSender {
  const provider = (env.WHATSAPP_PROVIDER ?? '').trim().toLowerCase();
  switch (provider) {
    // case 'meta': return new MetaCloudWhatsAppSender(env.WHATSAPP_TOKEN, env.WHATSAPP_PHONE_NUMBER_ID);
    // case 'zapi': return new ZApiWhatsAppSender(env.WHATSAPP_TOKEN, ...);
    case '':
      return new NoopWhatsAppSender();
    default:
      new Logger('WhatsApp').warn(`Provedor de WhatsApp "${provider}" não implementado; envio desligado.`);
      return new NoopWhatsAppSender();
  }
}
