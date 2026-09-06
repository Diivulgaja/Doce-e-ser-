import MercadoPagoConfig, { Order, WebhookSignatureValidator } from "mercadopago";

type MercadoPagoOrder = Awaited<ReturnType<Order["get"]>>;

function requiredServerEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

export function isPixPaymentConfigured() {
  return Boolean(
    process.env.PIX_PAYMENT_ENABLED === "true"
    && process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim()
    && process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim()
    && (process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
  );
}

function mercadoPagoOrderClient() {
  const config = new MercadoPagoConfig({
    accessToken: requiredServerEnv("MERCADO_PAGO_ACCESS_TOKEN"),
    options: { timeout: 10_000, maxRetries: 2 },
  });
  return new Order(config);
}

export async function createMercadoPagoPix(input: {
  reference: string;
  idempotencyKey: string;
  amount: number;
  email: string;
}) {
  return mercadoPagoOrderClient().create({
    body: {
      type: "online",
      total_amount: input.amount.toFixed(2),
      external_reference: input.reference,
      processing_mode: "automatic",
      payer: { email: input.email },
      transactions: {
        payments: [{
          amount: input.amount.toFixed(2),
          expiration_time: "PT30M",
          payment_method: { id: "pix", type: "bank_transfer" },
        }],
      },
    },
    requestOptions: { idempotencyKey: input.idempotencyKey },
  });
}

export async function getMercadoPagoOrder(id: string) {
  return mercadoPagoOrderClient().get({ id });
}

export function validateMercadoPagoWebhook(input: {
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
}) {
  WebhookSignatureValidator.validate({
    xSignature: input.signature,
    xRequestId: input.requestId,
    dataId: input.dataId,
    secret: requiredServerEnv("MERCADO_PAGO_WEBHOOK_SECRET"),
  });
}

export function readMercadoPagoPix(order: MercadoPagoOrder) {
  const payment = order.transactions?.payments?.[0];
  const method = payment?.payment_method;
  const amount = Number(payment?.amount ?? order.total_amount ?? 0);
  const paidAmount = Number(payment?.paid_amount ?? order.total_paid_amount ?? 0);
  return {
    providerOrderId: String(order.id ?? ""),
    providerPaymentId: String(payment?.id ?? ""),
    externalReference: String(order.external_reference ?? ""),
    status: String(payment?.status ?? order.status ?? ""),
    statusDetail: String(payment?.status_detail ?? order.status_detail ?? ""),
    amount,
    paidAmount,
    qrCode: String(method?.qr_code ?? ""),
    qrCodeBase64: String(method?.qr_code_base64 ?? ""),
    ticketUrl: String(method?.ticket_url ?? ""),
    expiresAt: payment?.date_of_expiration ? String(payment.date_of_expiration) : new Date(Date.now() + 30 * 60_000).toISOString(),
  };
}

export function paymentStatusFromMercadoPago(status: string, detail: string) {
  if (status === "processed" && detail === "accredited") return "paid" as const;
  if (status === "expired") return "expired" as const;
  if (status === "refunded" || status === "charged_back") return "refunded" as const;
  if (status === "failed" || status === "canceled") return "failed" as const;
  return "pending" as const;
}
