/**
 * Ninerdeck (serwer) - ADRES linku „ustaw hasło" (2.1.0, `docs/logowanie-haslem.md` §4.2, §5.4).
 *
 * Jedno miejsce składania adresu `/haslo/#<token>` z `PUBLIC_BASE_URL` - ten sam wzorzec,
 * co `sheetUrl` kart arkusza. Token jedzie we FRAGMENCIE (`#`), nie w ścieżce ani
 * zapytaniu: fragment nie trafia do logów serwera, do `Referer` ani do historii proxy.
 *
 * Bazą jest adres PANELU I API (`PUBLIC_BASE_URL`), nie strony: strona `/haslo/` woła
 * `POST /auth/password/reset` względnym adresem, a na hoście strony trasy API nie
 * istnieją (rozdział hostów, issue #124). Serwowanie `/haslo/` na hoście aplikacji
 * domyka epik H-F razem ze stroną.
 */

export interface PasswordLinks {
  resetUrl(token: string): string;
}

export class BaseUrlPasswordLinks implements PasswordLinks {
  private readonly base: string;

  constructor(publicBaseUrl: string) {
    this.base = publicBaseUrl.replace(/\/+$/, '');
  }

  resetUrl(token: string): string {
    return `${this.base}/haslo/#${token}`;
  }
}
