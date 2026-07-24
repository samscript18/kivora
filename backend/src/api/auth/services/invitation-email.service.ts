import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MailService } from "../../../shared/mail/mail.service";

type InvitationEmail = {
  invitationId: string;
  email: string;
  organizationName: string;
  inviterName: string;
  role: string;
  token: string;
  expiresAt: Date;
};

@Injectable()
export class InvitationEmailService {
  private readonly frontendUrl: string;

  constructor(private readonly mail: MailService, config: ConfigService) {
    this.frontendUrl = (config.get<string>("FRONTEND_URL") || "http://localhost:3000").split(",")[0].trim().replace(/\/$/, "");
  }

  invitationUrl(token: string) {
    return `${this.frontendUrl}/invite?token=${encodeURIComponent(token)}`;
  }

  async sendInvitation(input: InvitationEmail) {
    const invitationUrl = this.invitationUrl(input.token);
    return this.mail.sendMail({
      to: input.email,
      subject: `${input.inviterName} invited you to ${input.organizationName} on Kivora`,
      template: "team-invitation",
      context: { organizationName: input.organizationName, inviterName: input.inviterName, role: this.humanize(input.role), email: input.email, invitationUrl, expiresAt: input.expiresAt.toUTCString() },
    });
  }

  private humanize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
}
