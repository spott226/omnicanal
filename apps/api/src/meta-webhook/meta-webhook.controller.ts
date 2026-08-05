import { Controller, Get, Headers, HttpCode, Inject, Post, Query, Req } from "@nestjs/common";
import { MetaWebhookService } from "./meta-webhook.service";

@Controller("meta/webhook")
export class MetaWebhookController {
  constructor(@Inject(MetaWebhookService) private readonly meta: MetaWebhookService) {}

  @Get()
  verify(
    @Query("hub.mode") mode?: string,
    @Query("hub.verify_token") verifyToken?: string,
    @Query("hub.challenge") challenge?: string,
  ) {
    return this.meta.verify(mode, verifyToken, challenge);
  }

  @Get("debug")
  debug() {
    return this.meta.debug();
  }

  @Post()
  @HttpCode(200)
  receive(@Req() request: any, @Headers("x-hub-signature-256") signature?: string) {
    return this.meta.receive(request.body, request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {})), signature);
  }
}
