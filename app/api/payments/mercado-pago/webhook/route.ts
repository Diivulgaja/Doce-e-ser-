import { z } from "zod";
import { getMercadoPagoOrder, isPixPaymentConfigured, paymentStatusFromMercadoPago, readMercadoPagoPix, validateMercadoPagoWebhook } from "@/lib/mercado-pago";
import { getSupabaseAdmin } from "@/lib/supabase";

const uuid = z.string().uuid();

export async function POST(request: Request) {
  if (!isPixPaymentConfigured()) return Response.json({ error: "Integração desativada." }, { status: 503 });
  const url = new URL(request.url);
  const body = await request.json().catch(() => ({})) as { type?: unknown; data?: { id?: unknown } };
  const dataId = url.searchParams.get("data.id") ?? url.searchParams.get("data_id") ?? String(body.data?.id ?? "");
  if (String(body.type ?? url.searchParams.get("type") ?? "") !== "order") return Response.json({ ok: true });

  try {
    validateMercadoPagoWebhook({
      signature: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId,
    });
  } catch (error) {
    console.error("Assinatura do webhook Mercado Pago rejeitada:", error);
    return Response.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  try {
    const providerOrder = await getMercadoPagoOrder(dataId);
    const pix = readMercadoPagoPix(providerOrder);
    const paymentStatus = paymentStatusFromMercadoPago(pix.status, pix.statusDetail);
    const admin = getSupabaseAdmin();

    const baseQuery = admin.from("orders").select("id,total,status,payment_status");
    const result = uuid.safeParse(pix.externalReference).success
      ? await baseQuery.eq("payment_reference", pix.externalReference).maybeSingle()
      : await baseQuery.eq("payment_provider_order_id", pix.providerOrderId).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return Response.json({ ok: true });

    if (paymentStatus === "paid") {
      const expected = Math.round(Number(result.data.total) * 100);
      const charged = Math.round(pix.amount * 100);
      const received = Math.round(pix.paidAmount * 100);
      if (expected !== charged || received < expected) throw new Error("Valor confirmado pelo Mercado Pago não corresponde ao pedido.");
    }

    const update: Record<string, unknown> = {
      payment_status: paymentStatus,
      payment_provider_order_id: pix.providerOrderId,
      payment_provider_payment_id: pix.providerPaymentId,
    };
    if (paymentStatus === "paid") update.paid_at = new Date().toISOString();
    if (["expired", "failed"].includes(paymentStatus)) update.status = "cancelled";
    if (paymentStatus === "refunded" && result.data.status !== "picked_up") update.status = "cancelled";

    const { error: updateError } = await admin.from("orders").update(update).eq("id", result.data.id);
    if (updateError) throw updateError;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Falha ao processar webhook Mercado Pago:", error);
    return Response.json({ error: "Não foi possível processar a notificação." }, { status: 500 });
  }
}
