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
import type { ServerPort, SyncTrigger } from '../ports/serverPort';
import { authorizedFetch } from './authorizedFetch';

/**
 * Klucze `session_meta` - księgowość tego modułu, niewidoczna dla ekranów.
 *
 * ZNACZNIK I WIEK SĄ PER KLUB (wielofirmowość §7.1): cache drugiego klubu zostaje
 * w pamięci telefonu, więc jego ETag też musi zostać - inaczej powrót do tamtego klubu
 * wysyłałby `If-None-Match` z cudzym znacznikiem i dostawał pełną odpowiedź zamiast 304.
 * Wiek liczy się osobno z tego samego powodu: klub, w którym pilot nie był od tygodnia,
 * ma stary cache i ma o tym wiedzieć.
 */
export const REFERENCE_META_ETAG = 'reference.etag';
export const REFERENCE_META_CHECKED_AT = 'reference.checkedAt';

const etagKey = (orgId: string): string => `${REFERENCE_META_ETAG}.${orgId}`;
const checkedAtKey = (orgId: string): string => `${REFERENCE_META_CHECKED_AT}.${orgId}`;

/**
 * Kiedy telefon ostatnio POTWIERDZIŁ cache klubu aktywnego (także przez 304) - stempel
 * „wiek danych" na 01 i 13. `null` = jeszcze nigdy albo klub nieznany.
 *
 * Funkcja, a nie gołe `getMeta` w ekranie: klucz jest odtąd składany z klubu, a dwa
 * ekrany składające go u siebie rozjechałyby się przy pierwszej zmianie kształtu.
 */
export async function referenceCheckedAt(repo: EventsRepo): Promise<number | null> {
  const orgId = repo.activeOrg;
  if (orgId == null) return null;
  const value = await repo.getMeta(checkedAtKey(orgId));
  return value == null ? null : Number(value);
}

/** Domyślna brama wieku: 15 min. Claim „na żywo" i tak pobiera preflight punktowo. */
export const REFERENCE_MAX_AGE_MS = 15 * 60_000;

export type ReferenceRefreshOutcome =
  /** Cache młodszy niż brama wieku - zapytania nie było. */
  | 'fresh'
  /** Klub aktywny NIEZNANY - telefon nie wie jeszcze, o czyją flotę pytać (§7, §11). */
  | 'no_club'
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
    const orgId = this.repo.activeOrg;
    if (orgId == null) return 'no_club';

    const checkedAt = await this.repo.getMeta(checkedAtKey(orgId));
    const withinGate =
      checkedAt != null && this.repo.now - Number(checkedAt) < this.maxAgeMs;
    if (withinGate && (await this.repo.getAircraft()).length > 0) {
      return 'fresh';
    }
    // Brama wieku jest drogą TŁA (pętla okazji), więc i limit czasu jest tła.
    return this.refresh('background');
  }

  /**
   * Bezwarunkowe odświeżenie (z ETagiem - „bezwarunkowe" nie znaczy „bez 304").
   *
   * Klub czytamy RAZ, na wejściu, i tym samym klubem zapisujemy odpowiedź: przełączenie
   * w trakcie lotu żądania wpisałoby inaczej flotę klubu A pod klub B.
   */
  async refresh(trigger: SyncTrigger = 'manual'): Promise<ReferenceRefreshOutcome> {
    const orgId = this.repo.activeOrg;
    if (orgId == null) return 'no_club';

    const etag = await this.repo.getMeta(etagKey(orgId));
    const result = await authorizedFetch(this.auth, (token) =>
      this.server.getReference(token, etag, trigger),
    );
    if (result == null) return 'skipped';

    if (result.data == null) {
      await this.touchCache(orgId);
      await this.stampChecked(orgId, result.etag);
      return 'not_modified';
    }

    await this.repo.upsertReference(orgId, {
      aircraft: result.data.aircraft,
      pilots: result.data.pilots,
    });
    await this.stampChecked(orgId, result.etag);
    return 'refreshed';
  }

  /**
   * 304: treść bez zmian, ale wiek danych właśnie się wyzerował - przepisujemy wiersze
   * z nowym `fetchedAt`. Flota liczy pojedyncze sztuki, więc to tańsze niż osobna
   * ścieżka „touch" w adapterze magazynu.
   */
  private async touchCache(orgId: string): Promise<void> {
    const now = this.repo.now;
    const aircraft = await this.repo.getAircraft();
    const pilots = await this.repo.getPilots();
    if (aircraft.length > 0) await this.repo.upsertAircraft(aircraft, orgId, now);
    if (pilots.length > 0) await this.repo.upsertPilots(pilots, orgId, now);
  }

  private async stampChecked(orgId: string, etag: string | null): Promise<void> {
    await this.repo.setMeta(checkedAtKey(orgId), String(this.repo.now));
    if (etag != null) await this.repo.setMeta(etagKey(orgId), etag);
  }
}
