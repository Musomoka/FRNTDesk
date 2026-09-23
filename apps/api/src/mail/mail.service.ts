import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../config/env.schema.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Outbound email. SMTP locally (Mailpit on :1025, where nothing leaves the
 * machine) and Resend in production, chosen by MAIL_TRANSPORT.
 *
 * A send that fails is logged and swallowed rather than thrown: an invitation
 * row that exists with an email nobody received is recoverable — the host can
 * resend — whereas failing the request would roll back an invite the host
 * believes they sent.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    if (this.config.get('MAIL_TRANSPORT', { infer: true }) !== 'smtp') return;

    this.transporter = createTransport({
      host: this.config.get('SMTP_HOST', { infer: true }),
      port: this.config.get('SMTP_PORT', { infer: true }),
      secure: this.config.get('SMTP_SECURE', { infer: true }),
      ...(this.config.get('SMTP_USER', { infer: true })
        ? {
            auth: {
              user: this.config.get('SMTP_USER', { infer: true }),
              pass: this.config.get('SMTP_PASS', { infer: true }),
            },
          }
        : {}),
    });
  }

  async send(message: MailMessage): Promise<void> {
    const from = this.config.get('MAIL_FROM', { infer: true });

    try {
      if (this.transporter) {
        await this.transporter.sendMail({ from, ...message });
      } else {
        await this.sendViaResend(from, message);
      }
      this.logger.log(`Sent "${message.subject}" to ${message.to}`);
    } catch (error) {
      this.logger.error(`Could not send "${message.subject}" to ${message.to}`, error);
    }
  }

  private async sendViaResend(from: string, message: MailMessage): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.get('RESEND_API_KEY', { infer: true })}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend rejected the message (${response.status}).`);
    }
  }
}
