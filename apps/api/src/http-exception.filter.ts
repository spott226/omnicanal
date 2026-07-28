import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { Request, Response } from "express";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp(); const request = context.getRequest<Request & { correlationId?: string }>(); const response = context.getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const detail = error instanceof HttpException ? error.getResponse() : "Error interno";
    if (status >= 500) console.error("Unhandled API error", { path: request.url, correlationId: request.correlationId, error });
    response.status(status).json({ statusCode: status, error: status >= 500 ? "Error interno" : detail, path: request.url, correlationId: request.correlationId, timestamp: new Date().toISOString() });
  }
}
