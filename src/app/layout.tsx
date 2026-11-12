import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://aiospark.com"),
  title: "AIOSpark — AI that recovers working capital from overdue invoices",
  description:
    "AIOSpark finds overdue invoices, diagnoses why cash is stuck, and executes recovery workflows automatically. Built for CFOs, finance controllers, and AR teams in India. Recover trapped cash 18 days faster.",
  keywords: ["accounts receivable automation", "AR automation India", "invoice recovery", "working capital", "CFO tools", "finance automation"],
  authors: [{ name: "AIOSpark" }],
  openGraph: {
    title: "AIOSpark — AI that recovers working capital from overdue invoices",
    description: "Find overdue invoices, diagnose why cash is stuck, and execute recovery workflows automatically. Built for finance teams in India.",
    type: "website",
    url: "https://aiospark.com",
    siteName: "AIOSpark",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AIOSpark AI Accounts Receivable Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AIOSpark — AI that recovers working capital from overdue invoices",
    description: "Find overdue invoices, diagnose why cash is stuck, and execute recovery workflows automatically.",
    images: ["/og-image.png"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
