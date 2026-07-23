import { HttpService } from "@nestjs/axios";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";

type OpenAiResponse = { choices?: Array<{ message?: { content?: string } }> };
type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
type Completion = { body: string; generatedBy: string; grounded: true };

/**
 * Kivora's provider router. The historic name is retained because it is
 * injected throughout the app, but completion is deliberately not tied to
 * Groq: a provider error hands work to Gemini, then OpenRouter.
 */
@Injectable()
export class GroqService {
  private readonly groqKey?: string;
  private readonly groqModel: string;
  private readonly groqBase: string;
  private readonly geminiKey?: string;
  private readonly geminiModel: string;
  private readonly geminiBase: string;
  private readonly openRouterKey?: string;
  private readonly openRouterModel: string;
  private readonly openRouterBase: string;

  constructor(private readonly http: HttpService, config: ConfigService) {
    this.groqKey = config.get<string>("GROQ_API_KEY");
    this.groqModel = config.get<string>("GROQ_MODEL", "llama-3.3-70b-versatile");
    this.groqBase = config.get<string>("GROQ_BASE_URL", "https://api.groq.com");
    this.geminiKey = config.get<string>("GEMINI_API_KEY");
    this.geminiModel = config.get<string>("GEMINI_MODEL", "gemini-2.0-flash");
    this.geminiBase = config.get<string>("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta");
    this.openRouterKey = config.get<string>("OPENROUTER_API_KEY");
    this.openRouterModel = config.get<string>("OPENROUTER_MODEL", "google/gemini-2.0-flash-001");
    this.openRouterBase = config.get<string>("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1");
  }

  get configured() { return Boolean(this.groqKey || this.geminiKey || this.openRouterKey); }

  async ownerBrief(input: { owner?: string; listing: string; cause: string; impact: number; action: string }) {
    return this.complete("Write a concise owner update using only supplied facts. Do not invent numbers, claims, or actions.", JSON.stringify(input));
  }

  async executiveReport(input: unknown) {
    return this.complete("Write a concise executive revenue report from only the supplied JSON. Clearly label estimates, call out priorities, and never invent metrics.", JSON.stringify(input));
  }

  async report(type: "executive" | "portfolio" | "owner" | "revenue", input: unknown) {
    const audience = type === "owner" ? "a property owner" : type === "executive" ? "an executive leadership team" : "a revenue management team";
    return this.complete(`Write a polished ${type} report for ${audience} using only the supplied JSON. Use short Markdown section headings and bullet points, clearly distinguish measured values from estimates, include practical next actions, and never invent metrics. Never return formatting markers without meaningful text.`, JSON.stringify(input));
  }

  async answer(question: string, context: unknown) {
    return this.complete([
      "You are Kivora, a thoughtful, friendly revenue operations partner for short-term-rental teams.",
      "For operational questions, lead with the answer, then explain evidence, uncertainty, and the safest practical next step.",
      "Use concise Markdown headings or bullets only when they make a complex answer easier to scan; do not force a report format for a simple question.",
      "You may be warm and conversational, but operational claims must come only from the supplied live-data context.",
      "For a vague follow-up, use the supplied conversation history and state what you inferred. Ask one focused clarifying question if the context cannot safely answer it.",
      "Treat zero as a valid measured value, never as missing data.",
      "For revenue-risk questions, use revenueRisk first. If largestIncident is null, state that no active revenue incident was detected; do not substitute an event signal as a measured revenue loss.",
      "Demand signals are potential context unless the supplied data explicitly assigns them revenue impact.",
      "Distinguish measured values from estimates, use the supplied currency, and do not mention internal providers or implementation details.",
      "Never say a pricing action was applied, verified, or safe to execute unless the supplied context explicitly establishes that state.",
      "If a requested field is genuinely absent, say which field is unavailable while still summarizing the relevant facts that are present.",
    ].join(" "), JSON.stringify({ question, context }), 0.35);
  }

  private async complete(system: string, content: string, temperature = 0.2): Promise<Completion> {
    const attempts: Array<() => Promise<Completion>> = [];
    if (this.groqKey) attempts.push(() => this.groq(system, content, temperature));
    if (this.geminiKey) attempts.push(() => this.gemini(system, content, temperature));
    if (this.openRouterKey) attempts.push(() => this.openRouter(system, content, temperature));
    if (!attempts.length) throw new ServiceUnavailableException("No Kivora AI provider is configured");

    const failures: string[] = [];
    for (const attempt of attempts) {
      try { return await attempt(); }
      catch (error) { failures.push(error instanceof Error ? error.message : "unknown provider error"); }
    }
    throw new ServiceUnavailableException(`Kivora AI providers are temporarily unavailable (${failures.length} attempted)`);
  }

  private async groq(system: string, content: string, temperature: number): Promise<Completion> {
    const response = await firstValueFrom(this.http.post<OpenAiResponse>(
      `${this.groqBase}/openai/v1/chat/completions`,
      { model: this.groqModel, temperature, messages: [{ role: "system", content: system }, { role: "user", content }] },
      { headers: { Authorization: `Bearer ${this.groqKey}`, "Content-Type": "application/json" }, timeout: 30_000 },
    ));
    return this.result(response.data.choices?.[0]?.message?.content, `groq:${this.groqModel}`);
  }

  private async gemini(system: string, content: string, temperature: number): Promise<Completion> {
    const response = await firstValueFrom(this.http.post<GeminiResponse>(
      `${this.geminiBase}/models/${encodeURIComponent(this.geminiModel)}:generateContent?key=${encodeURIComponent(this.geminiKey!)}`,
      { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: content }] }], generationConfig: { temperature } },
      { headers: { "Content-Type": "application/json" }, timeout: 30_000 },
    ));
    return this.result(response.data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n"), `gemini:${this.geminiModel}`);
  }

  private async openRouter(system: string, content: string, temperature: number): Promise<Completion> {
    const response = await firstValueFrom(this.http.post<OpenAiResponse>(
      `${this.openRouterBase}/chat/completions`,
      { model: this.openRouterModel, temperature, messages: [{ role: "system", content: system }, { role: "user", content }] },
      { headers: { Authorization: `Bearer ${this.openRouterKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://kivora.app", "X-Title": "Kivora" }, timeout: 30_000 },
    ));
    return this.result(response.data.choices?.[0]?.message?.content, `openrouter:${this.openRouterModel}`);
  }

  private result(value: string | undefined, generatedBy: string): Completion {
    const body = value?.trim();
    if (!body) throw new Error(`${generatedBy} returned an empty response`);
    return { body, generatedBy, grounded: true };
  }

  capabilities() {
    const providers = [this.groqKey && "groq", this.geminiKey && "gemini", this.openRouterKey && "openrouter"].filter(Boolean);
    return { configured: providers.length > 0, mode: providers.length ? "live" : "disabled", providers };
  }
}
