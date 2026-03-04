import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MacroData — Ассистент",
  description: "ИИ-ассистент по данным застройщика. Задайте вопрос в свободной форме.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased min-h-full flex flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
