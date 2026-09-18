/**
 * Ninerdeck (serwer) - STEMPEL AKTYWNOŚCI SESJI (2.1.0, issue #133 C5; §6).
 *
 * „Ostatnio aktywny · telefon · 3 min temu" w karcie członka bierze się stąd: każde
 * żądanie, które przeszło bramę, mówi o swojej sesji „ta jeszcze pracuje". Razem ze
 * stemplem idzie adres i urządzenie, bo to ta sama wiedza i ten sam zapis.
 *
 * ══ PRZEPUSTNICA, BO INACZEJ KAŻDY ODCZYT BYŁBY ZAPISEM ══
 * Telefon w locie synchronizuje się co minutę i wysyła paczki ingestu, panel odpytuje
 * listy przy każdym kliknięciu. Bez `LastSeenThrottle` każde z tych żądań dokładałoby
 * `UPDATE` - a różnica między „teraz" a „minutę temu" nie zmienia ani jednego napisu
 * na ekranie.
 *
 * ══ STEMPEL JEST CZĘŚCIĄ ŻĄDANIA, NIE TŁEM ══
 * Czekamy na zapis zamiast puszczać go luzem. Raz na minutę na sesję, po kluczu głównym,
 * więc koszt jest żaden - a obietnica „nie zgubimy tego stempla" warta jest więcej niż
 * zaoszczędzone mikrosekundy. Zapis puszczony bez `await` kończyłby się przy okazji
 * odrzuconą obietnicą w logach przy każdym zerwaniu połączenia z bazą.
 */

import type { FastifyRequest } from 'fastify';

import type { Clock, LoginSessionsPort } from '../application/common/ports.ts';
import type { LastSeenThrottle } from '../application/common/lastSeenThrottle.ts';
import { deviceFrom } from './device.ts';

/** Zależności stempla - wspólne dla bramy telefonu i bramy panelu. */
export interface SessionActivity {
  sessions: LoginSessionsPort;
  /**
   * JEDEN egzemplarz na proces (składa go composition root): przepustnica pamięta, kiedy
   * ostatnio zapisała którą sesję, więc druga kopia liczyłaby własne okno i zapisy padałyby
   * dwa razy częściej, niż mówi reguła.
   */
  lastSeen: LastSeenThrottle;
  clock: Clock;
}

/**
 * `sessionId` = `null` znaczy „token sprzed 2.1.0" - nie ma czego stemplować i nie ma
 * w tym nic niepokojącego: taki token i tak zniknie w ciągu godziny.
 */
export async function touchSession(
  activity: SessionActivity,
  req: FastifyRequest,
  sessionId: string | null,
): Promise<void> {
  if (sessionId == null) return;
  const now = activity.clock.now();
  if (!activity.lastSeen.due(sessionId, now)) return;
  await activity.sessions.touch(sessionId, now, deviceFrom(req));
}
