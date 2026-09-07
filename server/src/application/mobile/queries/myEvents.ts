/**
 * UZ Aero (serwer) - zapytanie `GET /me/events` (§4.9, issue #32).
 *
 * ODTWORZENIE REJESTRU TELEFONU: strona własnych zdarzeń pilota, stronicowana kursorem
 * po czasie przyjęcia. To jest druga połowa outboxa - `POST /events` wysyła, ta trasa
 * oddaje z powrotem to, co serwer już ma, gdy telefon tego nie ma.
 *
 * ══ DLACZEGO TO NIE PODWAŻA OFFLINE-FIRST ══
 * Ekrany „Mój dzień" i „Historia dni" nadal liczą się WYŁĄCZNIE z lokalnego strumienia
 * (§4.1 pkt 1: telefon PIC-a jest źródłem prawdy sesji, a §6 pkt 1 zabrania wariantów
 * „z cache" dla danych sesji). Ta trasa nie zasila EKRANU - zasila REJESTR: pobrane
 * zdarzenia trafiają do lokalnej bazy jako zwykłe wiersze ze stemplem wysyłki, po czym
 * projekcje liczą się jak zawsze, w pełni offline. Gdyby ekran czytał serwer wprost,
 * dzień lotny bez zasięgu przestałby istnieć.
 *
 * ══ KOPERTA JEST TA SAMA, CO PRZY WYSYŁCE ══
 * Oddajemy dokładnie kształt z `POST /events` (§5.1), bez `received_at` i bez
 * `source_device`: pierwsze mieszka w kursorze i jest księgowością SERWERA, drugie
 * opisuje, skąd zdarzenie przyszło - telefon nie ma z tym co zrobić, a rejestr
 * append-only nie zmienia się od tego, kto go czyta. Jedna koperta w obie strony
 * znaczy, że aplikacja nie ma drugiej definicji zdarzenia dla drogi powrotnej.
 */

import type { Event } from '@uzaero/domain';

import type { Database } from '../../common/ports.ts';
import type { MyEventsPort } from '../ports.ts';

/**
 * Domyślna wielkość strony. Mniejsza niż koperta wysyłki (500), bo tę stronę pobiera
 * się w PĘTLI przy pierwszym odtworzeniu - na łączu jednego paska zasięgu krótsze
 * żądanie, które się kończy, jest warte więcej niż długie, które wpada w timeout
 * telefonu (8 s) i zaczyna się od nowa.
 */
export const MY_EVENTS_PAGE_LIMIT = 200;

/** Górna granica `?limit=` - koperta `POST /events`, żeby obie drogi miały jeden sufit. */
export const MY_EVENTS_MAX_LIMIT = 500;

/** Zdarzenie „na drucie" - koperta §5.1 bez pól, które są księgowością jednej strony. */
export type MyEventWire = Omit<Event, 'syncedAt'>;

export interface MyEventsPage {
  events: MyEventWire[];
  /**
   * Pozycja ZA ostatnim zdarzeniem tej strony - do zapamiętania i podania przy
   * następnym żądaniu, także gdy strona była ostatnia. `null` wyłącznie dla strony
   * pustej. NIEPRZEZROCZYSTY dla klienta (base64url) - kształt klucza zostaje sprawą
   * serwera, żeby telefon nie zaczął go konstruować sam.
   */
  nextCursor: string | null;
  /** Czy za tą stroną jest jeszcze co czytać - telefon pętli się, dopóki `true`. */
  hasMore: boolean;
}

export type MyEventsOutcome =
  | { ok: true; page: MyEventsPage }
  /** Kursor przyszedł z zewnątrz, więc jego uszkodzenie to 400, a nie 500. */
  | { ok: false; reason: 'bad_cursor' };

export class MyEventQueries {
  constructor(
    private readonly db: Database,
    private readonly events: MyEventsPort,
  ) {}

  /**
   * `picId` pochodzi WYŁĄCZNIE z tokenu (trasa `/me/*`, wzorzec `prefs.ts`
   * i `task-suggestions.ts`) - pilot nie ma gdzie podać cudzej tożsamości, więc
   * endpoint odtwarzający własny rejestr nie może stać się czytnikiem cudzego.
   */
  async page(picId: string, cursor: string | null, limit: number): Promise<MyEventsOutcome> {
    const result = await this.events.page(this.db, picId, cursor, limit);
    if (result == null) return { ok: false, reason: 'bad_cursor' };

    return {
      ok: true,
      page: {
        events: result.events.map(toWire),
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    };
  }
}

/**
 * `syncedAt` jest księgowością TELEFONU („czy serwer to potwierdził") i na serwerze nie
 * ma znaczenia - adapter rejestru wypełnia je `null`. Wysyłka zdejmuje je symetrycznie
 * (`HttpServerApi.pushEvents`), więc pole nie przekracza granicy w żadną stronę.
 */
function toWire({ syncedAt: _server, ...event }: Event): MyEventWire {
  return event;
}
