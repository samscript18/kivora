import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MailerService } from "@nestjs-modules/mailer";
import { SendMail } from "./interfaces";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly mailer: MailerService, private readonly config: ConfigService) {}

  async sendMail(input: SendMail) {
    if (!this.config.get<string>("MAILER_SERVICE") || !this.config.get<string>("MAILER_USER") || !this.config.get<string>("MAILER_PASS") || !this.config.get<string>("MAILER_FROM_EMAIL")) {
      throw new ServiceUnavailableException("Email delivery is not configured");
    }
    try {
      const result = await this.mailer.sendMail({
        from: this.config.get<string>("MAILER_FROM_EMAIL"),
        to: input.to,
        subject: input.subject,
        template: input.template,
        context: input.context,
      });
      return { provider: "smtp", messageId: result.messageId || result.response || "accepted" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown SMTP delivery error";
      this.logger.error(`Email delivery failed: ${message}`);
      throw new ServiceUnavailableException(`Email could not be sent: ${message}`);
    }
  }
}
