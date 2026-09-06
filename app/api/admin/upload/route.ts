import { requireAdmin } from "@/lib/supabase";

const imageTypes = {
  "image/jpeg": { extension: "jpg", valid: (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  "image/png": { extension: "png", valid: (bytes: Uint8Array) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value) },
  "image/webp": { extension: "webp", valid: (bytes: Uint8Array) => new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP" },
  "image/avif": { extension: "avif", valid: (bytes: Uint8Array) => new TextDecoder().decode(bytes.slice(4, 32)).includes("ftypavif") || new TextDecoder().decode(bytes.slice(4, 32)).includes("ftypavis") },
} as const;

export async function POST(request: Request) {
  const user = await requireAdmin(request);
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 403 });
  const form = await request.formData(); const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Selecione uma imagem." }, { status: 400 });
  const imageType = imageTypes[file.type.toLowerCase() as keyof typeof imageTypes];
  if (!imageType || file.size <= 0 || file.size > 8_000_000) return Response.json({ error: "Use uma imagem JPG, PNG, WEBP ou AVIF de até 8 MB." }, { status: 400 });
  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  if (!imageType.valid(header)) return Response.json({ error: "O conteúdo do arquivo não corresponde a uma imagem válida." }, { status: 400 });
  const extension = imageType.extension;
  const path = `${crypto.randomUUID()}.${extension}`;
  const supabase = user.supabase;
  const { error } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type.toLowerCase(), upsert: false, cacheControl: "31536000" });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ url: supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl });
}
