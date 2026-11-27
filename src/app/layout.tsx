import { PwaRegister } from "@/components/shared/pwa-controls";
import type { Metadata } from "next";
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "@fontsource-variable/eb-garamond/wght.css";
import "./globals.css";
import "@/components/shared/brand-loader.css";

export const metadata: Metadata = {
  title: "Campuscrew | Book local services",
  icons: { apple: "/icons/icon-192.png" },
  description:
    "Book local services on your own or with neighbours. Built on Stellar.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
