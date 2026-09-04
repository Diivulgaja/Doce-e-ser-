import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Painel | Doce é Ser",
  description: "Painel privado de pedidos e cardápio da Doce é Ser.",
  manifest: "/admin-manifest.webmanifest",
  robots: { index: false, follow: false, nocache: true },
  icons: {
    icon: "/assets/logo-doce-e-ser.png",
    apple: "/assets/logo-doce-e-ser.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#4b2514",
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
