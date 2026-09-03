import { getSupabaseAdmin, requireAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  const user = await requireAdmin(request);
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 403 });
  const form = await request.formData(); const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Selecione uma imagem." }, { status: 400 });
  if (!file.type.startsWith("image/") || file.size > 8_000_000) return Response.json({ error: "Use uma imagem de até 8 MB." }, { status: 400 });
  const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "jpg";
  const path = `${crypto.randomUUID()}.${extension}`;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type, upsert: false });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ url: supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl });
}
