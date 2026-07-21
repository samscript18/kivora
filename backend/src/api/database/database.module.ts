import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";

@Global()
@Module({
  imports: [MongooseModule.forRootAsync({
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
      uri: config.get<string>("MONGODB_URI", "mongodb://localhost:27017/kivora"),
      serverSelectionTimeoutMS: 5_000,
    }),
  })],
  exports: [MongooseModule],
})
export class DatabaseModule {}
