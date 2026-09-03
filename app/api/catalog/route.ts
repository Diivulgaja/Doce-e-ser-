import { getSupabasePublic, toCategory, toProduct, toSettings } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function describeSupabaseError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; message?: unknown; hint?: unknown };
    return [value.code, value.message, value.hint]
      .filter((item): item is string => typeof item === "string" && item.length > 0)
      .join(" · ");
  }
  return "Erro desconhecido ao consultar o Supabase.";
}

export async function GET() {
  try {
    const supabase = getSupabasePublic();
    const [{ data: categories, error: categoryError }, { data: products, error: productError }, { data: settings, error: settingsError }] = await Promise.all([
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("products").select("*").order("sort_order"),
      supabase.from("store_settings").select("*").eq("id", 1).single(),
    ]);
    const error = categoryError ?? productError ?? settingsError;
    if (error) throw error;
    return Response.json({ categories: (categories ?? []).map(toCategory), products: (products ?? []).map(toProduct), settings: toSettings(settings) });
  } catch (error) {
    const diagnostic = describeSupabaseError(error);
    console.error("Falha ao carregar o cardápio:", diagnostic);
    return Response.json(
      { error: "Não foi possível carregar o cardápio." },
      { status: 500 },
    );
  }
}
