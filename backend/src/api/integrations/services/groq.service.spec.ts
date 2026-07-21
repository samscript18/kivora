import { of } from "rxjs";
import { GroqService } from "./groq.service";

describe("GroqService assistant grounding", () => {
  it("instructs the model to treat zero risk as measured data", async () => {
    const http = {
      post: jest.fn(() => of({ data: { choices: [{ message: { content: "No active revenue incident was detected." } }] } })),
    };
    const config = {
      get: jest.fn((key: string, fallback?: string) => key === "GROQ_API_KEY" ? "test-key" : fallback),
    };
    const service = new GroqService(http as never, config as never);

    await service.answer("What is my biggest revenue risk?", {
      revenueRisk: { activeIncidentCount: 0, totalRevenueAtRisk: 0, largestIncident: null },
    });

    const request = (http.post.mock.calls as unknown as Array<[
      string,
      { messages: Array<{ role: string; content: string }> },
    ]>)[0][1];
    expect(request.messages[0].content).toContain("Treat zero as a valid measured value");
    expect(request.messages[0].content).toContain("If largestIncident is null");
  });
});
