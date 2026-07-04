import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const interFont = Inter({
  subsets: ['latin'],
  variable: '--font-ui',
});

const jetbrainsMonoFont = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-numeric',
});

export const metadata: Metadata = {
  title: 'CALLED IT',
  description:
    'Free live prediction game for the 2026 World Cup. Every call is priced by the market. Call it, prove it.',
};

export const viewport: Viewport = {
  themeColor: '#0A0F0B',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${interFont.variable} ${jetbrainsMonoFont.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
