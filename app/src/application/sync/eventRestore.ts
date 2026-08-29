/**
 * UZ Aero - ODTWORZENIE REJESTRU z `GET /me/events` (§4.9, issue #32).
 *
 * Do tej pory synchronizacja miała jeden kierunek: outbox wypychał zdarzenia na serwer
 * i nic nigdy nie wracało. Konsekwencja wyszła w terenie - pilot wyczyścił pamięć
 * aplikacji i stracił WSZYSTKO, chociaż jego dni leżały kompletne w bazie klubu.
 * Ten moduł zamyka pętlę: dopisuje do lokalnego strumienia zdarzenia, które serwer ma,
 * a telefon nie.
 *
 * ══ TO NIE JEST ODWRÓT OD OFFLINE-FIRST - TO JEGO WARUNEK ══
 * Ekrany („Mój dzień", „Historia dni", statystyki) dalej czytają WYŁĄCZNIE lokalny
 * strumień i liczą projekcje w telefonie (§4.1 pkt 1, §6 pkt 1: dane sesji nie mają
 * wariantu „z cache"). Pobranie nie zasila EKRANU, tylko REJESTR - po zapisie wszystko
 * działa jak zawsze, także bez zasięgu. Odwrotna decyzja (ekran pyta serwer) zabrałaby
 * pilotowi jego dzień w chwili, gdy zabraknie zasięgu, czyli dokładnie w powietrzu.
 *
 * ══ KURSOR JEST PRZYPISANY DO PILOTA ══
 * Klucz `session_meta` niesie parę `{ pilotId, cursor }`. Sam kursor byłby pułapką na
 * urządzeniu klubowym: po zalogowaniu drugiego pilota telefon pytałby od pozycji
 * PIERWSZEGO i uznał, że nowy pilot nie ma historii - czyli powtórzyłby dokładnie tę
 * awarię, którą ten moduł naprawia. Zmiana pilota = odtworzenie od początku.
 *
 * ══ CO JEST, A CZEGO NIE MA W POBRANEJ PACZCE ══
 * Serwer oddaje wyłącznie sesje, w których pilot jest PIC-em (§4.1 pkt 3: jedyny
 * piszący). Zdarzenia zapisujemy ze stemplem `syncedAt` - przyszły Z serwera, więc
 * serwer je ma; bez stempla wpadłyby do outboxa i telefon odsyłałby serwerowi jego
 * własne dane w kółko. Dedup po `uuid` należy do magazynu, więc nakładanie się pobrania
 * na to, co telefon już ma, jest bezpieczne i niczego nie nadpisuje.
 *
 * Każde niepowodzenie = `skipped`; lokalny strumień zostaje nietknięty. Brak sieci
 * nigdy nie psuje tego, co już wiemy (§6).
 */

import type { EventsRepo } from '../eventsRepo';
import type { AuthService } from '../auth/authService';
import type { ServerPort } from '../ports/serverPort';
import { authorizedFetch } from './authorizedFetch';

/** Klucze `session_meta` - księgowość tego modułu, niewidoczna dla ekranów. */
export const EVENT_RESTORE_META_CURSOR = 'events.pullCursor';
export const EVENT_RESTORE_META_CHECKED_AT = 'events.pulledAt';

/**
 * Brama wieku: 15 min, jak przy cache referencyjnym. Świeże zdarzenia TEGO telefonu
 * powstają lokalnie i nie mają czego dowozić z serwera - pobranie leczy urządzenie,
 * które straciło dane, i dowozi dosyłkę z drugiego telefonu albo korektę administratora.
 * Żadna z tych rzeczy nie dzieje się co minutę, więc pytanie przy każdym pulsie synca
 * byłoby paleniem baterii.
 */
export const EVENT_RESTORE_MAX_AGE_MS = 15 * 60_000;

/**
 * Wielkość strony. Zgodna z domyślną po stronie serwera i mniejsza niż koperta wysyłki
 * (500): tę stronę pobiera się w PĘTLI, a na słabym łączu krótkie żądanie, które się
 * kończy, jest warte więcej niż długie wpadające w ośmiosekundowy timeout adaptera.
 */
export const EVENT_RESTORE_PAGE_LIMIT = 200;

/**
 * Sufit stron na JEDEN przebieg - pas bezpieczeństwa, nie limit historii. Pełne
 * odtworzenie sezonu mieści się w nim z zapasem, a serwer, który z powodu błędu
 * oddawałby `hasMore: true` w nieskończoność, nie zawiesi pętli okazji. Reszta i tak
 * dojdzie przy następnej okazji - kursor jest zapisany po każdej stronie.
 */
export const EVENT_RESTORE_MAX_PAGES = 60;

export type EventRestoreOutcome =
  /** Rejestr sprawdzany niedawno - zapytania nie było. */
  | { kind: 'fresh' }
  /**
   * Rozmowa doszła do skutku. `fetched` = ile zdarzeń przyszło, `inserted` = ile
   * z nich było dla telefonu NOWYCH (reszta to dedup po uuid). `complete` mówi,
   * czy telefon dogonił serwer w tym przebiegu.
   */
  | { kind: 'pulled'; fetched: number; inserted: number; complete: boolean }
  /** Offline / brak profilu / wygasła sesja / odmowa - strumień bez zmian. */
  | { kind: 'skipped' };

/** Zapamiętana pozycja odtworzenia: kursor NALEŻY do pilota, nie do urządzenia. */
interface StoredCursor {
  pilotId: string;
  cursor: string;
}

export class EventRestore {
  constructor(
    private readonly repo: EventsRepo,
    private readonly server: ServerPort,
    private readonly auth: AuthService,
    private readonly maxAgeMs: number = EVENT_RESTORE_MAX_AGE_MS,
  ) {}

  /** Wejście pętli okazji: pyta serwer tylko po przekroczeniu bramy wieku. */
  async restoreIfStale(): Promise<EventRestoreOutcome> {
    const checkedAt = await this.repo.getMeta(EVENT_RESTORE_META_CHECKED_AT);
    if (checkedAt != null && this.repo.now - Number(checkedAt) < this.maxAgeMs) {
      return { kind: 'fresh' };
    }
    return this.restore();
  }

  /**
   * Bezwarunkowe odtworzenie: strona po stronie od zapamiętanej pozycji do końca
   * rejestru. Kursor zapisujemy PO zapisaniu zdarzeń strony - odwrotna kolejność
   * gubiłaby stronę przerwaną w połowie (kursor za nią, dane nigdzie).
   */
  async restore(): Promise<EventRestoreOutcome> {
    const profile = await this.auth.profile();
    if (profile == null) return { kind: 'skipped' }; // urządzenie bez tożsamości

    const pilotId = profile.pilot.id;
    let cursor = await this.cursorFor(pilotId);

    let fetched = 0;
    let inserted = 0;

    for (let page = 0; page < EVENT_RESTORE_MAX_PAGES; page += 1) {
      const result = await authorizedFetch(this.auth, (token) =>
        this.server.pullEvents(token, { cursor, limit: EVENT_RESTORE_PAGE_LIMIT }),
      );
      // Urwane w połowie: to, co zdążyło wejść, ZOSTAJE w strumieniu razem z kursorem,
      // więc następna okazja podejmie odtwarzanie tam, gdzie stanęło.
      if (result == null) {
        return fetched > 0
          ? { kind: 'pulled', fetched, inserted, complete: false }
          : { kind: 'skipped' };
      }

      fetched += result.events.length;
      inserted += await this.repo.appendFromServer(result.events);

      if (result.nextCursor != null) {
        cursor = result.nextCursor;
        await this.saveCursor(pilotId, cursor);
      }

      if (!result.hasMore) {
        await this.repo.setMeta(EVENT_RESTORE_META_CHECKED_AT, String(this.repo.now));
        return { kind: 'pulled', fetched, inserted, complete: true };
      }
    }

    // Sufit stron: nie stemplujemy `checkedAt`, żeby brama wieku nie wstrzymała
    // dokończenia - reszta rejestru ma dojść przy najbliższej okazji, nie za kwadrans.
    return { kind: 'pulled', fetched, inserted, complete: false };
  }

  /**
   * Zapamiętana pozycja TEGO pilota; `null` przy pierwszym odtworzeniu i po zmianie
   * pilota na urządzeniu (wtedy zaczynamy od początku jego rejestru).
   */
  private async cursorFor(pilotId: string): Promise<string | null> {
    const raw = await this.repo.getMeta(EVENT_RESTORE_META_CURSOR);
    if (raw == null) return null;
    try {
      const stored = JSON.parse(raw) as Partial<StoredCursor>;
      return stored.pilotId === pilotId && typeof stored.cursor === 'string'
        ? stored.cursor
        : null;
    } catch {
      // Uszkodzony wpis to nie awaria: odtwarzamy od początku, a dedup po uuid
      // sprawia, że najgorszym skutkiem jest jedno zbędne pobranie.
      return null;
    }
  }

  private async saveCursor(pilotId: string, cursor: string): Promise<void> {
    await this.repo.setMeta(
      EVENT_RESTORE_META_CURSOR,
      JSON.stringify({ pilotId, cursor } satisfies StoredCursor),
    );
  }
}
