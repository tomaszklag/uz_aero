/**
 * Ninerdeck (serwer) - CZYM OSOBA MOŻE SIĘ ZALOGOWAĆ (2.1.0, §5.3).
 *
 * Jedno pytanie zadawane z DWÓCH powierzchni: panel pyta o nie na `#/konto`
 * (`GET /admin/api/me/account`), telefon w ustawieniach (`GET /me/account`). Obie
 * potrzebują tego z tego samego powodu - obecność hasła rozstrzyga, czy wiersz obok
 * nazywa się „Zmień hasło" (z polem na obecne), czy „Ustaw hasło" (bez niego).
 *
 * Dlatego zapytanie mieszka w `common/`, a nie w którejś z powierzchni: dwie kopie tej
 * samej pary odczytów rozjechałyby się przy pierwszej poprawce jednej z nich, a rozjazd
 * znaczyłby tu formularz proszący o hasło, którego nie ma - albo milcząco je nadpisujący.
 *
 * ══ ODPOWIADA DWOMA „TAK/NIE", NIE LISTĄ NAPISÓW ══
 * Słownik plakietek (`google`, `password`) należy do KONTRAKTU powierzchni i każda składa
 * go u siebie. Gdyby robiło to zapytanie, `common/` musiałoby znać wire panelu - a to
 * jest dokładnie ta zależność, przed którą broni strażnik architektury.
 *
 * ══ OSOBNO OD „KIM JESTEM" ══
 * `GET /me` przestawia całą ramę i nie starzeje się nigdy, a metody zmieniają się
 * dokładnie wtedy, gdy ktoś ustawi sobie hasło. Doklejone tam kazałyby po każdej zmianie
 * hasła unieważnić tożsamość sesji - czyli przerysować ekran po to, żeby zapaliła się
 * jedna plakietka.
 */

import type {
  ExternalIdentitiesPort,
  PasswordCredentialsPort,
  PilotsPort,
} from '../ports.ts';

export interface AccountMethods {
  /** Adres jest DO ODCZYTU: to tożsamość, a nie ustawienie - klub go nie zmienia. */
  email: string | null;
  hasGoogle: boolean;
  hasPassword: boolean;
}

export class AccountQuery {
  constructor(
    private readonly pilots: PilotsPort,
    private readonly identities: ExternalIdentitiesPort,
    private readonly credentials: PasswordCredentialsPort,
  ) {}

  /**
   * `null` = token przeżył konto (skasowane albo zablokowane platformowo po wydaniu
   * sesji). Trasa odpowiada wtedy 401 - poświadczenie jest ważne kryptograficznie,
   * ale nie stoi za nim nikt.
   *
   * Trzy odczyty zamiast jednego zapytania, bo każdy z nich to gotowy port i żaden nie
   * jest po nic: `pilots` niesie adres, pozostałe dwa odpowiadają obecnością wiersza.
   */
  async of(pilotId: string): Promise<AccountMethods | null> {
    const person = await this.pilots.findById(pilotId);
    if (person == null || !person.active) return null;

    const [google, password] = await Promise.all([
      this.identities.findByPilot(pilotId),
      this.credentials.find(pilotId),
    ]);

    return { email: person.email, hasGoogle: google != null, hasPassword: password != null };
  }
}
