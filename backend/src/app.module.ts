import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { ApiModule } from "./api/api.module";
import { validateEnvironment } from "./shared/schemas/env.schema";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([
      { name: "default", ttl: 60_000, limit: 120 },
      { name: "authLimit", ttl: 60_000, limit: 10 },
    ]),
    ApiModule,
  ],
})
export class AppModule {}
