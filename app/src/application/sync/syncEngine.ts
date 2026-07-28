/**
 * UZ Aero — silnik synchronizacji outboxa (§4.3).
 *
 * Jedna odpowiedzialność: opróżnić outbox, gdy jest okazja. „Okazja" przychodzi
 * z zewnątrz (start aplikacji, powrót sieci, nowe zdarzenie) — silnik sam niczego
 * nie nasłuchuje, więc testuje się go jak zwykłą funkcję.
 *
 * Przebieg `syncOnce`:
 *   1. weź niewysłane zdarzenia (porcje po ≤500 — limit koperty serwera);
 *   2. wyślij z bieżącym tokenem; na 401 JEDNA rotacja tokenu i ponowienie;
 *   3. `accepted + duplicates` = dostarczone → `markSynced` (duplikat znaczy
 *      „serwer już to ma", czyli dokładnie to, co chcemy wiedzieć — §4.3);
 *   4. flagi z odpowiedzi zwróć wyżej — ekran 11 ma je pokazać.
 *
 * Brak sieci NIE jest błędem — to zwykły wynik (`offline`), po którym outbox po prostu
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
  type ServerPort,
  type SessionSyncStatus,
} from '../ports/serverPort';

/** Limit paczki — zgodny z kopertą `POST /events` po stronie serwera. */
export const SYNC_BATCH_LIMIT = 500;

export type SyncOutcome =
  /**
   * Outbox opróżniony; `pushed` = DOSTARCZONE (przyjęte + duplikaty). Duplikat po
   * urwanej próbie to też dostarczenie — dzień z samymi duplikatami nie jest „idle",
   * tylko domkniętą synchronizacją.
   */
  | { kind: 'synced'; pushed: number; flags: PushResult['flags'] }
  /** Nie było czego wysyłać. */
  | { kind: 'idle' }
  /** Serwer poza zasięgiem — outbox czeka na następną okazję. */
  | { kind: 'offline' }
  /** Refresh odrzucony — sync stoi do ponownego zalogowania. */
  | { kind: 'auth_expired' }
  /** Serwer odmówił merytorycznie (np. 403 single-writer) — do pokazania. */
  | { kind: 'rejected'; code: string };

export class SyncEngine {
  /** Chroni przed równoległymi przebiegami — druga „okazja" w trakcie pracy jest zbędna. */
  private running = false;

  constructor(
    private readonly repo: EventsRepo,
    private readonly server: ServerPort,
    private readonly auth: AuthService,
    private readonly sourceDevice: string | null = null,
  ) {}

  async syncOnce(): Promise<SyncOutcome> {
    if (this.running) return { kind: 'idle' };
    this.running = true;
    try {
      return await this.drain();
    } finally {
      this.running = false;
    }
  }

  /**
   * Stan sesji po stronie serwera (ekran 11: flagi, `exportUrl`).
   *
   * `null` znaczy „nie wiadomo TERAZ" — offline, wygasła sesja albo odmowa serwera.
   * Pytający zostaje wtedy przy tym, co ma (flagi z ostatniego pusha = stan `cache`,
   * §4.8) — semantykę zwijania przyczyn do `null` opisuje `authorizedFetch`.
   */
  fetchStatus(sessionUuid: string): Promise<SessionSyncStatus | null> {
    return authorizedFetch(this.auth, (token) => this.server.getSyncStatus(token, sessionUuid));
  }

  /**
   * Żywy stan samolotu (`GET /aircraft/:id/state`) — pytany PUNKTOWO w chwili
   * przejęcia (§4.4): odpowiedź decyduje między `takeover_online` (wiedzieliśmy,
   * co przejmujemy) a `takeover_offline` (opieraliśmy się na cache). `null` = nie
   * udało się sprawdzić — wołający MUSI wtedy deklarować wariant offline.
   */
  fetchAircraftState(aircraftId: string): Promise<RemoteAircraftState | null> {
    return authorizedFetch(this.auth, (token) => this.server.getAircraftState(token, aircraftId));
  }

  private async drain(): Promise<SyncOutcome> {
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
        result = await this.server.pushEvents(token, batch, this.sourceDevice);
      } catch (error) {
        if (error instanceof ServerUnreachableError) return { kind: 'offline' };
        if (error instanceof ServerRejectedError && error.status === 401) {
          // Token wygasł w trakcie — jedna rotacja i ponowienie TEJ SAMEJ paczki.
          // Sieć padła w połowie rotacji = `offline` (spróbujemy później), a nie
          // `auth_expired` — tego rozróżnienia pilnuje test „sieć znika między...".
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
      // urwanej próby — oznaczenie go ponownie jako niewysłany zapętliłoby outbox.
      await this.repo.markSynced(batch.map((e) => e.uuid));
      pushed += result.accepted + result.duplicates;
      flags.push(...result.flags);
    }
  }
}
