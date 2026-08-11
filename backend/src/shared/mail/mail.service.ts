import { HttpService } from "@nestjs/axios";
import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MailerService } from "@nestjs-modules/mailer";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import * as Handlebars from "handlebars";
import { join } from "path";
import { firstValueFrom } from "rxjs";
import { SendMail } from "./interfaces";

type BrevoResponse = { messageId?: string; messageIds?: string[] };

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly templates = new Map<string, Handlebars.TemplateDelegate>();

  constructor(
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

  get provider() { return this.config.get<string>("BREVO_API_KEY") ? "brevo" : "smtp"; }

  async sendMail(input: SendMail) {
    if (this.config.get<string>("BREVO_API_KEY")) return this.sendWithBrevo(input);
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

  private async sendWithBrevo(input: SendMail) {
    const apiKey = this.config.get<string>("BREVO_API_KEY");
    const senderEmail = this.config.get<string>("BREVO_SENDER_EMAIL");
    if (!apiKey || !senderEmail) throw new ServiceUnavailableException("Brevo email delivery is not configured");
    try {
      const response = await firstValueFrom(this.http.post<BrevoResponse>(
        `${this.config.get<string>("BREVO_API_URL", "https://api.brevo.com/v3").replace(/\/$/, "")}/smtp/email`,
        {
          sender: { email: senderEmail, name: this.config.get<string>("BREVO_SENDER_NAME", "Kivora") },
          to: (Array.isArray(input.to) ? input.to : [input.to]).map((email) => ({ email })),
          subject: input.subject,
          htmlContent: this.render(input.template, input.context),
          ...(input.idempotencyKey ? { headers: { idempotencyKey: this.uuid(input.idempotencyKey) } } : {}),
        },
        { headers: { "api-key": apiKey, accept: "application/json", "content-type": "application/json" } },
      ));
      const messageId = response.data.messageId || response.data.messageIds?.[0];
      if (!messageId) throw new Error("Brevo accepted the request without returning a message ID");
      return { provider: "brevo", messageId };
    } catch (error) {
      const responseMessage = this.brevoError(error);
      this.logger.error(`Brevo email delivery failed: ${responseMessage}`);
      throw new ServiceUnavailableException(`Email could not be sent: ${responseMessage}`);
    }
  }

  private render(template: string, context: Record<string, unknown>) {
    let compiled = this.templates.get(template);
    if (!compiled) {
      compiled = Handlebars.compile(readFileSync(join(__dirname, "templates", `${template}.hbs`), "utf8"), { strict: true });
      this.templates.set(template, compiled);
    }
    return compiled(context);
  }

  private uuid(value: string) {
    const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
    hex[12] = "5";
    hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
    const joined = hex.join("");
    return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
  }

  private brevoError(error: unknown) {
    if (typeof error === "object" && error && "response" in error) {
      const response = (error as { response?: { data?: { message?: string; code?: string } } }).response;
      return response?.data?.message || response?.data?.code || "Brevo rejected the email request";
    }
    return error instanceof Error ? error.message : "Unknown Brevo delivery error";
  }
}
