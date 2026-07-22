import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { MarketSignal, MarketSignalSchema } from './schemas/market-signal.schema';
import { TelegramConnection, TelegramConnectionSchema } from './schemas/telegram-connection.schema';
import { TelegramLink, TelegramLinkSchema } from './schemas/telegram-link.schema';
import { GroqService } from './services/groq.service';
import { MarketIntelligenceService } from './services/market-intelligence.service';
import { TelegramService } from './services/telegram.service';
import { WheelhouseService } from './services/wheelhouse.service';
import { Membership, MembershipSchema } from '../auth/schemas/membership.schema';
import {
  TelegramActionIntent,
  TelegramActionIntentSchema,
  TelegramDelivery,
  TelegramDeliverySchema,
  TelegramInteraction,
  TelegramInteractionSchema,
} from './schemas/telegram-operation.schema';
import {
  NotificationPreference,
  NotificationPreferenceSchema,
  OrganizationIntegrationConfig,
  OrganizationIntegrationConfigSchema,
} from './schemas/organization-integration.schema';
import { OrganizationIntegrationService } from './services/organization-integration.service';
import { IntegrationSettingsController } from './integration-settings.controller';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [
    AuthModule,
    HttpModule.register({ timeout: 15_000, maxRedirects: 3 }),
    MongooseModule.forFeature([
      { name: TelegramConnection.name, schema: TelegramConnectionSchema },
      { name: TelegramLink.name, schema: TelegramLinkSchema },
      { name: TelegramActionIntent.name, schema: TelegramActionIntentSchema },
      { name: TelegramDelivery.name, schema: TelegramDeliverySchema },
      { name: TelegramInteraction.name, schema: TelegramInteractionSchema },
      { name: OrganizationIntegrationConfig.name, schema: OrganizationIntegrationConfigSchema },
      { name: NotificationPreference.name, schema: NotificationPreferenceSchema },
      { name: MarketSignal.name, schema: MarketSignalSchema },
      { name: User.name, schema: UserSchema },
      { name: Membership.name, schema: MembershipSchema },
    ]),
  ],
  controllers: [IntegrationSettingsController],
  providers: [
    GroqService,
    MarketIntelligenceService,
    TelegramService,
    WheelhouseService,
    OrganizationIntegrationService,
  ],
  exports: [GroqService, MarketIntelligenceService, TelegramService, WheelhouseService, OrganizationIntegrationService],
})
export class IntegrationsModule {}
