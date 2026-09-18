/**
 * Ninerdeck (serwer) - kto jest zalogowany w panelu (`GET /admin/api/me`).
 *
 * Osobne zapytanie, a nie pole w odpowiedzi logowania, bo ciasteczko sesji jest
 * `HttpOnly`: po odświeżeniu karty JavaScript panelu NIE MA jak odczytać, kim jest -
 * musi zapytać serwer. To jest jedyny powód istnienia tej trasy i całej jej treści.
 *
 * Zwracamy konto, a nie claims z tokenu: nazwisko do stopki sidebara (`.who-name`)
 * w tokenie nie siedzi i siedzieć nie powinno - token ma być mały i nieciekawy.
 *
 * Od wielofirmowości odpowiedź niesie KLUB sesji (`org`) i kod/rolę Z CZŁONKOSTWA
 * w nim: ten sam człowiek w drugim klubie ma inny kod i inną rolę, więc pytanie
 * „kim jestem" ma odtąd dopełnienie „w którym klubie".
 */

import type {
  ExternalIdentitiesPort,
  PasswordCredentialsPort,
  PilotsPort,
} from '../../common/ports.ts';
import type { PanelPilot } from '../../common/commands/auth.ts';
import type { AccountMethodWire } from '../contracts/loginSessions.ts';

/**
 * Czym zalogowany może wejść i pod jakim adresem - karta „Logowanie" na `#/konto`
 * (2.1.0, issue #134 D6; mockup `konto`).
 *
 * Adres jest DO ODCZYTU: to tożsamość, a nie ustawienie - klub go nie zmienia, osoba
 * też nie. Panel czyta stąd jeszcze jedną rzecz, choć nie widać jej wprost: obecność
 * `password` rozstrzyga, czy karta obok nazywa się „Zmień hasło" (z polem na obecne),
 * czy „Ustaw hasło" (bez niego).
 */
export interface PanelAccount {
  email: string | null;
  methods: AccountMethodWire[];
}

export class AdminMeQueries {
  constructor(
    private readonly pilots: PilotsPort,
    private readonly identities: ExternalIdentitiesPort,
    private readonly credentials: PasswordCredentialsPort,
  ) {}

  /**
   * Konto zalogowanego - OSOBNA trasa, nie pola w `GET /me`.
   *
   * `/me` przestawia całą ramę panelu i panel trzyma je bez terminu ważności, a metody
   * zmieniają się dokładnie wtedy, gdy ktoś ustawi sobie hasło na tej stronie. Doklejone
   * tam, kazałyby po każdej zmianie hasła unieważnić tożsamość sesji - czyli przerysować
   * kolumnę i pasek po to, żeby zapaliła się plakietka.
   *
   * Trzy odczyty zamiast jednego zapytania, bo każdy z nich to gotowy port i żaden nie
   * jest po nic: `pilots` niesie adres, pozostałe dwa odpowiadają obecnością wiersza.
   */
  async account(pilotId: string): Promise<PanelAccount | null> {
    const person = await this.pilots.findById(pilotId);
    if (person == null || !person.active) return null;

    const [google, password] = await Promise.all([
      this.identities.findByPilot(pilotId),
      this.credentials.find(pilotId),
    ]);

    // Kolejność jest kolejnością plakietek w mockupie - Google, potem hasło.
    const methods: AccountMethodWire[] = [];
    if (google != null) methods.push('google');
    if (password != null) methods.push('password');

    return { email: person.email, methods };
  }

  /**
   * `null` = token przeżył konto albo członkostwo (skasowane / wyłączone po wydaniu
   * sesji). Trasa odpowiada wtedy 401, bo to jest prawda o sesji: poświadczenie jest
   * ważne kryptograficznie, ale nie stoi za nim nikt.
   */
  async get(pilotId: string, orgId: string): Promise<PanelPilot | null> {
    const account = await this.pilots.findById(pilotId);
    if (account == null || !account.active) return null;

    const membership = await this.pilots.membership(pilotId, orgId);
    if (membership == null || membership.status !== 'active' || membership.code == null) {
      return null;
    }

    return {
      id: account.id,
      code: membership.code,
      name: account.name,
      role: membership.role,
      org: { id: membership.orgId, slug: membership.orgSlug, name: membership.orgName },
    };
  }

  /**
   * To samo pytanie zadane przez sesję PLATFORMOWĄ (issue #101, E1) - bez klubu, więc
   * bez kodu i bez roli członkostwa. Zostaje nazwisko: kolumna boczna pisze je tak samo
   * w obu ramach, a w tokenie nazwisko nie siedzi i siedzieć nie powinno.
   *
   * `null` = osoba skasowana albo zablokowana platformowo po wydaniu sesji. Rolę
   * platformową sprawdziła już brama (`authorizePlatform`), więc tu jej nie powtarzamy -
   * dwa sprawdzenia tej samej rzeczy rozjeżdżają się przy pierwszej poprawce jednego.
   */
  async platform(pilotId: string): Promise<{ id: string; name: string } | null> {
    const account = await this.pilots.findById(pilotId);
    if (account == null || !account.active) return null;
    return { id: account.id, name: account.name };
  }
}
