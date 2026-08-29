/**
 * UZ Aero - POBRANIE ŚLADU SESJI z serwera (`GET /me/sessions/:uuid/track`, issue #47).
 *
 * Kierunek powrotny `TraceSync`: tamten oddaje nagranie i kasuje lokalną kopię, ten
 * przynosi z powrotem gotową geometrię, gdy ekran 14 o nią pyta.
 *
 * ══ TRZY WYNIKI, NIE DWA ══
 * `authorizedFetch` zwija KAŻDE niepowodzenie do `null`, bo dla odczytów referencyjnych
 * offline i odmowa znaczą to samo: „zostań przy cache". Tutaj znaczą co innego i pilot
 * musi zobaczyć różnicę:
 *  • **404** - serwer nie ma nagrania tej sesji i nigdy nie będzie miał samo z siebie
 *    (wariant 14B: „trasy nie ma"),
 *  • **brak łączności** - nagranie jest, brakuje drogi do niego (wariant 14C:
 *    „wróć z zasięgiem").
 * Pokazanie pilotowi „nie ma śladu", gdy ma tylko wyłączone dane, byłoby kłamstwem
 * o jego locie - stąd 404 łapiemy WEWNĄTRZ wywołania i oddajemy jako wynik, a nie
 * jako błąd. Rotację wygasłego tokenu zostawiamy `authorizedFetch`, żeby nie istniała
 * druga jej implementacja.
 */

import type { SessionTrackPayload } from '../../domain';
import type { AuthService } from '../auth/authService';
import type { ServerPort } from '../ports';
import { ServerRejectedError } from '../ports';
import { authorizedFetch } from './authorizedFetch';

export type RemoteTrackOutcome =
  | { kind: 'track'; payload: SessionTrackPayload }
  /** Serwer odpowiedział, że takiego śladu nie ma (albo sesja nie jest nasza). */
  | { kind: 'missing' }
  /** Nie było jak zapytać: brak sieci, martwy refresh token, odmowa serwera. */
  | { kind: 'unreachable' };

/** Port ekranu 14 - jedno pytanie, trzy odpowiedzi. Atrapa w testach zwraca je wprost. */
export interface SessionTrackSource {
  fetch(sessionUuid: string): Promise<RemoteTrackOutcome>;
}

export class HttpSessionTrackSource implements SessionTrackSource {
  constructor(
    private readonly server: ServerPort,
    private readonly auth: AuthService,
  ) {}

  async fetch(sessionUuid: string): Promise<RemoteTrackOutcome> {
    const outcome = await authorizedFetch<RemoteTrackOutcome>(this.auth, async (token) => {
      try {
        return { kind: 'track', payload: await this.server.getSessionTrack(token, sessionUuid) };
      } catch (error) {
        // 404 to ODPOWIEDŹ, nie awaria - przepuszczona wyżej zostałaby zwinięta do
        // `null` razem z brakiem zasięgu i ekran przestałby je rozróżniać.
        if (error instanceof ServerRejectedError && error.status === 404) {
          return { kind: 'missing' };
        }
        throw error; // 401 obsłuży `authorizedFetch` (jedna rotacja i ponowienie)
      }
    });

    return outcome ?? { kind: 'unreachable' };
  }
}
