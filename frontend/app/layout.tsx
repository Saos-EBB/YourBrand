import type { Metadata } from "next";
import {
  Plus_Jakarta_Sans, Bricolage_Grotesque, DM_Sans, Archivo, Atkinson_Hyperlegible,
  Big_Shoulders, Barlow, JetBrains_Mono,
} from "next/font/google";
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

// Schriften der Mandanten (theme.layout.font). Alle deklariert, der Browser
// laedt nur die, die per data-font in globals.css auch benutzt werden.
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });
const atkinson = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-atkinson" });
const bigShoulders = Big_Shoulders({ subsets: ["latin"], variable: "--font-big-shoulders" });
const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-barlow" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
const fontVariables = [plusJakartaSans, bricolage, dmSans, archivo, atkinson, bigShoulders, barlow, jetbrains]
  .map((f) => f.variable).join(" ");

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
  const tokensCss = themeTokensCss(tenant.theme);
  const { layout } = tenant.theme;
  // Nur "dark" | "light" (Backend-validiert) — sicher im Inline-Script.
  const defaultTheme = tenant.theme.default === "light" ? "light" : "dark";
  const lang = tenant.locale.default.startsWith("de") ? "de" : tenant.locale.default === "leet" ? "en" : tenant.locale.default;

  return (
    <html
      lang={lang}
      // Schrift-Variablen auf <html>, damit --font-sans aus @theme (auf :root)
      // sie aufloesen kann; auf <body> waren sie dort undefiniert.
      className={fontVariables}
      suppressHydrationWarning
      data-nav={layout.nav}
      data-font={layout.font}
      data-radius={layout.radius}
      style={layout.textScale !== 1 ? { fontSize: `${layout.textScale * 100}%` } : undefined}
    >
      {/* Ternary statt &&: ein leerer String waere ein Textknoten im <head> -> Hydration-Fehler */}
      <head>{tokensCss ? <style id="tenant-theme">{tokensCss}</style> : null}</head>
      <body className={`bg-background min-h-screen font-sans text-on-surface`}>
        <Script id="theme-init" strategy="beforeInteractive">{`(function(){try{var t=localStorage.getItem('xxx-theme');var st=t?JSON.parse(t).state:null;var theme=st?st.theme:null;document.documentElement.classList.add((theme||'${defaultTheme}')==='light'?'light':'dark');if(st&&st.classicPalette)document.documentElement.classList.add('palette-classic');}catch(e){document.documentElement.classList.add('${defaultTheme}');}})();`}</Script>
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
