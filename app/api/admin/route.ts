import { getSupabaseAdmin, requireAdmin, toCategory, toOrder, toProduct, toSettings } from "@/lib/supabase";

async function getAdminData() {
  const supabase = getSupabaseAdmin();
  const [categories, products, settings, orders] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order"),
    supabase.from("products").select("*").order("sort_order"),
    supabase.from("store_settings").select("*").eq("id", 1).single(),
    supabase.from("orders").select("*,order_items(*)").order("created_at", { ascending: false }).limit(100),
  ]);
  const error = categories.error ?? products.error ?? settings.error ?? orders.error;
  if (error) throw error;
  return { categories: (categories.data ?? []).map(toCategory), products: (products.data ?? []).map(toProduct), settings: toSettings(settings.data), orders: (orders.data ?? []).map(toOrder) };
}

export async function GET(request: Request) {
  const user = await requireAdmin(request);
  if (!user) return Response.json({ error: "Acesso restrito. Confirme o e-mail administrador." }, { status: 403 });
  try { return Response.json({ ...(await getAdminData()), user: { displayName: user.user_metadata?.full_name ?? user.email, email: user.email } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const user = await requireAdmin(request);
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const action = String(body.action ?? "");
  const supabase = getSupabaseAdmin();
  try {
    if (action === "saveProduct") {
      const product = body.product as Record<string, unknown>;
      const values = { name: String(product.name ?? "").trim(), description: String(product.description ?? "").trim(), price: Number(product.price), category_id: Number(product.categoryId), image_url: String(product.imageUrl ?? "sprite:0"), options: JSON.parse(String(product.optionsJson ?? "[]")), active: Boolean(product.active), sold_out: Boolean(product.soldOut), featured: Boolean(product.featured), sort_order: Number(product.sortOrder ?? 0) };
      if (!values.name || !Number.isFinite(values.price) || values.price <= 0) throw new Error("Preencha nome e preço corretamente.");
      const result = product.id ? await supabase.from("products").update(values).eq("id", Number(product.id)) : await supabase.from("products").insert(values);
      if (result.error) throw result.error;
    } else if (action === "deleteProduct") {
      const { error } = await supabase.from("products").delete().eq("id", Number(body.id)); if (error) throw error;
    } else if (action === "saveCategory") {
      const category = body.category as Record<string, unknown>; const name = String(category.name ?? "").trim(); if (!name) throw new Error("Informe o nome da categoria.");
      const values = { name, slug: `${name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${category.id ?? Date.now()}`, active: Boolean(category.active), sort_order: Number(category.sortOrder ?? 0) };
      const result = category.id ? await supabase.from("categories").update(values).eq("id", Number(category.id)) : await supabase.from("categories").insert(values); if (result.error) throw result.error;
    } else if (action === "deleteCategory") {
      const { error } = await supabase.from("categories").delete().eq("id", Number(body.id)); if (error) throw new Error(error.code === "23503" ? "Mova os produtos antes de excluir a categoria." : error.message);
    } else if (action === "updateOrderStatus") {
      const status = String(body.status); if (!["received", "confirmed", "preparing", "ready", "picked_up", "cancelled"].includes(status)) throw new Error("Status inválido.");
      const { error } = await supabase.from("orders").update({ status }).eq("id", Number(body.id)); if (error) throw error;
    } else if (action === "saveSettings") {
      const settings = body.settings as Record<string, unknown>;
      const values = { store_name: String(settings.storeName), phone: String(settings.phone), whatsapp: String(settings.whatsapp), instagram: String(settings.instagram), address: String(settings.address), maps_url: String(settings.mapsUrl), open_time: String(settings.openTime), close_time: String(settings.closeTime), interval_minutes: Number(settings.intervalMinutes), orders_per_slot: Number(settings.ordersPerSlot), prep_minutes: Number(settings.prepMinutes), closed_days: JSON.parse(String(settings.closedDaysJson)), payment_methods: JSON.parse(String(settings.paymentMethodsJson)), updated_at: new Date().toISOString() };
      const { error } = await supabase.from("store_settings").update(values).eq("id", 1); if (error) throw error;
    } else return Response.json({ error: "Ação inválida." }, { status: 400 });
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar." }, { status: 400 }); }
}
