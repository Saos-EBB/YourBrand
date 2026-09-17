import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeInitializer } from "@/components/ThemeInitializer";
import { HiddenInitializer } from "@/components/HiddenInitializer";
import { BackendHealthGate } from "@/components/BackendHealthGate";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
});

export const metadata: Metadata = {
  title: "YourDemo",
  description: "Barrierefreie Dating-App",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head />
      <body className={`${plusJakartaSans.variable} bg-background min-h-screen font-sans text-on-surface`}>
        <Script id="theme-init" strategy="beforeInteractive">{`(function(){try{var t=localStorage.getItem('xxx-theme');var theme=t?JSON.parse(t).state?.theme:null;document.documentElement.classList.add(theme==='light'?'light':'dark');}catch(e){document.documentElement.classList.add('dark');}})();`}</Script>
        <ThemeInitializer />
        <HiddenInitializer />
        <BackendHealthGate>{children}</BackendHealthGate>
      </body>
    </html>
  );
}
