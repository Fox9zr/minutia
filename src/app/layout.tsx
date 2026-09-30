import type { Metadata } from "next";
import localFont from "next/font/local";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Providers } from "@/lib/providers";
import "./globals.css";

const hyperlegible = localFont({
  src: "./fonts/AtkinsonHyperlegibleNext-Variable.woff2",
  variable: "--font-hyperlegible",
  weight: "200 800",
  display: "swap",
});

const fraunces = localFont({
  src: "./fonts/Fraunces-Variable.woff2",
  variable: "--font-fraunces",
  display: "swap",
});

const jetbrains = localFont({
  src: "./fonts/JetBrainsMono-Variable.woff2",
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Kotrol",
    template: "%s | Kotrol",
  },
  description:
    "Реестр встреч, поручений и контроля исполнения.",
  icons: {
    icon: { url: "/icon-192.png", type: "image/png" },
    apple: "/icon-192.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "Kotrol",
    description:
      "Реестр встреч, поручений и контроля исполнения.",
    type: "website",
  },
  other: {
    "theme-color": "#FF5B14",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${hyperlegible.variable} ${fraunces.variable} ${jetbrains.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <TooltipProvider>{children}</TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
