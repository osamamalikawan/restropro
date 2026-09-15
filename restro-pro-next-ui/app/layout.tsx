import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Restro Pro",
  description: "Run your restaurant. Smarter.",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#161310",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(console.error);
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
