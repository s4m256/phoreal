import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Treino de Física",
  description: "Acompanhamento pessoal de treino para olimpíadas de física.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><header className="topbar"><Link className="brand" href="/">Treino de Física</Link><nav aria-label="Principal"><Link href="/">Resumo</Link><Link href="/catalogo">Catálogo XY</Link><Link href="/simulados">Simulados</Link></nav></header><main className="shell">{children}</main></body></html>;
}
