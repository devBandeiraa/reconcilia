import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type ErpWebhook,
  ErpWebhookSchema,
  type GatewayWebhook,
  GatewayWebhookSchema,
  SIGNATURE_HEADER,
  type StoreWebhook,
  StoreWebhookSchema,
  type WebhookAck,
  WebhookAckSchema,
} from '@reconcilia/shared';
import { toOpenApiSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { WebhooksService } from './webhooks.service.js';

const ACK = { received: true } as const satisfies WebhookAck;

@ApiTags('webhooks')
@ApiHeader({
  name: SIGNATURE_HEADER,
  description: 'sha256=<hex>: HMAC-SHA256 do corpo bruto com o WEBHOOK_SECRET',
  required: false,
})
@ApiAcceptedResponse({ description: 'Evento recebido', schema: toOpenApiSchema(WebhookAckSchema) })
@ApiBadRequestResponse({ description: 'Payload fora do contrato' })
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post('store')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Loja: pedido criado' })
  @ApiBody({ schema: toOpenApiSchema(StoreWebhookSchema) })
  async store(
    @Body(new ZodValidationPipe(StoreWebhookSchema)) event: StoreWebhook,
  ): Promise<WebhookAck> {
    await this.webhooks.receiveStore(event);
    return ACK;
  }

  @Post('gateway')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Gateway: cobrança autorizada, capturada ou estornada' })
  @ApiBody({ schema: toOpenApiSchema(GatewayWebhookSchema) })
  async gateway(
    @Body(new ZodValidationPipe(GatewayWebhookSchema)) event: GatewayWebhook,
  ): Promise<WebhookAck> {
    await this.webhooks.receiveGateway(event);
    return ACK;
  }

  @Post('erp')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'ERP: pagamento, estorno ou ajuste registrado' })
  @ApiBody({ schema: toOpenApiSchema(ErpWebhookSchema) })
  async erp(@Body(new ZodValidationPipe(ErpWebhookSchema)) event: ErpWebhook): Promise<WebhookAck> {
    await this.webhooks.receiveErp(event);
    return ACK;
  }
}
