import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Harbour Care Centre — On Duty",
  description: "Who is on duty on each floor at Harbour Care Centre",
  // Staff photographs and a rota have no business in a search index, and the
  // board is reachable from the internet through the tunnel.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The board is a fixed-size panel; pinch-zoom only strands it half-scrolled
  // with nobody around who knows how to reset it.
  maximumScale: 1,
  userScalable: false,
  themeColor: "#7c1b1b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
