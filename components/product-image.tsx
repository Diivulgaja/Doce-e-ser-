import Image from "next/image";
import { cn } from "@/lib/utils";

export default function ProductImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  if (src.startsWith("sprite:")) {
    const index = Number(src.split(":")[1] ?? 0) % 4;
    const positions = ["0% 0%", "100% 0%", "0% 100%", "100% 100%"];
    return (
      <div className={cn("relative overflow-hidden bg-[#d8b388]", className)} role="img" aria-label={alt}>
        <Image src="/assets/catalogo-doces.png" alt="" fill sizes="(max-width: 768px) 50vw, 25vw" className="max-w-none object-none" style={{ width: "200%", height: "200%", maxWidth: "none", objectFit: "cover", objectPosition: positions[index] }} />
      </div>
    );
  }
  return <div className={cn("relative overflow-hidden bg-[#eadcc9]", className)}><Image src={src} alt={alt} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover" unoptimized /></div>;
}
