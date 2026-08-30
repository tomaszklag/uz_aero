/**
 * UZ Aero - silnik synchronizacji outboxa (§4.3).
 *
 * Jedna odpowiedzialność: opróżnić outbox, gdy jest okazja. „Okazja" przychodzi
 * z zewnątrz (start aplikacji, powrót sieci, nowe zdarzenie) - silnik sam niczego
 * nie nasłuchuje, więc testuje się go jak zwykłą funkcję.
 *
 * Przebieg `syncOnce`:
 *   1. weź niewysłane zdarzenia (porcje po ≤500 - limit koperty serwera);
 *   2. wyślij z bieżącym tokenem; na 401 JEDNA rotacja tokenu i ponowienie;
 *   3. `accepted + duplicates` = dostarczone → `markSynced` (duplikat znaczy
 *      „serwer już to ma", czyli dokładnie to, co chcemy wiedzieć - §4.3);
 *   4. flagi z odpowiedzi zwróć wyżej - ekran 11 ma je pokazać.
 *
 * Brak sieci NIE jest błędem - to zwykły wynik (`offline`), po którym outbox po prostu
 * czeka. Jedyny wynik wymagający człowieka to `auth_expired`: refresh odrzucony,
 * sync wstrzymany do ponownego zalogowania (praca lokalna trwa dalej, §3.0).
 */

import type { EventsRepo } from '../eventsRepo';
import type { AuthService } from '../auth/authService';
import { authorizedFetch } from './authorizedFetch';
import {
  ServerRejectedError,
  ServerUnreachableError,
  type PushResult,
  type RemoteAircraftState,
  type RemoteReadingsChain,
  type RemoteTaskSuggestions,
  type ServerPort,
  type SessionSyncStatus,
  type SyncTrigger,
} from '../ports/serverPort';

/** Limit paczki - zgodny z kopertą `POST /events` po stronie serwera. */
export const SYNC_BATCH_LIMIT = 500;

export type SyncOutcome =
  /**
   * Outbox opróżniony; `pushed` = DOSTARCZONE (przyjęte + duplikaty). Duplikat po
   * urwanej próbie to też dostarczenie - dzień z samymi duplikatami nie jest „idle",
   * tylko domkniętą synchronizacją.
   */
  | { kind: 'synced'; pushed: number; flags: PushResult['flags'] }
  /** Nie było czego wysyłać. */
  | { kind: 'idle' }
  /** Serwer poza zasięgiem - outbox czeka na następną okazję. */
  | { kind: 'offline' }
  /** Refresh odrzucony - sync stoi do ponownego zalogowania. */
  | { kind: 'auth_expired' }
  /** Serwer odmówił merytorycznie (np. 403 single-writer) - do pokazania. */
  | { kind: 'rejected'; code: string };

export class SyncEngine {
  /** Chroni przed równoległymi przebiegami - druga „okazja" w trakcie pracy jest zbędna. */
  private running = false;

  constructor(
    private readonly repo: EventsRepo,
    private readonly server: ServerPort,
    private readonly auth: AuthService,
    private readonly sourceDevice: string | null = null,
  ) {}

  /**
   * `trigger` mówi tylko, KTO poprosił - port przekłada to na limit czasu (patrz
   * `SyncTrigger`). Domyślnie tło, bo tak woła pętla okazji; `manual` podaje wyłącznie
   * droga z przycisku, gdzie pilot stoi i czeka.
   */
  async syncOnce(trigger: SyncTrigger = 'background'): Promise<SyncOutcome> {
    if (this.running) return { kind: 'idle' };
    this.running = true;
    try {
      return await this.drain(trigger);
    } finally {
      this.running = false;
    }
  }

  /**
   * Stan sesji po stronie serwera: flagi §4.5 i `exportUrl`.
   *
   * `null` znaczy „nie wiadomo TERAZ" - offline, wygasła sesja albo odmowa serwera.
   * Pytający zostaje wtedy przy tym, co ma (flagi z ostatniego pusha = stan `cache`,
   * §4.8) - semantykę zwijania przyczyn do `null` opisuje `authorizedFetch`.
   *
   * **BEZ KONSUMENTA OD 2026-08-12 - ZAPARKOWANE ŚWIADOMIE.** Jedynym wołającym był
   * ekran 11, usunięty jako trzecia kopia rozliczenia; uwagi serwera pokazują dziś
   * Ustawienia, biorąc je z odpowiedzi na wysyłkę (jedna sesja to za mało - pilot
   * pyta o wszystkie swoje). Metody nie kasujemy, bo endpoint `GET /me/sessions/:uuid/status`
   * po stronie serwera istnieje i ma tu komplet testów; wróci przy skrzynce uwag,
   * jeśli taka powstanie. To jest parkowanie w tym samym sensie co `SheetsPort`
   * i `exportUrl` - nie zapomniany kod.
   */
  fetchStatus(sessionUuid: string): Promise<SessionSyncStatus | null> {
    return authorizedFetch(this.auth, (token) => this.server.getSyncStatus(token, sessionUuid));
  }

  /**
   * Żywy stan samolotu (`GET /aircraft/:id/state`) - pytany PUNKTOWO w chwili
   * przejęcia (§4.4): odpowiedź decyduje między `takeover_online` (wiedzieliśmy,
   * co przejmujemy) a `takeover_offline` (opieraliśmy się na cache). `null` = nie
   * udało się sprawdzić - wołający MUSI wtedy deklarować wariant offline.
   */
  fetchAircraftState(aircraftId: string): Promise<RemoteAircraftState | null> {
    return authorizedFetch(this.auth, (token) => this.server.getAircraftState(token, aircraftId));
  }

  /**
   * Ciągłość odczytów wokół chwili (`GET /aircraft/:id/readings-chain`, issue #62) - czym
   * maszyna została ZDANA przed tym lotem i co zastał ten, kto ją przejął PO nim.
   *
   * Pytany PUNKTOWO, gdy wpis ręczny zna już godziny biegu silnika. `null` = nie wiadomo
   * TERAZ (offline, wygasła sesja, starszy serwer bez tej trasy) i tak ma być: ekran
   * milczy wtedy o ciągłości, zamiast zgadywać z ostatniego przekazania - to jest inne
   * pytanie i dałoby odpowiedź poprawną formalnie, a nie na temat.
   *
   * Świadomie BEZ cache: łańcuch dotyczy KONKRETNEJ chwili konkretnej maszyny, więc
   * magazyn trzeba by unieważniać przy każdym cudzym locie (ta sama decyzja, co przy
   * podpowiedziach zadania).
   */
  fetchReadingsChain(
    aircraftId: string,
    at: number,
    exceptSessionUuid?: string,
  ): Promise<RemoteReadingsChain | null> {
    return authorizedFetch(this.auth, (token) =>
      this.server.getReadingsChain(token, aircraftId, {
        at,
        ...(exceptSessionUuid != null ? { exceptSessionUuid } : {}),
      }),
    );
  }

  /**
   * Ostatnio używane oznaczenia klientów i notatki (`GET /me/task-suggestions`, issue #14).
   *
   * `null` = nie wiadomo TERAZ (offline, wygasła sesja, odmowa) i tak ma być: to jedyna
   * treść formularza zadania, której brak niczego nie blokuje - pilot wpisuje wartość
   * z palca dokładnie jak dotąd. Świadomie BEZ cache: podpowiedź sprzed tygodnia nie
   * jest warta magazynu, który trzeba by unieważniać.
   */
  fetchTaskSuggestions(): Promise<RemoteTaskSuggestions | null> {
    return authorizedFetch(this.auth, (token) => this.server.getTaskSuggestions(token));
  }

  private async drain(trigger: SyncTrigger): Promise<SyncOutcome> {
    let token = await this.auth.freshToken();
    if (token == null) return { kind: 'auth_expired' };

    let pushed = 0;
    const flags: PushResult['flags'] = [];

    for (;;) {
      const pending = await this.repo.getOutbox();
      if (pending.length === 0) {
        return pushed > 0 ? { kind: 'synced', pushed, flags } : { kind: 'idle' };
      }

      const batch = pending.slice(0, SYNC_BATCH_LIMIT);
      let result: PushResult;
      try {
        result = await this.server.pushEvents(token, batch, this.sourceDevice, trigger);
      } catch (error) {
        if (error instanceof ServerUnreachableError) return { kind: 'offline' };
        if (error instanceof ServerRejectedError && error.status === 401) {
          // Token wygasł w trakcie - jedna rotacja i ponowienie TEJ SAMEJ paczki.
          // Sieć padła w połowie rotacji = `offline` (spróbujemy później), a nie
          // `auth_expired` - tego rozróżnienia pilnuje test „sieć znika między...".
          let rotated: string | null;
          try {
            rotated = await this.auth.rotate();
          } catch (rotateError) {
            if (rotateError instanceof ServerUnreachableError) return { kind: 'offline' };
            throw rotateError;
          }
          if (rotated == null) return { kind: 'auth_expired' };
          token = rotated;
          continue;
        }
        if (error instanceof ServerRejectedError) {
          return { kind: 'rejected', code: error.code };
        }
        throw error;
      }

      // Dostarczone = przyjęte + duplikaty. Duplikat to potwierdzenie z poprzedniej,
      // urwanej próby - oznaczenie go ponownie jako niewysłany zapętliłoby outbox.
      await this.repo.markSynced(batch.map((e) => e.uuid));
      pushed += result.accepted + result.duplicates;
      flags.push(...result.flags);
    }
  }
}
