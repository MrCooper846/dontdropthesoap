import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export function securityHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  origin: string,
  production: boolean,
) {
  const nonce = randomBytes(24).toString("base64");
  const socket = new URL(origin);
  socket.protocol = socket.protocol === "https:" ? "wss:" : "ws:";
  const policy = [
    "default-src 'self'",
    "script-src 'self' 'nonce-" +
      nonce +
      "' 'strict-dynamic'" +
      (production ? "" : " 'unsafe-eval'"),
    // Blockly and Phaser position elements and inject styles at runtime.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "connect-src 'self' " + socket.origin,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  // Never trust a caller-supplied nonce/policy. Next reads the request policy
  // while generating its own framework and hydration script tags.
  req.headers["content-security-policy"] = policy;
  req.headers["x-nonce"] = nonce;
  res.setHeader("Content-Security-Policy", policy);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Permissions-Policy",
    "microphone=(self), camera=(), geolocation=()",
  );
}
