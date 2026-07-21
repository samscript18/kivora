import { HttpService } from "@nestjs/axios";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AxiosError } from "axios";
import { firstValueFrom } from "rxjs";

type GroqResponse = { choices?: Array<{ message?: { content?: string } }> };

@Injectable()
export class GroqService {
  private readonly key?: string;
  private readonly model: string;

  constructor(private readonly http: HttpService, config: ConfigService) {
    this.key = config.get<string>("GROQ_API_KEY");
    this.model = config.get<string>("GROQ_MODEL", "llama-3.3-70b-versatile");
  }

  get configured() { return Boolean(this.key); }

  async ownerBrief(input: { owner?: string; listing: string; cause: string; impact: number; action: string }) {
    return this.complete("Write a concise owner update using only supplied facts. Do not invent numbers, claims, or actions.", JSON.stringify(input));
  }

  async executiveReport(input: unknown) {
    return this.complete("Write a concise executive revenue report from only the supplied JSON. Clearly label estimates, call out priorities, and never invent metrics.", JSON.stringify(input));
  }

  async report(type: "executive" | "portfolio" | "owner" | "revenue", input: unknown) {
    const audience = type === "owner" ? "a property owner" : type === "executive" ? "an executive leadership team" : "a revenue management team";
    return this.complete(`Write a concise ${type} report for ${audience} using only the supplied JSON. Clearly distinguish measured values from estimates, include next actions, and never invent metrics.`, JSON.stringify(input));
  }

  async answer(question: string, context: unknown) {
    return this.complete("You are Kivora, a revenue operations assistant. Answer only from the supplied live-data context. Distinguish measured values from estimates. If the context cannot answer, say so.", JSON.stringify({ question, context }));
  }

  private async complete(system: string, content: string) {
    if (!this.key) throw new ServiceUnavailableException("Groq is not configured");
    try {
      const response = await firstValueFrom(this.http.post<GroqResponse>(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: this.model,
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            { role: "user", content },
          ],
        },
        { headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" } },
      ));
      const body = response.data.choices?.[0]?.message?.content?.trim();
      if (!body) throw new ServiceUnavailableException("Groq returned an empty response");
      return { body, generatedBy: this.model, grounded: true };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const status = (error as AxiosError).response?.status;
      throw new ServiceUnavailableException(`Groq request failed${status ? ` (${status})` : ""}`);
    }
  }

  capabilities() { return { configured: this.configured, provider: "groq", model: this.model, mode: this.configured ? "live" : "disabled" }; }
}
