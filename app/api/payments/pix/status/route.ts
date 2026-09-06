import { z } from "zod";
import { getMercadoPagoOrder, paymentStatusFromMercadoPago, readMercadoPagoPix } from "@/lib/mercado-pago";
import { getSupabaseAdmin, toOrder } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const reference = z.string().uuid().parse(new URL(request.url).searchParams.get("reference"));
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from("orders").select("*,order_items(*)").eq("payment_reference", reference).maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "Cobrança não encontrada." }, { status: 404 });

    let status = String(data.payment_status);
    let currentOrder = data;

    // O webhook continua sendo o caminho principal. Esta consulta direta é a
    // recuperação automática caso a notificação do Mercado Pago atrase ou falhe.
    if (status === "pending" && data.payment_provider_order_id) {
      try {
        const providerOrder = await getMercadoPagoOrder(String(data.payment_provider_order_id));
        const pix = readMercadoPagoPix(providerOrder);
        const providerStatus = paymentStatusFromMercadoPago(pix.status, pix.statusDetail);

        if (providerStatus === "paid") {
          const expected = Math.round(Number(data.total) * 100);
          const charged = Math.round(pix.amount * 100);
          const received = Math.round(pix.paidAmount * 100);
          if (expected !== charged || received < expected) throw new Error("Valor confirmado não corresponde ao pedido.");
        }

        if (providerStatus !== "pending") {
          const update: Record<string, unknown> = {
            payment_status: providerStatus,
            payment_provider_order_id: pix.providerOrderId,
            payment_provider_payment_id: pix.providerPaymentId,
          };
          if (providerStatus === "paid") {
            update.paid_at = new Date().toISOString();
            if (data.status === "cancelled") update.status = "received";
          }
          if (["expired", "failed", "refunded"].includes(providerStatus) && data.status !== "picked_up") update.status = "cancelled";

          const { data: refreshed, error: updateError } = await admin
            .from("orders")
            .update(update)
            .eq("id", data.id)
            .eq("payment_status", "pending")
            .select("*,order_items(*)")
            .single();
          if (updateError) throw updateError;
          currentOrder = refreshed;
          status = String(refreshed.payment_status);
        }
      } catch (providerError) {
        // Uma indisponibilidade momentânea não deve quebrar o checkout.
        // O próximo ciclo ou o webhook tentará novamente.
        console.error("Falha ao reconciliar PIX pendente:", providerError);
      }
    }

    if (status === "pending" && data.payment_expires_at && new Date(String(data.payment_expires_at)).getTime() <= Date.now()) {
      status = "expired";
      await admin.from("orders").update({ payment_status: "expired", status: "cancelled" }).eq("id", data.id).eq("payment_status", "pending");
      currentOrder = { ...currentOrder, payment_status: "expired", status: "cancelled" };
    }

    const checkout = {
      reference,
      qrCode: status === "pending" ? String(currentOrder.payment_qr_code ?? "") : "",
      qrCodeBase64: "",
      ticketUrl: status === "pending" ? String(currentOrder.payment_ticket_url ?? "") : "",
      expiresAt: String(currentOrder.payment_expires_at ?? ""),
      total: Number(currentOrder.total),
      pickupDate: String(currentOrder.pickup_date),
      status,
      ...(status === "paid" || status === "refunded" ? { order: toOrder({ ...currentOrder, payment_status: status }) } : {}),
    };
    return Response.json({ checkout }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Cobrança inválida." }, { status: 400 });
    console.error("Falha interna ao consultar pagamento PIX:", error);
    return Response.json({ error: "Não foi possível consultar o pagamento agora." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
