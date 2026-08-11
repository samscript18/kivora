import { of, throwError } from "rxjs";
import { MailService } from "./mail.service";

const input = {
  to: "manager@example.com",
  subject: "Join Northstar Rentals",
  template: "team-invitation",
  idempotencyKey: "kivora-invitation-invite_123",
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
  it("sends rendered invitations through Brevo with a stable idempotency key", async () => {
    const post = jest.fn().mockReturnValue(of({ data: { messageId: "brevo-message-123" } }));
    const sendMail = jest.fn();
    const values: Record<string, string> = {
      BREVO_API_KEY: "xkeysib-test",
      BREVO_SENDER_EMAIL: "team@kivora.test",
      BREVO_SENDER_NAME: "Kivora Team",
    };
    const config = { get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback) };
    const service = new MailService({ sendMail } as never, config as never, { post } as never);

    await expect(service.sendMail(input)).resolves.toEqual({ provider: "brevo", messageId: "brevo-message-123" });

    expect(sendMail).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/smtp/email",
      expect.objectContaining({
        sender: { email: "team@kivora.test", name: "Kivora Team" },
        to: [{ email: "manager@example.com" }],
        subject: "Join Northstar Rentals",
        htmlContent: expect.stringContaining("https://kivora.test/invite?token&#x3D;private-token"),
        headers: { idempotencyKey: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/) },
      }),
      { headers: { "api-key": "xkeysib-test", accept: "application/json", "content-type": "application/json" } },
    );
  });

  it("uses the legacy SMTP transport when Brevo is not configured", async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: "smtp-message-123" });
    const values: Record<string, string> = {
      MAILER_SERVICE: "smtp-provider",
      MAILER_USER: "user",
      MAILER_PASS: "pass",
      MAILER_FROM_EMAIL: "Kivora <team@kivora.test>",
    };
    const config = { get: jest.fn((key: string) => values[key]) };
    const service = new MailService({ sendMail } as never, config as never, { post: jest.fn() } as never);

    await expect(service.sendMail(input)).resolves.toEqual({ provider: "smtp", messageId: "smtp-message-123" });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: input.to, template: input.template }));
  });

  it("surfaces Brevo's API error without exposing the API key", async () => {
    const post = jest.fn().mockReturnValue(throwError(() => ({ response: { data: { message: "sender not verified" } } })));
    const values: Record<string, string> = { BREVO_API_KEY: "secret-key", BREVO_SENDER_EMAIL: "team@kivora.test" };
    const config = { get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback) };
    const service = new MailService({ sendMail: jest.fn() } as never, config as never, { post } as never);

    await expect(service.sendMail(input)).rejects.toThrow("Email could not be sent: sender not verified");
  });
});
