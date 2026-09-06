import { z } from "zod";
import { MercadoPagoError } from "mercadopago";
import { createMercadoPagoPix, getMercadoPagoOrder, isPixPaymentConfigured, readMercadoPagoPix } from "@/lib/mercado-pago";
import { getSupabaseAdmin, getSupabaseUser, toOrder } from "@/lib/supabase";

const checkoutSchema = z.object({
  requestId: z.string().uuid(),
  customerName: z.string().trim().min(3).max(100),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(8).max(24),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(500).default(""),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(30),
    selectedOptions: z.array(z.string().max(220)).max(20).default([]),
    notes: z.string().max(300).default(""),
  })).min(1).max(40),
});

function mercadoPagoMessage(error: MercadoPagoError) {
  const causeCodes = error.causes.flatMap((cause) => {
    if (!cause || typeof cause !== "object") return [];
    const value = "code" in cause ? cause.code : "";
    return typeof value === "string" ? [value] : [];
  });
  const codes = [error.error, ...causeCodes].filter(Boolean);
  const normalized = codes.join(" ").toLowerCase();

  if (normalized.includes("invalid_email_for_sandbox")) {
    return "O Mercado Pago está usando credenciais de teste. Configure o Access Token de produção na Vercel.";
  }
  if (error.status === 401 || normalized.includes("invalid_credentials")) {
    return "O Access Token do Mercado Pago está inválido. Copie o Access Token de produção e faça um novo deploy.";
  }
  if (error.status === 403) {
    return "A aplicação do Mercado Pago não tem permissão para criar PIX pela API de Orders. Revise as credenciais de produção da aplicação.";
  }
  if (error.status === 429) {
    return "O Mercado Pago recebeu muitas tentativas. Aguarde alguns minutos e tente novamente.";
  }
  if (error.status >= 500 || error.status === 0) {
    return "O Mercado Pago está temporariamente indisponível. Tente novamente em alguns minutos.";
  }
  return codes[0]
    ? `O Mercado Pago recusou a cobrança PIX (código: ${codes[0]}).`
    : `O Mercado Pago recusou a cobrança PIX (HTTP ${error.status || 400}).`;
}

export async function POST(request: Request) {
  if (!isPixPaymentConfigured()) {
    return Response.json({ error: "O pagamento PIX ainda está sendo configurado." }, { status: 503 });
  }

  try {
    const payload = checkoutSchema.parse(await request.json());
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    let userId: string | null = null;
    let payerEmail = payload.email;

    if (token) {
      const authClient = getSupabaseUser(token);
      const { data: { user }, error } = await authClient.auth.getUser(token);
      if (error || !user?.email) return Response.json({ error: "Entre novamente para continuar." }, { status: 401 });
      userId = user.id;
      payerEmail = user.email;
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("create_pix_checkout", {
      p_request_id: payload.requestId,
      p_user_id: userId,
      p_customer_name: payload.customerName,
      p_email: payerEmail,
      p_phone: payload.phone,
      p_pickup_date: payload.pickupDate,
      p_notes: payload.notes,
      p_items: payload.items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
        options: item.selectedOptions,
        notes: item.notes,
      })),
    });
    if (error) throw new Error(error.message);

    const pendingOrder = data as Record<string, unknown>;
    const reference = String(pendingOrder.payment_reference);
    const providerOrderId = String(pendingOrder.payment_provider_order_id ?? "");
    let providerOrder;
    try {
      providerOrder = providerOrderId
        ? await getMercadoPagoOrder(providerOrderId)
        : await createMercadoPagoPix({
            reference,
            idempotencyKey: payload.requestId,
            amount: Number(pendingOrder.total),
            email: payerEmail,
            customerName: payload.customerName,
          });
    } catch (error) {
      await admin.from("orders").update({ payment_status: "failed" })
        .eq("payment_reference", reference)
        .eq("payment_status", "pending");
      throw error;
    }
    const pix = readMercadoPagoPix(providerOrder);

    if (!pix.providerOrderId || !pix.providerPaymentId || !pix.qrCode) {
      throw new Error("O Mercado Pago não retornou os dados completos do PIX.");
    }
    if (pix.externalReference !== reference || Math.round(pix.amount * 100) !== Math.round(Number(pendingOrder.total) * 100)) {
      throw new Error("A cobrança PIX retornou valores diferentes do pedido.");
    }

    const { error: updateError } = await admin.from("orders").update({
      payment_provider_order_id: pix.providerOrderId,
      payment_provider_payment_id: pix.providerPaymentId,
      payment_ticket_url: pix.ticketUrl,
      payment_qr_code: pix.qrCode,
      payment_expires_at: pix.expiresAt,
    }).eq("payment_reference", reference);
    if (updateError) throw updateError;

    return Response.json({
      checkout: {
        reference,
        qrCode: pix.qrCode,
        qrCodeBase64: pix.qrCodeBase64,
        ticketUrl: pix.ticketUrl,
        expiresAt: pix.expiresAt,
        total: Number(pendingOrder.total),
        pickupDate: String(pendingOrder.pickup_date),
        status: "pending",
        order: toOrder(pendingOrder),
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Revise os dados do pedido." }, { status: 400 });
    console.error("Falha ao criar cobrança PIX:", error);
    if (error instanceof MercadoPagoError) {
      return Response.json({ error: mercadoPagoMessage(error) }, { status: error.status >= 500 ? 502 : 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível gerar o PIX." }, { status: 400 });
  }
}
