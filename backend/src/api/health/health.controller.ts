import { Controller, Get, Res } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection } from "mongoose";
import { GroqService } from "../integrations/services/groq.service";
import { TelegramService } from "../integrations/services/telegram.service";
import { WheelhouseService } from "../integrations/services/wheelhouse.service";
import { ConfigService } from "@nestjs/config";

@Controller("health")
export class HealthController {
  constructor(@InjectConnection() private readonly database: Connection, private readonly groq: GroqService, private readonly telegram: TelegramService, private readonly wheelhouse: WheelhouseService, private readonly config: ConfigService) {}

  @Get()
  health() {
    return { status: this.database.readyState === 1 ? "ok" : "degraded", service: "kivora-api", database: this.database.readyState === 1 ? "connected" : "disconnected", integrations: { groq: this.groq.configured, telegram: this.telegram.configured, wheelhouse: this.wheelhouse.configured }, timestamp: new Date().toISOString() };
  }

  @Get("live")
  liveness() { return { status: "ok", service: "kivora-api", uptimeSeconds: Math.round(process.uptime()), timestamp: new Date().toISOString() }; }

  @Get("ready")
  async readiness(@Res({ passthrough: true }) response: { status(code: number): void }) {
    const databaseReady = this.database.readyState === 1;
    const requiredConfiguration = Boolean(this.config.get("MONGODB_URI") && this.config.get("PRIVY_APP_ID") && this.config.get("PRIVY_APP_SECRET") && this.config.get("WHEELHOUSE_CREDENTIAL_ENCRYPTION_KEY"));
    const activeConnections = databaseReady ? await this.database.db!.collection("wheelhouseconnections").countDocuments({ status: { $ne: "revoked" } }) : 0;
    const status = databaseReady && requiredConfiguration && activeConnections > 0 ? "ready" : "not_ready";
    response.status(status === "ready" ? 200 : 503);
    return { status, checks: { database: databaseReady ? "connected" : "disconnected", requiredConfiguration: requiredConfiguration ? "valid" : "incomplete", backgroundWorker: "scheduled", wheelhouseConnections: activeConnections, optionalDependencies: { groq: this.groq.configured ? "configured" : "disabled", telegram: this.telegram.configured ? "configured" : "disabled" } }, timestamp: new Date().toISOString() };
  }

  @Get("dependencies")
  async dependencies() {
    const databaseReady = this.database.readyState === 1;
    const connectionStates = databaseReady ? await this.database.db!.collection("wheelhouseconnections").aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]).toArray() : [];
    return { status: databaseReady ? "ok" : "degraded", database: databaseReady ? "connected" : "disconnected", wheelhouse: connectionStates, groq: this.groq.configured ? "configured" : "disabled", telegram: this.telegram.configured ? "configured" : "disabled" };
  }
}
