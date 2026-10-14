"use client";
import { SocketProvider } from "./SocketProvider";
export function ClientShell({
  children,
  legacy = false,
}: {
  children: React.ReactNode;
  legacy?: boolean;
}) {
  return legacy ? <SocketProvider>{children}</SocketProvider> : children;
}
