import type { Metadata } from "next";
import NexoApp from "./NexoApp";

export const metadata: Metadata = {
  title: "NexoIA — Atención que convierte",
  description: "Bandeja omnicanal y automatización comercial con inteligencia artificial.",
};

export default function Home() {
  return <NexoApp />;
}
