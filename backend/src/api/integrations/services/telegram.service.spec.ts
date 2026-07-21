import { of } from "rxjs";
import { TelegramService } from "./telegram.service";

const query = (value: unknown) => ({ lean: jest.fn().mockResolvedValue(value) });

describe("TelegramService", () => {
  const http = {
    get: jest.fn(() => of({ data: { ok: true, result: { username: "KivoraBot" } } })),
    post: jest.fn(() => of({ data: { ok: true } })),
  };
  const connections = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({}),
  };
  const links = { deleteMany: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({}), findOneAndDelete: jest.fn() };
  const users = { findById: jest.fn() };
  const config = { get: jest.fn((key: string) => ({ TELEGRAM_BOT_TOKEN: "telegram-token", TELEGRAM_LINK_SECRET: "a-secure-link-secret-that-is-long-enough", FRONTEND_URL: "https://kivora.app" })[key]) };
  const service = new TelegramService(http as never, config as never, connections as never, links as never, users as never);

  beforeEach(() => jest.clearAllMocks());

  it("creates a short-lived signed Telegram-to-web intent", async () => {
    await service.createLinkIntent({ id: 42, username: "alex" }, { id: 99, type: "private" });
    const stored = links.create.mock.calls[0][0];
    expect(stored).toMatchObject({ chatId: "99", telegramUserId: "42", username: "alex" });
    const sendCall = http.post.mock.calls[0] as unknown as [string, any];
    const connectUrl = sendCall[1].reply_markup.inline_keyboard[0][0].url;
    expect(new URL(connectUrl).searchParams.get("telegramIntent")).toBe(stored.intentId);
    expect(new URL(connectUrl).searchParams.get("telegramSignature")).toBeTruthy();
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("binds the Telegram chat and sender identity to the Kivora user", async () => {
    links.findOneAndDelete.mockReturnValue(query({ intentId: "intent", chatId: "99", telegramUserId: "42", username: "alex", firstName: "Alex", chatType: "private" }));
    connections.findOne.mockReturnValue(query(null));
    connections.findOneAndUpdate.mockReturnValue(query({ username: "alex", chatType: "private" }));
    const signature = (service as any).signature("intent");
    await service.consumeLinkIntent("507f1f77bcf86cd799439011", "intent", signature);
    expect(connections.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: expect.anything() },
      { $set: expect.objectContaining({ chatId: "99", telegramUserId: "42", username: "alex", enabled: true }) },
      { upsert: true, returnDocument: "after" },
    );
    expect(http.post).toHaveBeenCalledWith(expect.stringContaining("sendMessage"), expect.objectContaining({ chat_id: "99" }));
  });
});
