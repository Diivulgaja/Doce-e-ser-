import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null | undefined;

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

function normalizeSupabaseUrl(rawValue: string) {
  const raw = rawValue.trim();
  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("A variável NEXT_PUBLIC_SUPABASE_URL não contém uma URL válida.");
  }

  // Aceita por engano tanto a URL REST quanto o link do painel do projeto.
  const dashboardProject = parsed.pathname.match(/\/project\/([a-z0-9]+)/i)?.[1];
  if (dashboardProject && (parsed.hostname === "supabase.com" || parsed.hostname === "www.supabase.com")) {
    return `https://${dashboardProject}.supabase.co`;
  }

  return parsed.origin;
}

function supabaseUrl() {
  return normalizeSupabaseUrl(env("NEXT_PUBLIC_SUPABASE_URL"));
}

function supabasePublicKey() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("Chave pública do Supabase não configurada.");
  return key;
}

export function getSupabasePublic() {
  return createClient(supabaseUrl(), supabasePublicKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getSupabaseUser(token: string) {
  return createClient(supabaseUrl(), supabasePublicKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export function getSupabaseAdmin() {
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) throw new Error("Variável SUPABASE_SECRET_KEY não configurada.");
  return createClient(supabaseUrl(), secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getSupabaseBrowser() {
  if (browserClient !== undefined) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    browserClient = null;
    return browserClient;
  }
  browserClient = createClient(normalizeSupabaseUrl(url), key);
  return browserClient;
}

export async function requireAdmin(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;
  const authClient = getSupabaseUser(token);
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user?.email) return null;
  const { data: allowed } = await authClient.from("admins").select("id").eq("user_id", user.id).maybeSingle();
  return allowed ? { user, supabase: authClient } : null;
}

export const toCategory = (row: Record<string, unknown>) => ({ id: Number(row.id), name: String(row.name), slug: String(row.slug), sortOrder: Number(row.sort_order), active: Boolean(row.active) });
export const toProduct = (row: Record<string, unknown>) => ({ id: Number(row.id), categoryId: Number(row.category_id), name: String(row.name), description: String(row.description ?? ""), price: Number(row.price), imageUrl: String(row.image_url ?? "sprite:0"), optionsJson: JSON.stringify(row.options ?? []), active: Boolean(row.active), soldOut: Boolean(row.sold_out), featured: Boolean(row.featured), sortOrder: Number(row.sort_order) });
export const toSettings = (row: Record<string, unknown>) => ({ id: Number(row.id), storeName: String(row.store_name), phone: String(row.phone), whatsapp: String(row.whatsapp), instagram: String(row.instagram), address: String(row.address), mapsUrl: String(row.maps_url ?? ""), openTime: String(row.open_time).slice(0, 5), closeTime: String(row.close_time).slice(0, 5), intervalMinutes: Number(row.interval_minutes), ordersPerSlot: Number(row.orders_per_slot), ordersPerDay: Number(row.orders_per_day ?? 50), closedDaysJson: JSON.stringify(row.closed_days ?? [0]), prepMinutes: Number(row.prep_minutes), paymentMethodsJson: JSON.stringify(row.payment_methods ?? ["PIX"]) });
export const toOrder = (row: Record<string, unknown>) => ({ id: Number(row.id), orderNumber: String(row.order_number), customerName: String(row.customer_name), phone: String(row.phone), pickupDate: String(row.pickup_date), pickupTime: row.pickup_time ? String(row.pickup_time).slice(0, 5) : null, notes: String(row.notes ?? ""), paymentMethod: String(row.payment_method), paymentStatus: String(row.payment_status ?? "legacy"), paidAt: row.paid_at ? String(row.paid_at) : null, status: String(row.status), total: Number(row.total), createdAt: String(row.created_at), items: ((row.order_items ?? []) as Record<string, unknown>[]).map((item) => ({ id: Number(item.id), productId: Number(item.product_id), productName: String(item.product_name), quantity: Number(item.quantity), unitPrice: Number(item.unit_price), optionsJson: JSON.stringify(item.options ?? []), notes: String(item.notes ?? "") })) });
