import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  type ErpWebhook,
  ErpWebhookSchema,
  type GatewayWebhook,
  GatewayWebhookSchema,
  type StoreWebhook,
  StoreWebhookSchema,
  type WebhookAck,
  WebhookAckSchema,
} from '@reconcilia/shared';
import { toOpenApiSchema } from '../common/openapi.js';
import { WEBHOOK_SIGNATURE } from '../common/openapi-security.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { WebhooksService } from './webhooks.service.js';

const ACK = { received: true } as const satisfies WebhookAck;
const RAW_STORAGE =
  'Grava o evento bruto traduzido para o modelo interno e responde 202. Reenvio do mesmo id é ' +
  'ignorado pelo banco (id único).';

@ApiTags('webhooks')
@ApiSecurity(WEBHOOK_SIGNATURE)
@ApiAcceptedResponse({ description: 'Evento recebido', schema: toOpenApiSchema(WebhookAckSchema) })
@ApiBadRequestResponse({ description: 'Payload fora do contrato' })
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post('store')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Loja: pedido criado',
    description: 'Cria o pedido (status PENDING). Reenvio do mesmo externalId é ignorado.',
  })
  @ApiBody({ schema: toOpenApiSchema(StoreWebhookSchema) })
  async store(
    @Body(new ZodValidationPipe(StoreWebhookSchema)) event: StoreWebhook,
  ): Promise<WebhookAck> {
    await this.webhooks.receiveStore(event);
    return ACK;
  }

  @Post('gateway')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Gateway: cobrança autorizada, capturada ou estornada',
    description: RAW_STORAGE,
  })
  @ApiBody({ schema: toOpenApiSchema(GatewayWebhookSchema) })
  async gateway(
    @Body(new ZodValidationPipe(GatewayWebhookSchema)) event: GatewayWebhook,
  ): Promise<WebhookAck> {
    await this.webhooks.receiveGateway(event);
    return ACK;
  }

  @Post('erp')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'ERP: pagamento, estorno ou ajuste registrado',
    description: RAW_STORAGE,
  })
  @ApiBody({ schema: toOpenApiSchema(ErpWebhookSchema) })
  async erp(@Body(new ZodValidationPipe(ErpWebhookSchema)) event: ErpWebhook): Promise<WebhookAck> {
    await this.webhooks.receiveErp(event);
    return ACK;
  }
}
