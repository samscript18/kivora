import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readFileSync } from "fs";
import * as Handlebars from "handlebars";
import nodemailer, { type Transporter } from "nodemailer";
import { join } from "path";
import { SendMail } from "./interfaces";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly templates = new Map<string, Handlebars.TemplateDelegate>();
  private readonly transporter?: Transporter;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(private readonly config: ConfigService) {
    const host = config.get<string>("MAIL_HOST");
    const user = config.get<string>("MAIL_USER");
    const password = config.get<string>("MAIL_PASSWORD");
    this.fromEmail = config.get<string>("MAIL_FROM_EMAIL", "");
    this.fromName = config.get<string>("MAIL_FROM_NAME", "Kivora");

    if (host && user && password && this.fromEmail) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(config.get<string>("MAIL_PORT", "587")),
        secure: config.get<string>("MAIL_SECURE", "false") === "true",
        auth: { user, pass: password },
      });
    }
  }

  get provider() { return "smtp"; }

  async sendMail(input: SendMail) {
    if (!this.transporter) throw new ServiceUnavailableException("Email delivery is not configured");

    try {
      const result = await this.transporter.sendMail({
        from: { name: this.fromName, address: this.fromEmail },
        to: input.to,
        subject: input.subject,
        ...(input.text ? { text: input.text } : {}),
        html: this.render(input.template, input.context),
      });
      return { provider: "smtp", messageId: result.messageId || result.response || "accepted" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown SMTP delivery error";
      this.logger.error(`Email delivery failed: ${message}`);
      throw new ServiceUnavailableException(`Email could not be sent: ${message}`);
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
}
