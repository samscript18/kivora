import { Controller, Get } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection } from "mongoose";
import { GroqService } from "../integrations/services/groq.service";
import { TelegramService } from "../integrations/services/telegram.service";
import { WheelhouseService } from "../integrations/services/wheelhouse.service";

@Controller("health")
export class HealthController {
  constructor(@InjectConnection() private readonly database: Connection, private readonly groq: GroqService, private readonly telegram: TelegramService, private readonly wheelhouse: WheelhouseService) {}

  @Get()
  health() {
    return { status: this.database.readyState === 1 ? "ok" : "degraded", service: "kivora-api", database: this.database.readyState === 1 ? "connected" : "disconnected", integrations: { groq: this.groq.configured, telegram: this.telegram.configured, wheelhouse: this.wheelhouse.configured }, timestamp: new Date().toISOString() };
  }
}
