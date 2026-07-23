import { of, throwError } from "rxjs";
import { GroqService } from "./groq.service";

describe("GroqService provider failover", () => {
  it("switches from a rate-limited Groq request to Gemini", async () => {
    const http = {
      post: jest.fn()
        .mockReturnValueOnce(throwError(() => Object.assign(new Error("rate limited"), { response: { status: 429 } })))
        .mockReturnValueOnce(of({ data: { candidates: [{ content: { parts: [{ text: "Gemini fallback answer" }] } }] } })),
    };
    const values: Record<string, string> = {
      GROQ_API_KEY: "groq-key",
      GEMINI_API_KEY: "gemini-key",
      GEMINI_MODEL: "gemini-test",
    };
    const service = new GroqService(http as any, { get: (key: string, fallback?: string) => values[key] || fallback } as any);

    await expect(service.answer("What needs review?", { portfolioSummary: {} })).resolves.toMatchObject({
      body: "Gemini fallback answer",
      generatedBy: "gemini:gemini-test",
    });
    expect(http.post).toHaveBeenCalledTimes(2);
    expect(String(http.post.mock.calls[0][0])).toContain("api.groq.com");
    expect(String(http.post.mock.calls[1][0])).toContain("generativelanguage.googleapis.com");
  });
});
