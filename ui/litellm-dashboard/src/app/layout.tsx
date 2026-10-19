import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ThemeProvider } from "next-themes";

import { AuthProvider } from "@/contexts/AuthContext";
import ReactQueryProvider from "@/contexts/ReactQueryProvider";
import HotkeysProvider from "@/contexts/HotkeysProvider";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_SEMANTIER_GATEWAY === "1" ? "Semantier Model Gateway" : "LiteLLM Dashboard",
  description: "LiteLLM Proxy Admin UI",
  icons: { icon: process.env.NEXT_PUBLIC_SEMANTIER_GATEWAY === "1" ? "/ui/semantier.svg" : "/get_favicon" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // next-themes stamps the theme class on <html> before paint, which the exported markup
    // cannot predict; suppressHydrationWarning confines that mismatch to this element.
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <NuqsAdapter>
            <ReactQueryProvider>
              <HotkeysProvider>
                <AuthProvider>{children}</AuthProvider>
              </HotkeysProvider>
              <Toaster />
            </ReactQueryProvider>
          </NuqsAdapter>
        </ThemeProvider>
      </body>
    </html>
  );
}
