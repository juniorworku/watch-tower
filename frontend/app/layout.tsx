import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Watch Tower", template: "%s · Watch Tower" },
  description: "Junior Worku's AI agent/bot shop dashboard",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
