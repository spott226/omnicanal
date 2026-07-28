import { randomUUID } from "node:crypto";
import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction) {
    const requested = request.header("x-correlation-id");
    const correlationId = requested && /^[a-zA-Z0-9_.:-]{8,100}$/.test(requested) ? requested : randomUUID();
    response.setHeader("x-correlation-id", correlationId);
    (request as Request & { correlationId: string }).correlationId = correlationId;
    next();
  }
}
