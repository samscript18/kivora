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
    if (!this.key) throw new ServiceUnavailableException("Groq is not configured");
    try {
      const response = await firstValueFrom(this.http.post<GroqResponse>(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: this.model,
          temperature: 0.2,
          messages: [
            { role: "system", content: "Write a concise owner update using only supplied facts. Do not invent numbers, claims, or actions." },
            { role: "user", content: JSON.stringify(input) },
          ],
        },
        { headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" } },
      ));
      const body = response.data.choices?.[0]?.message?.content?.trim();
      if (!body) throw new ServiceUnavailableException("Groq returned an empty response");
      return { body, generatedBy: this.model };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const status = (error as AxiosError).response?.status;
      throw new ServiceUnavailableException(`Groq request failed${status ? ` (${status})` : ""}`);
    }
  }

  capabilities() { return { configured: this.configured, provider: "groq", model: this.model, mode: this.configured ? "live" : "disabled" }; }
}
