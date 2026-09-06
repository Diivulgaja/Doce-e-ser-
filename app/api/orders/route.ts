import { getSupabasePublic, getSupabaseUser, toOrder } from "@/lib/supabase";

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
    const supabase = getSupabasePublic();
    const { data, error } = await supabase.rpc("get_pickup_order", { p_order_number: number, p_phone: phone });
    if (error) throw error;
    return data ? Response.json({ order: toOrder(data) }) : Response.json({ error: "Pedido não encontrado." }, { status: 404 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível consultar." }, { status: 500 }); }
}

export async function POST() {
  return Response.json({ error: "Use o checkout PIX para concluir o pedido." }, { status: 410 });
}
