import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { chatGPTSignOutPath, getChatGPTUser } from "./chatgpt-auth";

export const metadata: Metadata = {
  title: "PhoReal",
  description: "Treino de física olímpica.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user=await getChatGPTUser();
  return <html lang="pt-BR"><body><header className="topbar"><Link className="brand" href="/">PhoReal</Link><div className="topbar-right"><nav aria-label="Principal"><Link href="/">Resumo</Link><Link href="/problemas">Problemas</Link><Link href="/simulados">Simulados</Link><Link href="/laboratorio">Laboratório</Link></nav>{user&&<div className="account-area"><span title={user.email}>{user.displayName}</span><a href={chatGPTSignOutPath("/")}>Sair</a></div>}</div></header><main className="shell">{children}</main></body></html>;
}
