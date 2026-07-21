import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get()
  index() {
    return { service: "kivora-api", documentation: "/api/docs" };
  }
}
