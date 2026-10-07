import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeInitializer } from "@/components/ThemeInitializer";
import { HiddenInitializer } from "@/components/HiddenInitializer";
import { BackendHealthGate } from "@/components/BackendHealthGate";
import { DemoBanner } from "@/components/DemoBanner";
import { TenantProvider } from "@/components/TenantProvider";
import { getTenant } from "@/lib/tenant/server";
import { themeTokensCss } from "@/lib/tenant/types";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
});

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenant();
  return {
    title: tenant.brand.name,
    description: "Barrierefreie Dating-App",
    // Standard-Favicon liegt in public/, nicht app/ — eine app/favicon.ico
    // haette Vorrang vor icons und ueberstimmte das Mandanten-Favicon.
    icons: { icon: tenant.brand.favicon ? `/api/v1/tenant/asset/${tenant.brand.favicon}` : "/favicon.ico" },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Mandanten-Config (GET /api/v1/tenant) — Branding, Theme, Sprache, Module.
  const tenant = await getTenant();
  const tokensCss = themeTokensCss(tenant.theme.tokens);
  // Nur "dark" | "light" (Backend-validiert) — sicher im Inline-Script.
  const defaultTheme = tenant.theme.default === "light" ? "light" : "dark";
  const lang = tenant.locale.default.startsWith("de") ? "de" : tenant.locale.default === "leet" ? "en" : tenant.locale.default;

  return (
    <html lang={lang} suppressHydrationWarning>
      {/* Ternary statt &&: ein leerer String waere ein Textknoten im <head> -> Hydration-Fehler */}
      <head>{tokensCss ? <style id="tenant-theme">{tokensCss}</style> : null}</head>
      <body className={`${plusJakartaSans.variable} bg-background min-h-screen font-sans text-on-surface`}>
        <Script id="theme-init" strategy="beforeInteractive">{`(function(){try{var t=localStorage.getItem('xxx-theme');var theme=t?JSON.parse(t).state?.theme:null;document.documentElement.classList.add((theme||'${defaultTheme}')==='light'?'light':'dark');}catch(e){document.documentElement.classList.add('${defaultTheme}');}})();`}</Script>
        <TenantProvider config={tenant}>
          <DemoBanner />
          <ThemeInitializer />
          <HiddenInitializer />
          <BackendHealthGate>{children}</BackendHealthGate>
        </TenantProvider>
      </body>
    </html>
  );
}
