import { z } from "zod";
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
    if (status === "pending" && data.payment_expires_at && new Date(String(data.payment_expires_at)).getTime() <= Date.now()) {
      status = "expired";
      await admin.from("orders").update({ payment_status: "expired", status: "cancelled" }).eq("id", data.id).eq("payment_status", "pending");
    }

    const checkout = {
      reference,
      qrCode: status === "pending" ? String(data.payment_qr_code ?? "") : "",
      qrCodeBase64: "",
      ticketUrl: status === "pending" ? String(data.payment_ticket_url ?? "") : "",
      expiresAt: String(data.payment_expires_at ?? ""),
      total: Number(data.total),
      pickupDate: String(data.pickup_date),
      status,
      ...(status === "paid" || status === "refunded" ? { order: toOrder({ ...data, payment_status: status }) } : {}),
    };
    return Response.json({ checkout }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Cobrança inválida." }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível consultar o pagamento." }, { status: 500 });
  }
}
