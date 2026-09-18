/**
 * Ninerdeck (serwer) - brama tras TELEFONU: token klubu + aktywne członkostwo.
 *
 * Odpowiednik `AdminGate` z `routes/admin/adminRoute.ts` dla powierzchni pilota
 * (epik C wielofirmowości, issue #99). Jeden obiekt zamiast dwóch parametrów w każdej
 * funkcji `register*`: brama ma dwa wejścia (weryfikacja tokenu i odczyt członkostwa),
 * a trzecie - gdyby doszło - ma się dołożyć TUTAJ, nie w dziesięciu sygnaturach.
 *
 * Trasa woła `memberFromRequest` i dostaje CZŁONKOSTWO (osoba + klub + kod + rola)
 * albo `null` → 401. Nie ma tu `Actor` jak w panelu, bo telefon nie pisze do dziennika
 * audytu - nadawcą zapisu jest `IngestSender` (osoba + klub) zbudowany z tego wyniku.
 */

import type { FastifyRequest } from 'fastify';

import type {
  MembershipAuthSnapshot,
  PilotsPort,
  TokenService,
} from '../application/common/ports.ts';
import { authorizeMember } from './authorize.ts';
import { touchSession, type SessionActivity } from './sessionTouch.ts';
import { tokenFromRequest } from './tokenFromRequest.ts';

export interface MemberGate extends SessionActivity {
  tokens: TokenService;
  /** Członkostwa czytane PRZY KAŻDYM ŻĄDANIU telefonu - patrz `authorizeMember`. */
  accounts: PilotsPort;
}

/**
 * Aktywny członek klubu z tokenu żądania; `null` = 401.
 *
 * Po udanym przejściu stempluje SESJĘ (2.1.0, §6) - stąd bierze się „ostatnio aktywny"
 * w karcie członka. Stempel pada TUTAJ, a nie w `authorizeMember`, bo tamta funkcja jest
 * czystą decyzją o dostępie i dzieli ją z bramą panelu; tu jesteśmy już w warstwie HTTP,
 * czyli w jedynym miejscu, które zna żądanie (adres, nagłówek urządzenia).
 */
export async function memberFromRequest(
  gate: MemberGate,
  req: FastifyRequest,
): Promise<MembershipAuthSnapshot | null> {
  const account = await authorizeMember(gate.tokens, gate.accounts, tokenFromRequest(req));
  if (account != null) await touchSession(gate, req, account.sessionId);
  return account;
}
