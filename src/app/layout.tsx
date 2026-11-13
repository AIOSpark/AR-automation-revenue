import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://aiospark.com"),
  title: "AIOSpark — Turn overdue invoices into working capital",
  description:
    "AIOSpark is an intelligent accounts receivable execution platform that identifies blocked cash, prioritizes collection actions, and helps finance teams recover revenue faster. Built for CFOs, finance controllers, and AR teams in India.",
  keywords: ["accounts receivable automation", "AR automation India", "invoice recovery", "working capital", "CFO tools", "finance automation"],
  authors: [{ name: "AIOSpark" }],
  openGraph: {
    title: "AIOSpark — Turn overdue invoices into working capital",
    description: "An intelligent accounts receivable execution platform for CFOs, finance controllers, and AR teams in India.",
    type: "website",
    url: "https://aiospark.com",
    siteName: "AIOSpark",
  },
  twitter: {
    card: "summary_large_image",
    title: "AIOSpark — Turn overdue invoices into working capital",
    description: "An intelligent accounts receivable execution platform for finance teams in India.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <head />
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}