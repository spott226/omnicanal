import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NexoIA — Atención que convierte",
  description: "Centraliza tus conversaciones, califica prospectos y agenda citas con IA.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "NexoIA — Cada conversación, una oportunidad",
    description: "Atención omnicanal y automatización comercial con inteligencia artificial.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "NexoIA — Cada conversación, una oportunidad" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
