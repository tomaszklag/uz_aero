/**
 * Ninerdeck (serwer) - POZYCJA SKRZYNKI W KSZTAŁCIE REST (skrzynka 3.1.0, issue #164;
 * ramka `notification` kanału klubu 4.0.0, `docs/kanal-klubu.md` §3.2, epik Z-E #246).
 *
 * ══ JEDEN KSZTAŁT DLA ODCZYTU I DLA KANAŁU ══
 * Tę samą pozycję oddaje `GET /me/notifications` i niesie ramka, którą rozdzielnik
 * wysyła połączonym sesjom odbiorcy (K4). Telefon i panel rysują wiersz skrzynki jednym
 * kodem, niezależnie od tego, czy przyszedł odczytem, czy kanałem - dwie kopie tego
 * kształtu rozjechałyby się przy pierwszym nowym polu i baner mówiłby co innego niż
 * wiersz, który pilot zobaczy po otwarciu skrzynki.
 */

import { clubDays } from '../../../domain/clubTime.ts';
import type { NotificationRecord } from '../ports.ts';

/** Doba klubu terminu, o którym mówi wiadomość - granice jako chwile ISO. */
export interface TermDay {
  date: string;
  startsAt: string;
  endsAt: string;
}

export interface InboxItem {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
  /**
   * DOBA KLUBU terminu, o którym mówi wiadomość (3.1.0, epik R-I). Telefon nie zna stref
   * i liczy godziny odejmowaniem od granic doby (§6.1) - bez nich „sob 26 wrz 09:00-12:00"
   * w skrzynce musiałby iść w UTC, czyli inną godziną niż na osi kalendarza obok.
   * `null`, gdy wiadomość nie mówi o terminie albo stempel nie daje się przeczytać.
   */
  day: TermDay | null;
}

function termDayOf(timezone: string, payload: Record<string, unknown>): TermDay | null {
  const startsAt = typeof payload.startsAt === 'string' ? Date.parse(payload.startsAt) : NaN;
  if (!Number.isFinite(startsAt)) return null;
  const day = clubDays(timezone, startsAt, startsAt + 1, 1)[0];
  if (day == null) return null;
  return {
    date: day.date,
    startsAt: new Date(day.startsAt).toISOString(),
    endsAt: new Date(day.endsAt).toISOString(),
  };
}

/** Wiersz skrzynki tak, jak widzi go klient; `timezone` = strefa klubu wiadomości. */
export function inboxItem(n: NotificationRecord, timezone: string): InboxItem {
  return {
    id: n.id,
    kind: n.kind,
    payload: n.payload,
    createdAt: new Date(n.createdAt).toISOString(),
    readAt: n.readAt == null ? null : new Date(n.readAt).toISOString(),
    day: termDayOf(timezone, n.payload),
  };
}
