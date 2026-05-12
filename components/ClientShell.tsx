"use client";

import { SocketProvider } from "./SocketProvider";

export function ClientShell({ children }: { children: React.ReactNode }) {
  return <SocketProvider>{children}</SocketProvider>;
}
