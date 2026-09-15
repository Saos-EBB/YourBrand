// CORS_ORIGIN ist komma-separiert (mehrere Frontend-Domains, z.B. lokal +
// Vercel + Portfolio), damit main.ts und die WebSocket-Gateways (chat, beef)
// dieselbe Liste ohne Kopien parsen.
export function getCorsOrigins(fallback: string): string[] {
  const raw = process.env.CORS_ORIGIN ?? fallback;
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
}
