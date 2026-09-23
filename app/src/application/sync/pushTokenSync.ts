/**
 * Ninerdeck - ZGŁOSZENIE TOKENU PUSH SERWEROWI (`POST /me/push-token`; 3.1.0, epik R-J;
 * `docs/rezerwacje.md` §12.2, §12.5).
 *
 * Wzorzec `ThemePrefsSync`: czysta klasa wołana przez pętlę okazji, nigdy nie rzuca,
 * a brak sieci znaczy „spróbujemy przy następnej okazji". Zasady:
 *
 *  • **Token przypina się do SESJI LOGOWANIA po stronie serwera** (§12.2): to serwer
 *    bierze sesję z tokenu żądania, więc telefon nie wie i nie musi wiedzieć, którą
 *    sesję rejestruje. Wylogowanie i ponowne logowanie tego samego pilota to NOWA
 *    sesja - i nowa rejestracja, bo klucz pamięci niesie parę poświadczeń, która przy
 *    logowaniu jest zawsze inna;
 *  • **pamięć procesu, nie magazyn**: raz potwierdzony token nie jedzie przy każdym
 *    pulsie co 60 s. Po restarcie aplikacji rejestrujemy ponownie - to jeden `POST`
 *    na uruchomienie, a serwer i tak robi upsert;
 *  • **rotacja pary tokenów odświeża klucz**, więc po niej rejestracja idzie raz
 *    jeszcze. Sesja jest ta sama (rotacja jej nie zmienia), więc to nadmiar bez
 *    skutku - tańszy niż pytanie serwisu poświadczeń o identyfikator sesji, którego
 *    nie eksponuje;
 *  • **`unavailable` nie jest błędem**: build bez Firebase, Expo Go, telefon bez
 *    usług Google - skrzynka działa, tylko nikt nie dzwoni (§12.1).
 */

import type { AuthService } from '../auth/authService';
import type { StoredCredentials } from '../ports/credentialsPort';
import type { PushDevicePort } from '../ports/pushDevicePort';
import type { ServerPort } from '../ports/serverPort';
import { authorizedFetch } from './authorizedFetch';

export type PushTokenSyncOutcome =
  /** Serwer przyjął token dla bieżących poświadczeń. */
  | 'registered'
  /** Ten sam token dla tych samych poświadczeń był już potwierdzony - rozmowy nie było. */
  | 'fresh'
  /** Urządzenie nie ma tokenu (brak Firebase w buildzie, Expo Go) - nie ma czego zgłaszać. */
  | 'unavailable'
  /** Bez profilu, bez sieci albo serwer odmówił - spróbujemy przy okazji. */
  | 'skipped';

export class PushTokenSync {
  private confirmed: string | null = null;

  constructor(
    private readonly device: PushDevicePort,
    private readonly server: ServerPort,
    private readonly auth: AuthService,
  ) {}

  /** Wejście pętli okazji. */
  async register(): Promise<PushTokenSyncOutcome> {
    const profile = await this.auth.profile();
    if (profile == null) return 'skipped';

    const token = await this.device.token();
    if (token == null) return 'unavailable';
    if (this.confirmed === keyOf(profile, token)) return 'fresh';

    const done = await authorizedFetch(this.auth, async (jwt) => {
      await this.server.registerPushToken(jwt, token);
      return true;
    });
    if (done !== true) return 'skipped';

    // Klucz liczymy PO rozmowie: `authorizedFetch` mógł w jej trakcie odświeżyć parę
    // tokenów, a klucz sprzed odświeżenia kazałby rejestrować jeszcze raz za minutę.
    const after = await this.auth.profile();
    this.confirmed = keyOf(after ?? profile, token);
    return 'registered';
  }
}

/** Ten sam pilot, te same poświadczenia, ten sam token urządzenia = nic nowego. */
const keyOf = (profile: StoredCredentials, token: string): string =>
  `${profile.pilot.id}\u0000${profile.refreshToken}\u0000${token}`;
