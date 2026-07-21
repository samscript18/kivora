import { HttpModule } from "@nestjs/axios";
import { Global, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { User, UserSchema } from "../auth/schemas/user.schema";
import { MarketSignal, MarketSignalSchema } from "./schemas/market-signal.schema";
import { TelegramConnection, TelegramConnectionSchema } from "./schemas/telegram-connection.schema";
import { TelegramLink, TelegramLinkSchema } from "./schemas/telegram-link.schema";
import { GroqService } from "./services/groq.service";
import { MarketIntelligenceService } from "./services/market-intelligence.service";
import { TelegramService } from "./services/telegram.service";
import { WheelhouseService } from "./services/wheelhouse.service";

@Global()
@Module({
  imports: [HttpModule.register({ timeout: 15_000, maxRedirects: 3 }), MongooseModule.forFeature([{ name: TelegramConnection.name, schema: TelegramConnectionSchema }, { name: TelegramLink.name, schema: TelegramLinkSchema }, { name: MarketSignal.name, schema: MarketSignalSchema }, { name: User.name, schema: UserSchema }])],
  providers: [GroqService, MarketIntelligenceService, TelegramService, WheelhouseService],
  exports: [GroqService, MarketIntelligenceService, TelegramService, WheelhouseService],
})
export class IntegrationsModule {}
