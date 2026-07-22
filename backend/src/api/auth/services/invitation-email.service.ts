import { HttpService } from "@nestjs/axios";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AxiosError } from "axios";
import { firstValueFrom } from "rxjs";

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
  private readonly apiKey?: string;
  private readonly from: string;
  private readonly frontendUrl: string;

  constructor(private readonly http: HttpService, config: ConfigService) {
    this.apiKey = config.get<string>("RESEND_API_KEY");
    this.from = config.get<string>("RESEND_FROM_EMAIL") || "Kivora <onboarding@resend.dev>";
    this.frontendUrl = (config.get<string>("FRONTEND_URL") || "http://localhost:3000").split(",")[0].trim().replace(/\/$/, "");
  }

  async sendInvitation(input: InvitationEmail) {
    if (!this.apiKey) throw new ServiceUnavailableException("Invitation email delivery is not configured");
    const invitationUrl = `${this.frontendUrl}/invite?token=${encodeURIComponent(input.token)}`;
    const organization = this.escape(input.organizationName);
    const inviter = this.escape(input.inviterName);
    const role = this.escape(this.humanize(input.role));
    const expires = input.expiresAt.toUTCString();
    try {
      const response = await firstValueFrom(this.http.post<{ id: string }>("https://api.resend.com/emails", {
        from: this.from,
        to: [input.email],
        subject: `${input.inviterName} invited you to ${input.organizationName} on Kivora`,
        html: `<!doctype html><html><body style="margin:0;background:#080809;color:#f1f1f3;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:48px 20px"><div style="border:1px solid rgba(255,255,255,.1);border-radius:24px;background:#0f0f12;padding:36px"><div style="color:#ff6b52;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">Kivora Revenue Operations</div><h1 style="margin:18px 0 12px;font-size:30px;line-height:1.15">Join ${organization}</h1><p style="margin:0;color:#a8a8b3;line-height:1.7">${inviter} invited you to collaborate as <strong style="color:#fff">${role}</strong>. Use the secure button below and sign in with <strong style="color:#fff">${this.escape(input.email)}</strong>.</p><a href="${this.escape(invitationUrl)}" style="display:inline-block;margin-top:28px;padding:14px 22px;border-radius:999px;background:#e8442a;color:#fff;text-decoration:none;font-weight:700">Accept invitation</a><p style="margin:24px 0 0;color:#777783;font-size:12px;line-height:1.6">This single-use invitation expires ${expires}. If you were not expecting it, you can safely ignore this email.</p></div></div></body></html>`,
        text: `${input.inviterName} invited you to join ${input.organizationName} on Kivora as ${this.humanize(input.role)}. Accept the single-use invitation: ${invitationUrl}. It expires ${expires}.`,
      }, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `kivora-invitation-${input.invitationId}`,
        },
      }));
      if (!response.data?.id) throw new Error("Resend did not return a delivery identifier");
      return { provider: "resend", messageId: response.data.id };
    } catch (error) {
      const message = error instanceof AxiosError
        ? String((error.response?.data as { message?: string } | undefined)?.message || error.message)
        : error instanceof Error ? error.message : "Unknown email delivery error";
      throw new ServiceUnavailableException(`Invitation email could not be sent: ${message}`);
    }
  }

  private humanize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
  private escape(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!); }
}
