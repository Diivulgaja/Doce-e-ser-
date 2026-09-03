import { createClient } from "@supabase/supabase-js";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

export function getSupabaseAdmin() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getSupabasePublic() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getSupabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function requireAdmin(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const authClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user?.email) return null;
  const admin = getSupabaseAdmin();
  const { data: adminRows } = await admin.from("admins").select("id,email").limit(1);
  const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase();
  if (!adminRows?.length && bootstrapEmail === user.email.toLowerCase()) {
    await admin.from("admins").insert({ email: user.email.toLowerCase(), user_id: user.id });
    return user;
  }
  const { data: allowed } = await admin.from("admins").select("id").eq("user_id", user.id).maybeSingle();
  return allowed ? user : null;
}

export const toCategory = (row: Record<string, unknown>) => ({ id: Number(row.id), name: String(row.name), slug: String(row.slug), sortOrder: Number(row.sort_order), active: Boolean(row.active) });
export const toProduct = (row: Record<string, unknown>) => ({ id: Number(row.id), categoryId: Number(row.category_id), name: String(row.name), description: String(row.description ?? ""), price: Number(row.price), imageUrl: String(row.image_url ?? "sprite:0"), optionsJson: JSON.stringify(row.options ?? []), active: Boolean(row.active), soldOut: Boolean(row.sold_out), featured: Boolean(row.featured), sortOrder: Number(row.sort_order) });
export const toSettings = (row: Record<string, unknown>) => ({ id: Number(row.id), storeName: String(row.store_name), phone: String(row.phone), whatsapp: String(row.whatsapp), instagram: String(row.instagram), address: String(row.address), mapsUrl: String(row.maps_url ?? ""), openTime: String(row.open_time).slice(0, 5), closeTime: String(row.close_time).slice(0, 5), intervalMinutes: Number(row.interval_minutes), ordersPerSlot: Number(row.orders_per_slot), closedDaysJson: JSON.stringify(row.closed_days ?? [0]), prepMinutes: Number(row.prep_minutes), paymentMethodsJson: JSON.stringify(row.payment_methods ?? ["PIX", "Cartão", "Dinheiro"]) });
export const toOrder = (row: Record<string, unknown>) => ({ id: Number(row.id), orderNumber: String(row.order_number), customerName: String(row.customer_name), phone: String(row.phone), pickupDate: String(row.pickup_date), pickupTime: String(row.pickup_time).slice(0, 5), notes: String(row.notes ?? ""), paymentMethod: String(row.payment_method), status: String(row.status), total: Number(row.total), createdAt: String(row.created_at), items: ((row.order_items ?? []) as Record<string, unknown>[]).map((item) => ({ id: Number(item.id), productId: Number(item.product_id), productName: String(item.product_name), quantity: Number(item.quantity), unitPrice: Number(item.unit_price), optionsJson: JSON.stringify(item.options ?? []), notes: String(item.notes ?? "") })) });
