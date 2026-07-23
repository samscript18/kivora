import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MailerModule } from "@nestjs-modules/mailer";
import { HandlebarsAdapter } from "@nestjs-modules/mailer/adapters/handlebars.adapter";
import { join } from "path";
import { MailService } from "./mail.service";

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          service: config.get<string>("MAILER_SERVICE"),
          auth: { user: config.get<string>("MAILER_USER"), pass: config.get<string>("MAILER_PASS") },
        },
        defaults: { from: config.get<string>("MAILER_FROM_EMAIL") },
        template: { dir: join(__dirname, "templates"), adapter: new HandlebarsAdapter(), options: { strict: true } },
      }),
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
