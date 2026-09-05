import { z } from "zod";
import { getSupabasePublic, getSupabaseUser, toOrder } from "@/lib/supabase";

const orderSchema = z.object({
  customerName: z.string().trim().min(3).max(100),
  phone: z.string().trim().min(8).max(24),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pickupTime: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().trim().max(500).default(""),
  paymentMethod: z.string().trim().min(1).max(60),
  items: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(30), selectedOptions: z.array(z.string().max(220)).max(20).default([]), notes: z.string().max(300).default("") })).min(1).max(40),
});

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
      const { data, error } = await supabase.from("orders").select("*, order_items(*)").order("created_at", { ascending: false }).limit(50);
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

export async function POST(request: Request) {
  try {
    const payload = orderSchema.parse(await request.json());
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const supabase = token ? getSupabaseUser(token) : getSupabasePublic();
    const { data, error } = await supabase.rpc("create_pickup_order", {
      p_customer_name: payload.customerName,
      p_phone: payload.phone,
      p_pickup_date: payload.pickupDate,
      p_pickup_time: payload.pickupTime,
      p_notes: payload.notes,
      p_payment_method: payload.paymentMethod,
      p_items: payload.items.map((item) => ({ product_id: item.productId, quantity: item.quantity, options: item.selectedOptions, notes: item.notes })),
    });
    if (error) throw new Error(error.message);
    return Response.json({ order: toOrder(data as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Revise os dados do pedido." }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível registrar o pedido." }, { status: 400 });
  }
}
