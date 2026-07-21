import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<any>();
    const request = host.switchToHttp().getRequest<any>();
    const status = error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = error instanceof HttpException ? error.getResponse() : undefined;
    const object = typeof payload === "object" ? payload as Record<string, unknown> : {};
    response.status(status).json({
      success: false,
      code: object.code ?? `HTTP_${status}`,
      message: object.message ?? (status === 500 ? "Internal server error" : payload),
      details: object.details,
      timestamp: new Date().toISOString(),
      requestId: request.headers["x-request-id"],
      path: request.originalUrl,
    });
  }
}
