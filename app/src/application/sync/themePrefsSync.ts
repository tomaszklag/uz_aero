/**
 * UZ Aero - uzgadnianie MOTYWU PILOTA z serwerem przez `/me/prefs`
 * (decyzja 2026-07-29: motyw jest preferencją pilota i wędruje między urządzeniami).
 *
 * Wzorzec `ReferenceSync`: czysta klasa wołana przez pętlę okazji, offline-first
 * bez wyjątków - zmiana motywu NIGDY nie czeka na sieć (najpierw zapis lokalny
 * w `ThemePrefsPort`, sync to skutek). Zasady:
 *
 *  • **Push przed pull, bez bramy wieku**: rekord `dirty` to nasz „outbox" preferencji -
 *    wysyłamy przy każdej okazji, aż serwer potwierdzi. Pull (rozejrzenie się, czy
 *    pilot nie zmienił motywu na INNYM telefonie) idzie za bramą wieku, żeby puls
 *    pętli co 60 s nie odpytywał serwera o rzecz zmienianą kilka razy w sezonie.
 *  • **LWW po `updatedAt` w OBIE strony**: stempel decyzji pilota (zegar telefonu)
 *    rozstrzyga i na serwerze (SQL nadpisuje tylko nowszym), i lokalnie (adoptujemy
 *    wyłącznie stan ściśle nowszy niż nasz - także wtedy, gdy w trakcie rozmowy
 *    pilot zdążył wybrać coś nowego). Odpowiedź PUT jest autorytatywna: przegrany
 *    stempel dostaje w niej zwycięzcę i dostosowuje lokalny motyw.
 *  • **Tożsamość z magazynu, nie z argumentu w ciemno**: przed rozmową sprawdzamy,
 *    że profil urządzenia to wciąż TEN pilot - przelogowanie w trakcie przebiegu
 *    nie może zapisać cudzą preferencją (token należy już do kogoś innego).
 *  • Offline / wygasła sesja / odmowa = `skipped` - rekord (i `dirty`) zostaje,
 *    następna okazja spróbuje znowu.
 *
 * Adopcję serwerowego motywu zgłaszamy słuchaczom (`onApplied`) - ThemeProvider
 * przemalowuje ekran na żywo, bez restartu aplikacji.
 */

import type { AuthService } from '../auth/authService';
import type { ServerPort, RemoteThemePrefs } from '../ports/serverPort';
import type { ThemePrefRecord, ThemePrefsPort } from '../ports/themePrefsPort';
import { authorizedFetch } from './authorizedFetch';

/** Brama wieku pulla - jak `REFERENCE_MAX_AGE_MS`: motyw z innego telefonu nie jest daną na żywo. */
export const THEME_PREFS_MAX_AGE_MS = 15 * 60_000;

export type ThemePrefsSyncOutcome =
  /** Serwer potwierdzony niedawno, rekord czysty - rozmowy nie było. */
  | 'fresh'
  /** Serwer przyjął nasz stempel (wygrany/pierwszy zapis) - `dirty` zgaszone. */
  | 'pushed'
  /** Adoptowaliśmy nowszy stan serwera (decyzja pilota z innego urządzenia). */
  | 'pulled'
  /** Serwer nie ma nic nowszego; lokalny motyw zostaje. */
  | 'in_sync'
  /** Offline / wygasła sesja / inny profil - bez zmian, spróbujemy przy okazji. */
  | 'skipped';

export class ThemePrefsSync {
  /** Chwila ostatniego POTWIERDZENIA stanu serwera, per pilot (pamięć procesu - start aplikacji i tak robi pull). */
  private confirmedAt = new Map<string, number>();
  private listeners = new Set<(pilotId: string, theme: string) => void>();

  constructor(
    private readonly prefs: ThemePrefsPort,
    private readonly server: ServerPort,
    private readonly auth: AuthService,
    private readonly maxAgeMs: number = THEME_PREFS_MAX_AGE_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Subskrypcja adopcji motywu z serwera; zwraca wypis. */
  onApplied(listener: (pilotId: string, theme: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Wejście pętli okazji: push zaległej zmiany od razu, pull za bramą wieku. */
  async syncIfStale(pilotId: string): Promise<ThemePrefsSyncOutcome> {
    const local = await this.prefs.read(pilotId);
    if (local?.dirty) return this.push(pilotId, local);

    const confirmed = this.confirmedAt.get(pilotId);
    if (confirmed != null && this.now() - confirmed < this.maxAgeMs) return 'fresh';
    return this.pull(pilotId);
  }

  private async push(pilotId: string, pushed: ThemePrefRecord): Promise<ThemePrefsSyncOutcome> {
    if (!(await this.isCurrentPilot(pilotId))) return 'skipped';

    const remote = await authorizedFetch(this.auth, (token) =>
      this.server.putPrefs(token, {
        theme: pushed.theme,
        themeUpdatedAt: new Date(pushed.updatedAt).toISOString(),
      }),
    );
    if (remote == null) return 'skipped';
    this.confirmedAt.set(pilotId, this.now());

    if (await this.adoptIfNewer(pilotId, remote)) return 'pulled'; // przegrany LWW dostosowuje się

    // Wygrana (serwer odpowiedział naszym stemplem): gasimy `dirty` - ale tylko jeśli
    // pilot NIE zdążył w międzyczasie wybrać czegoś nowszego (wtedy dirty zostaje
    // i wyśle go następna okazja).
    const current = await this.prefs.read(pilotId);
    if (current != null && current.dirty && current.updatedAt === pushed.updatedAt) {
      await this.prefs.write(pilotId, { ...current, dirty: false });
    }
    return 'pushed';
  }

  private async pull(pilotId: string): Promise<ThemePrefsSyncOutcome> {
    if (!(await this.isCurrentPilot(pilotId))) return 'skipped';

    const remote = await authorizedFetch(this.auth, (token) => this.server.getPrefs(token));
    if (remote == null) return 'skipped';
    this.confirmedAt.set(pilotId, this.now());

    return (await this.adoptIfNewer(pilotId, remote)) ? 'pulled' : 'in_sync';
  }

  /**
   * LWW po stronie telefonu: przyjmujemy stan serwera tylko, gdy jego stempel jest
   * ŚCIŚLE nowszy niż lokalny (remis = zostajemy przy swoim). Rekord czytamy tuż
   * przed zapisem - rozmowa z serwerem trwała, a pilot mógł w tym czasie klikać.
   */
  private async adoptIfNewer(pilotId: string, remote: RemoteThemePrefs): Promise<boolean> {
    if (remote.theme == null || remote.themeUpdatedAt == null) return false;
    const remoteAt = Date.parse(remote.themeUpdatedAt);
    if (Number.isNaN(remoteAt)) return false;

    const current = await this.prefs.read(pilotId);
    if (current != null && remoteAt <= current.updatedAt) return false;

    await this.prefs.write(pilotId, { theme: remote.theme, updatedAt: remoteAt, dirty: false });
    for (const listener of this.listeners) listener(pilotId, remote.theme);
    return true;
  }

  /** Profil urządzenia musi być TYM pilotem - token po przelogowaniu należy do kogoś innego. */
  private async isCurrentPilot(pilotId: string): Promise<boolean> {
    try {
      const stored = await this.auth.profile();
      return stored?.pilot.id === pilotId;
    } catch {
      return false; // magazyn niedostępny = nie wiemy, czyj token - nie ryzykujemy
    }
  }
}
