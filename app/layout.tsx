import type { Metadata, Viewport } from "next";
import { ClientShell } from "@/components/ClientShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Don't Drop The Soap",
  description: "A fast Prisoner's Dilemma party game for phones.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ClientShell legacy={process.env.SOAP_LEGACY === "true"}>
          {children}
        </ClientShell>
      </body>
    </html>
  );
}
