import { InvitationEmailService } from "./invitation-email.service";

describe("InvitationEmailService", () => {
  it("sends the one-time invitation through the configured mail service", async () => {
    const sendMail = jest.fn().mockResolvedValue({ provider: "smtp", messageId: "email_123" });
    const config = { get: jest.fn((key: string) => ({ FRONTEND_URL: "https://kivora.test" })[key]) };
    const service = new InvitationEmailService({ sendMail } as never, config as never);

    await expect(service.sendInvitation({ invitationId: "invite_123", email: "manager@example.com", organizationName: "Northstar Rentals", inviterName: "Ada", role: "revenue_manager", token: "private-token", expiresAt: new Date("2026-07-29T12:00:00Z") })).resolves.toEqual({ provider: "smtp", messageId: "email_123" });

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: "manager@example.com",
      subject: expect.stringContaining("Northstar Rentals"),
      template: "team-invitation",
      context: expect.objectContaining({
        invitationUrl: "https://kivora.test/invite?token=private-token",
        role: "Revenue Manager",
      }),
    }));
  });
});
