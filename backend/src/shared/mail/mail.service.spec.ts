import nodemailer from "nodemailer";
import { MailService } from "./mail.service";

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

const input = {
  to: "manager@example.com",
  subject: "Join Northstar Rentals",
  text: "Ada invited you to Northstar Rentals. Accept: https://kivora.test/invite?token=private-token",
  template: "team-invitation",
  context: {
    organizationName: "Northstar Rentals",
    inviterName: "Ada",
    role: "Revenue Manager",
    email: "manager@example.com",
    invitationUrl: "https://kivora.test/invite?token=private-token",
    expiresAt: "Tue, 18 Aug 2026 12:00:00 GMT",
  },
};

describe("MailService", () => {
  const values: Record<string, string> = {
    MAIL_HOST: "smtp-relay.brevo.com",
    MAIL_PORT: "587",
    MAIL_SECURE: "false",
    MAIL_USER: "brevo-smtp-login",
    MAIL_PASSWORD: "brevo-smtp-key",
    MAIL_FROM_EMAIL: "team@kivora.test",
    MAIL_FROM_NAME: "Kivora Team",
  };

  beforeEach(() => jest.clearAllMocks());

  it("uses Verith's Nodemailer SMTP configuration to send invitations", async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: "smtp-message-123" });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    const config = { get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback) };
    const service = new MailService(config as never);

    await expect(service.sendMail(input)).resolves.toEqual({ provider: "smtp", messageId: "smtp-message-123" });
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: "smtp-relay.brevo.com",
      port: 587,
      secure: false,
      auth: { user: "brevo-smtp-login", pass: "brevo-smtp-key" },
    });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: { name: "Kivora Team", address: "team@kivora.test" },
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: expect.stringContaining("https://kivora.test/invite?token&#x3D;private-token"),
    }));
  });

  it("reports an unconfigured SMTP provider", async () => {
    const config = { get: jest.fn((_key: string, fallback?: string) => fallback) };
    const service = new MailService(config as never);

    await expect(service.sendMail(input)).rejects.toThrow("Email delivery is not configured");
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it("surfaces SMTP delivery errors without exposing credentials", async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error("sender not verified"));
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    const config = { get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback) };
    const service = new MailService(config as never);

    await expect(service.sendMail(input)).rejects.toThrow("Email could not be sent: sender not verified");
  });
});
