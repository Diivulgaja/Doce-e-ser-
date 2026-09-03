import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Doce é Ser | Doceria & Confeitaria",
  description: "Doces artesanais para pedir online e retirar na loja.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/assets/logo-doce-e-ser.png",
    apple: "/assets/logo-doce-e-ser.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
