import { BadRequestException } from "@nestjs/common";

export class ValidationException extends BadRequestException {
  constructor(details: unknown) {
    super({ code: "VALIDATION_ERROR", message: "Request validation failed", details });
  }
}
