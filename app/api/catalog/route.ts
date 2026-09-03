import { getSupabaseAdmin, toCategory, toProduct, toSettings } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const [{ data: categories, error: categoryError }, { data: products, error: productError }, { data: settings, error: settingsError }] = await Promise.all([
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("products").select("*").order("sort_order"),
      supabase.from("store_settings").select("*").eq("id", 1).single(),
    ]);
    const error = categoryError ?? productError ?? settingsError;
    if (error) throw error;
    return Response.json({ categories: (categories ?? []).map(toCategory), products: (products ?? []).map(toProduct), settings: toSettings(settings) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar o cardápio." }, { status: 500 });
  }
}
