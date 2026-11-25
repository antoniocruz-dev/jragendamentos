import { Injectable, Logger } from '@nestjs/common';

export interface WhatsappResult {
  sent: boolean;
  /** Motivo quando não enviou (sem expor dados) */
  reason?: string;
}

/**
 * Envio de mensagens pela API oficial do WhatsApp (Meta Cloud API).
 *
 * Variáveis de ambiente:
 * - WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID: obrigatórias para enviar;
 * - WHATSAPP_TEMPLATE_NAME (recomendado): modelo aprovado na Meta com 3 variáveis no corpo
 *   ({{1}} código, {{2}} senha, {{3}} link). Sem modelo, envia texto livre, que a Meta só entrega
 *   se o cliente falou com a oficina nas últimas 24 h;
 * - WHATSAPP_TEMPLATE_LANG (padrão pt_BR).
 * Sem configuração, nada é enviado e a resposta informa isso (a equipe vê o código em Clientes/Equipe).
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  isConfigured() {
    return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  }

  /** Credenciais do primeiro acesso: código de 4 dígitos, senha cadastrada e link de acesso. */
  async sendCredentials(whatsapp: string, data: { name: string; accessCode: string; password: string; link: string }): Promise<WhatsappResult> {
    const text =
      `Olá, ${data.name}! Seu acesso à JR Garage Center está pronto.\n\n` +
      `Código de acesso: ${data.accessCode}\nSenha: ${data.password}\n\n` +
      `Entre em: ${data.link}\n\nNão compartilhe estes dados.`;
    const template = process.env.WHATSAPP_TEMPLATE_NAME;
    return this.send(
      whatsapp,
      template
        ? {
            type: 'template',
            template: {
              name: template,
              language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR' },
              components: [
                {
                  type: 'body',
                  parameters: [data.accessCode, data.password, data.link].map((t) => ({ type: 'text', text: t })),
                },
              ],
            },
          }
        : { type: 'text', text: { preview_url: false, body: text } },
    );
  }

  private async send(whatsapp: string, message: Record<string, unknown>): Promise<WhatsappResult> {
    if (!this.isConfigured()) return { sent: false, reason: 'not_configured' };
    const version = process.env.WHATSAPP_API_VERSION || 'v21.0';
    const url = `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: `55${whatsapp}`, ...message }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        // Não registra o corpo enviado (contém a senha)
        this.logger.warn(`WhatsApp recusou o envio (HTTP ${res.status}).`);
        return { sent: false, reason: 'provider_error' };
      }
      return { sent: true };
    } catch {
      this.logger.warn('Falha de rede ao enviar WhatsApp.');
      return { sent: false, reason: 'network_error' };
    }
  }
}
