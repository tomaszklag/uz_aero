/**
 * UZ Aero (serwer) — wspólna autoryzacja tras: `Authorization: Bearer <jwt>` → claims.
 *
 * Osobny moduł, bo używa go każda trasa poza `/auth/*` i `/health` — a wspólny kod
 * autoryzacji ma mieć jedno miejsce, w którym audyt czyta, co dokładnie przepuszczamy.
 */

import type { TokenService } from '../application/ports.ts';

export function authorize(
  tokens: TokenService,
  header: string | undefined,
): { pilotId: string; code: string } | null {
  if (header == null || !header.startsWith('Bearer ')) return null;
  return tokens.verify(header.slice('Bearer '.length));
}
