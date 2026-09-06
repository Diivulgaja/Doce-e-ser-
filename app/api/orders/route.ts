import { getSupabaseAdmin, getSupabaseUser, toOrder } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const number = url.searchParams.get("number")?.trim() ?? "";
    const phone = url.searchParams.get("phone")?.trim() ?? "";
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (token && !number) {
      const supabase = getSupabaseUser(token);
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) return Response.json({ error: "Entre novamente para ver seus pedidos." }, { status: 401 });
      const { data, error } = await supabase.from("orders").select("*, order_items(*)").in("payment_status", ["legacy", "paid", "refunded"]).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return Response.json({ orders: (data ?? []).map((order) => toOrder(order as Record<string, unknown>)) });
    }
    if (!number || !phone) return Response.json({ error: "Informe telefone e número do pedido." }, { status: 400 });
    const normalizedPhone = phone.replace(/\D/g, "");
    if (number.length < 3 || number.length > 40 || normalizedPhone.length < 8 || normalizedPhone.length > 15) return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("orders").select("*,order_items(*)").eq("order_number", number).eq("phone", normalizedPhone).in("payment_status", ["legacy", "paid", "refunded"]).maybeSingle();
    if (error) throw error;
    return data ? Response.json({ order: toOrder(data as Record<string, unknown>) }) : Response.json({ error: "Pedido não encontrado." }, { status: 404 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível consultar." }, { status: 500 }); }
}

export async function POST() {
  return Response.json({ error: "Use o checkout PIX para concluir o pedido." }, { status: 410 });
}
