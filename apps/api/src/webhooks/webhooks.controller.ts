import { Body, Controller, HttpCode, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
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
import { InjectPinoLogger, type PinoLogger } from 'nestjs-pino';
import { WEBHOOK_SIGNATURE } from '../common/openapi-security.js';
import { toOpenApiSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { WebhookSignatureGuard } from './webhook-signature.guard.js';
import { type IngestResult, WebhooksService } from './webhooks.service.js';

/** O mínimo do response do Express que usamos: status por resultado (200 ou 202). */
interface JsonResponse {
  status(code: number): { json(body: WebhookAck): void };
}

/**
 * Evento novo: 202. Duplicado: 200 com duplicate=true. O status é decidido depois de gravar, por
 * isso a resposta é enviada aqui. O @HttpCode(202) nos métodos só define o status padrão (e o
 * que o OpenAPI documenta); com @Res() sem passthrough, o status final é o deste helper.
 */
function acknowledge(res: JsonResponse, { duplicate }: IngestResult): void {
  res.status(duplicate ? HttpStatus.OK : HttpStatus.ACCEPTED).json({ received: true, duplicate });
}

const ACK_SCHEMA = toOpenApiSchema(WebhookAckSchema);

@ApiTags('webhooks')
@ApiSecurity(WEBHOOK_SIGNATURE)
@UseGuards(WebhookSignatureGuard)
@ApiAcceptedResponse({ description: 'Evento novo recebido', schema: ACK_SCHEMA })
@ApiOkResponse({
  description: 'Evento já recebido (duplicate=true); sem efeito',
  schema: ACK_SCHEMA,
})
@ApiBadRequestResponse({ description: 'Payload fora do contrato' })
@ApiUnauthorizedResponse({ description: 'X-Signature ausente ou inválida; nada é gravado' })
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    @InjectPinoLogger(WebhooksController.name) private readonly logger: PinoLogger,
  ) {}

  @Post('store')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Loja: pedido criado ou cancelado',
    description:
      'order.created cria o pedido (status PENDING); reenvio do mesmo externalId é ignorado. ' +
      'order.canceled cancela um pedido PENDING; reenvio não muda nada. Cancelar um pedido que ' +
      'ainda não existe responde 409, para a loja tentar de novo.',
  })
  @ApiConflictResponse({ description: 'Cancelamento de um pedido que ainda não existe' })
  @ApiBody({ schema: toOpenApiSchema(StoreWebhookSchema) })
  async store(
    @Body(new ZodValidationPipe(StoreWebhookSchema)) event: StoreWebhook,
    @Res() res: JsonResponse,
  ): Promise<void> {
    this.logger.assign({ eventId: event.id, orderExternalId: event.order.externalId });
    acknowledge(res, await this.webhooks.receiveStore(event));
  }

  @Post('gateway')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Gateway: cobrança autorizada, capturada ou estornada',
    description:
      'Grava o evento e o enfileira na mesma transação (202). Reenvio do mesmo id só incrementa ' +
      'received_count e não enfileira de novo (200). O worker aplica cada evento uma única vez.',
  })
  @ApiBody({ schema: toOpenApiSchema(GatewayWebhookSchema) })
  async gateway(
    @Body(new ZodValidationPipe(GatewayWebhookSchema)) event: GatewayWebhook,
    @Res() res: JsonResponse,
  ): Promise<void> {
    this.logger.assign({ eventId: event.id, orderExternalId: event.data.orderReference });
    acknowledge(res, await this.webhooks.receiveGateway(event));
  }

  @Post('erp')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'ERP: pagamento, estorno ou ajuste registrado',
    description:
      'Grava o evento (202). Reenvio do mesmo id só incrementa received_count (200). Não há ' +
      'fila: o evento do ERP não muda estado, a conciliação só lê.',
  })
  @ApiBody({ schema: toOpenApiSchema(ErpWebhookSchema) })
  async erp(
    @Body(new ZodValidationPipe(ErpWebhookSchema)) event: ErpWebhook,
    @Res() res: JsonResponse,
  ): Promise<void> {
    this.logger.assign({ eventId: event.id, orderExternalId: event.orderReference });
    acknowledge(res, await this.webhooks.receiveErp(event));
  }
}
