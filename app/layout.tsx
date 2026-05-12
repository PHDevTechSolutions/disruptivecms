import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/useAuth";
import { ReactQueryProvider } from "@/lib/react-query-provider";
import ServiceWorkerRegister from "@/app/components/ServiceWorkerRegister";
import "./globals.css";

// Fonts
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-sans",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Metadata
export const metadata: Metadata = {
  title: "JARIS CMS",
  description: "Internal CMS app for Disruptive Solutions Inc.",
  manifest: "/manifest.json",
  icons: {
    icon: "/jarislogo.png",
    shortcut: "/jarislogo.png",
    apple: "/jarislogo.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Jaris",
  },
  formatDetection: {
    telephone: false,
  },
};

// Viewport (better mobile PWA control)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#2563EB",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${jetbrainsMono.variable} ${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/jarislogo.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Jaris" />
      </head>

      <body
        className="w-full flex flex-col"
        style={{
          minHeight: "100vh",
          touchAction: "manipulation",
          overflowX: "hidden",
        }}
      >
        {/* Service Worker (cleaner than inline script) */}
        <ServiceWorkerRegister />

        <ReactQueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </ReactQueryProvider>

        {/* Toasts */}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
