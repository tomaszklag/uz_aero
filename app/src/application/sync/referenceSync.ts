/**
 * UZ Aero - odświeżanie CACHE REFERENCYJNEGO z `GET /reference` (§4.8, §5.2).
 *
 * Cache (flota, konfiguracje, piloci, claim/przekazanie per samolot) zasila preflight
 * i ekran odczytów. Do M3 wypełniał go wyłącznie seed - od teraz źródłem prawdy jest
 * serwer, a seed zostaje danymi pierwszego uruchomienia sprzed pierwszego kontaktu.
 *
 * Zasady:
 *  • **Upsert, nie replace** - flota i piloci są w tym systemie WYŁĄCZANI
 *    (`serviceStatus` / `active`), nigdy nie znikają z odpowiedzi, więc kasowanie
 *    nieobecnych wierszy nie ma czego robić, a replace gubiłby cache przy błędnej
 *    częściowej odpowiedzi.
 *  • **ETag** (§4.8): telefon pamięta znacznik ostatniej odpowiedzi; przy zgodności
 *    serwer odpowiada 304 bez ciała. 304 to POTWIERDZENIE świeżości - stemplujemy
 *    `fetchedAt` wierszy na teraz, żeby adnotacja „· z cache · sync …" mówiła prawdę.
 *  • **Brama wieku**: pętla okazji woła `refreshIfStale` przy każdym przebiegu synca;
 *    faktyczne zapytanie idzie dopiero, gdy od ostatniego potwierdzenia minęło
 *    `maxAgeMs` - claimy nie są danymi na żywo (od tego jest `GET /aircraft/:id/state`
 *    w chwili przejęcia), więc odpytywanie co puls byłoby paleniem baterii.
 *    **Pusta flota bramy nie dostaje** (issue #55): brama chroni dane już użyteczne,
 *    a bez ani jednego samolotu aplikacja nie ma czym pracować - pilot świeżego klubu
 *    patrzyłby w warning „BRAK SAMOLOTÓW" przez kwadrans, choć administrator zdążył
 *    założyć flotę w panelu. Dopóki jest pusto, każdy puls pyta naprawdę.
 *  • Każde niepowodzenie = `skipped`, cache zostaje - brak sieci nigdy nie psuje
 *    tego, co już wiemy (§6).
 */

import type { EventsRepo } from '../eventsRepo';
import type { AuthService } from '../auth/authService';
import type { ServerPort } from '../ports/serverPort';
import { authorizedFetch } from './authorizedFetch';

/** Klucze `session_meta` - księgowość tego modułu, niewidoczna dla ekranów. */
export const REFERENCE_META_ETAG = 'reference.etag';
export const REFERENCE_META_CHECKED_AT = 'reference.checkedAt';

/** Domyślna brama wieku: 15 min. Claim „na żywo" i tak pobiera preflight punktowo. */
export const REFERENCE_MAX_AGE_MS = 15 * 60_000;

export type ReferenceRefreshOutcome =
  /** Cache młodszy niż brama wieku - zapytania nie było. */
  | 'fresh'
  /** Serwer przysłał nowe dane; cache nadpisany. */
  | 'refreshed'
  /** 304 - serwer potwierdził aktualność; podbite tylko stemple wieku. */
  | 'not_modified'
  /** Offline / wygasła sesja / odmowa - cache bez zmian, spróbujemy później. */
  | 'skipped';

export class ReferenceSync {
  constructor(
    private readonly repo: EventsRepo,
    private readonly server: ServerPort,
    private readonly auth: AuthService,
    private readonly maxAgeMs: number = REFERENCE_MAX_AGE_MS,
  ) {}

  /**
   * Wejście pętli okazji: pyta serwer tylko, gdy cache przekroczył bramę wieku -
   * chyba że flota jest PUSTA (patrz docblock modułu): wtedy nie ma czego chronić
   * i każda okazja jest prawdziwym zapytaniem, aż serwer dowiezie pierwszy samolot.
   */
  async refreshIfStale(): Promise<ReferenceRefreshOutcome> {
    const checkedAt = await this.repo.getMeta(REFERENCE_META_CHECKED_AT);
    const withinGate =
      checkedAt != null && this.repo.now - Number(checkedAt) < this.maxAgeMs;
    if (withinGate && (await this.repo.getAircraft()).length > 0) {
      return 'fresh';
    }
    return this.refresh();
  }

  /** Bezwarunkowe odświeżenie (z ETagiem - „bezwarunkowe" nie znaczy „bez 304"). */
  async refresh(): Promise<ReferenceRefreshOutcome> {
    const etag = await this.repo.getMeta(REFERENCE_META_ETAG);
    const result = await authorizedFetch(this.auth, (token) =>
      this.server.getReference(token, etag),
    );
    if (result == null) return 'skipped';

    if (result.data == null) {
      await this.touchCache();
      await this.stampChecked(result.etag);
      return 'not_modified';
    }

    await this.repo.upsertReference({
      aircraft: result.data.aircraft,
      pilots: result.data.pilots,
    });
    await this.stampChecked(result.etag);
    return 'refreshed';
  }

  /**
   * 304: treść bez zmian, ale wiek danych właśnie się wyzerował - przepisujemy wiersze
   * z nowym `fetchedAt`. Flota liczy pojedyncze sztuki, więc to tańsze niż osobna
   * ścieżka „touch" w adapterze magazynu.
   */
  private async touchCache(): Promise<void> {
    const now = this.repo.now;
    const aircraft = await this.repo.getAircraft();
    const pilots = await this.repo.getPilots();
    if (aircraft.length > 0) await this.repo.upsertAircraft(aircraft, now);
    if (pilots.length > 0) await this.repo.upsertPilots(pilots, now);
  }

  private async stampChecked(etag: string | null): Promise<void> {
    await this.repo.setMeta(REFERENCE_META_CHECKED_AT, String(this.repo.now));
    if (etag != null) await this.repo.setMeta(REFERENCE_META_ETAG, etag);
  }
}
