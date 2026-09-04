import { requireAdmin, toCategory, toOrder, toProduct, toSettings } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

function parseJsonArray(value: unknown, label: string): unknown[] {
  const source = String(value ?? "").trim();
  if (!source) return [];
  try {
    const parsed: unknown = JSON.parse(source);
    if (!Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new Error(`${label} precisam estar em uma lista válida.`);
  }
}

function validateProductOptions(options: unknown[]) {
  if (options.length > 20) throw new Error("Use no máximo 20 grupos de opções por produto.");
  let totalMaximum = 0;
  for (const rawOption of options) {
    if (!rawOption || typeof rawOption !== "object") throw new Error("Revise as opções do produto.");
    const option = rawOption as { kind?: unknown; name?: unknown; description?: unknown; selectionCount?: unknown; minSelections?: unknown; maxSelections?: unknown; values?: unknown };
    const values = Array.isArray(option.values) ? option.values : [];
    const groupName = String(option.name ?? "").trim();
    if (!groupName || groupName.length > 100 || values.length === 0 || values.length > 50) throw new Error("Cada grupo precisa de um nome de até 100 caracteres e de 1 a 50 escolhas.");
    if (String(option.description ?? "").length > 500) throw new Error("A explicação do combo deve ter até 500 caracteres.");
    const names = values.map((value) => typeof value === "string" ? value.trim() : String((value as { name?: unknown })?.name ?? "").trim());
    if (names.some((name) => !name || name.length > 100) || new Set(names.map((name) => name.toLowerCase())).size !== names.length) throw new Error("As escolhas precisam ter nomes diferentes com até 100 caracteres.");
    for (const value of values) {
      if (typeof value === "string") continue;
      if (!value || typeof value !== "object") throw new Error("Revise os itens do combo.");
      const choice = value as { description?: unknown; imageUrl?: unknown; productId?: unknown; priceDelta?: unknown };
      if (String(choice.description ?? "").length > 1000) throw new Error("A descrição de cada opção deve ter até 1.000 caracteres.");
      if (String(choice.imageUrl ?? "").length > 2048) throw new Error("A URL da imagem de uma opção é muito longa.");
      const linkedProduct = Number(choice.productId ?? 0);
      if (choice.productId != null && (!Number.isInteger(linkedProduct) || linkedProduct <= 0)) throw new Error("O produto vinculado a uma opção é inválido.");
      const priceDelta = Number(choice.priceDelta ?? 0);
      if (!Number.isFinite(priceDelta) || priceDelta < 0 || priceDelta > 10000) throw new Error("O acréscimo de cada opção deve ficar entre R$ 0 e R$ 10.000.");
    }
    const minimum = Number(option.minSelections ?? (option.kind === "addon" ? 0 : option.selectionCount ?? 1));
    const maximum = Number(option.maxSelections ?? option.selectionCount ?? 1);
    if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 0 || maximum < 1 || minimum > maximum || maximum > values.length || maximum > 20) throw new Error("O mínimo e o máximo de escolhas precisam caber nas opções do grupo.");
    totalMaximum += maximum;
  }
  if (totalMaximum > 20) throw new Error("A soma dos máximos dos grupos deve ser de até 20 escolhas.");
}

async function getAdminData(supabase: SupabaseClient) {
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
  try { return Response.json({ ...(await getAdminData(user.supabase)), user: { displayName: user.user.user_metadata?.full_name ?? user.user.email, email: user.user.email } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const user = await requireAdmin(request);
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const action = String(body.action ?? "");
  const supabase = user.supabase;
  try {
    if (action === "saveProduct") {
      const product = body.product as Record<string, unknown>;
      const options = parseJsonArray(product.optionsJson, "As opções do produto");
      validateProductOptions(options);
      const values = { name: String(product.name ?? "").trim(), description: String(product.description ?? "").trim(), price: Number(product.price), category_id: Number(product.categoryId), image_url: String(product.imageUrl ?? "sprite:0"), options, active: Boolean(product.active), sold_out: Boolean(product.soldOut), featured: Boolean(product.featured), sort_order: Number(product.sortOrder ?? 0) };
      if (!values.name || !Number.isFinite(values.price) || values.price <= 0) throw new Error("Preencha nome e preço corretamente.");
      const result = product.id
        ? await supabase.from("products").update(values).eq("id", Number(product.id)).select("id").single()
        : await supabase.from("products").insert(values).select("id").single();
      if (result.error) throw result.error;
    } else if (action === "deleteProduct") {
      const { error } = await supabase.from("products").delete().eq("id", Number(body.id)).select("id").single(); if (error) throw error;
    } else if (action === "saveCategory") {
      const category = body.category as Record<string, unknown>; const name = String(category.name ?? "").trim(); if (!name) throw new Error("Informe o nome da categoria.");
      const values = { name, slug: `${name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${category.id ?? Date.now()}`, active: Boolean(category.active), sort_order: Number(category.sortOrder ?? 0) };
      const result = category.id
        ? await supabase.from("categories").update(values).eq("id", Number(category.id)).select("id").single()
        : await supabase.from("categories").insert(values).select("id").single();
      if (result.error) throw result.error;
    } else if (action === "deleteCategory") {
      const { error } = await supabase.from("categories").delete().eq("id", Number(body.id)).select("id").single(); if (error) throw new Error(error.code === "23503" ? "Mova os produtos antes de excluir a categoria." : error.message);
    } else if (action === "updateOrderStatus") {
      const status = String(body.status); if (!["received", "confirmed", "preparing", "ready", "picked_up", "cancelled"].includes(status)) throw new Error("Status inválido.");
      const { error } = await supabase.from("orders").update({ status }).eq("id", Number(body.id)).select("id").single(); if (error) throw error;
    } else if (action === "saveSettings") {
      const settings = body.settings as Record<string, unknown>;
      const closedDays = parseJsonArray(settings.closedDaysJson, "Os dias fechados").map(Number);
      const paymentMethods = parseJsonArray(settings.paymentMethodsJson, "As formas de pagamento").map(String).filter(Boolean);
      if (closedDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error("Use números de 0 a 6 nos dias fechados.");
      if (!paymentMethods.length) throw new Error("Informe pelo menos uma forma de pagamento.");
      const values = { store_name: String(settings.storeName), phone: String(settings.phone), whatsapp: String(settings.whatsapp), instagram: String(settings.instagram), address: String(settings.address), maps_url: String(settings.mapsUrl), open_time: String(settings.openTime), close_time: String(settings.closeTime), interval_minutes: Number(settings.intervalMinutes), orders_per_slot: Number(settings.ordersPerSlot), prep_minutes: Number(settings.prepMinutes), closed_days: closedDays, payment_methods: paymentMethods, updated_at: new Date().toISOString() };
      const { error } = await supabase.from("store_settings").update(values).eq("id", 1).select("id").single(); if (error) throw error;
    } else return Response.json({ error: "Ação inválida." }, { status: 400 });
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar." }, { status: 400 }); }
}
