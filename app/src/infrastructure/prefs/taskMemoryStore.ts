/**
 * UZ Aero — pamięć OSTATNIEGO ZADANIA: rodzaj operacji i klient per pilot, trasa per
 * samolot (magazyn klucz→wartość, produkcyjnie AsyncStorage).
 *
 * Po co to istnieje: krok „co dziś robimy" (02e) opisuje rzeczy, które z dnia na dzień
 * najczęściej się NIE zmieniają — skoki nad tym samym lotniskiem, dla tego samego
 * klienta. Bez pamięci ten krok byłby codziennym tapnięciem w pusty formularz, żeby
 * zostawić wszystko jak było. Z pamięcią pilot **potwierdza to, co widzi**, a formularz
 * wypełnia się tylko wtedy, gdy coś się faktycznie zmieniło.
 *
 * Dlaczego trasa per SAMOLOT, a operacja i klient per PILOT: trasa jest własnością
 * maszyny w danym miejscu (An-2 lata ze swojego lotniska, przelot ma swoją parę ICAO),
 * a rodzaj operacji i zleceniodawca chodzą za człowiekiem, także gdy przesiądzie się
 * na inny samolot.
 *
 * To PREFERENCJA INTERFEJSU, nie fakt z dnia lotnego — dlatego AsyncStorage, a nie
 * rejestr zdarzeń (ten jest append-only i opisuje lot, nie podpowiedzi formularza).
 * Zapis nigdy nie jest źródłem prawdy: to, co trafia do rejestru, pilot zatwierdza
 * świadomie na ekranie 03.
 *
 * Klasa dostaje magazyn KONSTRUKTOREM, jak `ThemePrefsStore` — dzięki temu format
 * zapisu sprawdzamy w Node, bez urządzenia.
 */

import type { OperationType } from '../../domain';
import type { KeyValueStorage } from './themePrefsStore';

/** Rodzaj operacji i oznaczenie klienta — zapamiętane per pilot. */
export interface RememberedTask {
  operation: OperationType;
  client: string | null;
}

/** Para lotnisk — zapamiętana per samolot. */
export interface RememberedRoute {
  departureIcao: string;
  arrivalIcao: string;
}

const OPERATIONS: readonly OperationType[] = ['skoki', 'ferry', 'egzamin', 'techniczny', 'inne'];

const taskKey = (pilotId: string): string => `uzaero.task.${pilotId}`;
const routeKey = (aircraftId: string): string => `uzaero.route.${aircraftId}`;

export class TaskMemoryStore {
  constructor(private readonly kv: KeyValueStorage) {}

  async readTask(pilotId: string): Promise<RememberedTask | null> {
    return decodeTask(await this.kv.getItem(taskKey(pilotId)));
  }

  async writeTask(pilotId: string, task: RememberedTask): Promise<void> {
    await this.kv.setItem(taskKey(pilotId), JSON.stringify(task));
  }

  async readRoute(aircraftId: string): Promise<RememberedRoute | null> {
    return decodeRoute(await this.kv.getItem(routeKey(aircraftId)));
  }

  async writeRoute(aircraftId: string, route: RememberedRoute): Promise<void> {
    await this.kv.setItem(routeKey(aircraftId), JSON.stringify(route));
  }
}

/**
 * Zepsuty albo obcy zapis = brak pamięci, nie wyjątek. Podpowiedź jest udogodnieniem;
 * jej utrata kosztuje pilota jedno wpisanie, a wyjątek kosztowałby ekran.
 *
 * Nieznany rodzaj operacji odrzucamy w całości: gdyby przeszedł, siatka kart nie miałaby
 * czego zaznaczyć, a do rejestru poszłaby wartość spoza słownika (§3.1).
 */
function decodeTask(raw: string | null): RememberedTask | null {
  if (raw == null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed == null) return null;

    const { operation, client } = parsed as RememberedTask;
    if (!OPERATIONS.includes(operation)) return null;
    if (client != null && typeof client !== 'string') return null;

    return { operation, client: client ?? null };
  } catch {
    return null;
  }
}

/** Kody ICAO trzymamy tak, jak je zapisano — walidacja długości należy do formularza. */
function decodeRoute(raw: string | null): RememberedRoute | null {
  if (raw == null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed == null) return null;

    const { departureIcao, arrivalIcao } = parsed as RememberedRoute;
    if (typeof departureIcao !== 'string' || typeof arrivalIcao !== 'string') return null;

    return { departureIcao, arrivalIcao };
  } catch {
    return null;
  }
}
