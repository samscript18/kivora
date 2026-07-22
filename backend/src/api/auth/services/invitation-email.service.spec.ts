import { of } from "rxjs";
import { InvitationEmailService } from "./invitation-email.service";

describe("InvitationEmailService", () => {
  it("sends the one-time invitation through Resend with idempotency", async () => {
    const post = jest.fn().mockReturnValue(of({ data: { id: "email_123" } }));
    const config = { get: jest.fn((key: string) => ({ RESEND_API_KEY: "re_test", RESEND_FROM_EMAIL: "Kivora <team@kivora.test>", FRONTEND_URL: "https://kivora.test" })[key]) };
    const service = new InvitationEmailService({ post } as never, config as never);

    await expect(service.sendInvitation({ invitationId: "invite_123", email: "manager@example.com", organizationName: "Northstar Rentals", inviterName: "Ada", role: "revenue_manager", token: "private-token", expiresAt: new Date("2026-07-29T12:00:00Z") })).resolves.toEqual({ provider: "resend", messageId: "email_123" });

    expect(post).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({
      from: "Kivora <team@kivora.test>",
      to: ["manager@example.com"],
      subject: expect.stringContaining("Northstar Rentals"),
      html: expect.stringContaining("private-token"),
    }), expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": "kivora-invitation-invite_123" }) }));
  });
});
