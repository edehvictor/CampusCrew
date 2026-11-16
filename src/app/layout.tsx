import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Campuscrew | Book local services",
  description: "Book local services on your own or with neighbours.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
