/**
 * Ninerdeck - JAK TELEFON NAZYWA SIĘ SERWEROWI (2.1.0, issue #135 E1; §6).
 *
 * Od 2.1.0 każda żywa sesja ma wiersz w `login_sessions`, a panel pokazuje jej listę
 * pilotowi (`#/konto`) i administratorowi (karta członka). Lista odpowiada na JEDNO
 * pytanie - „czy to moje urządzenie" - więc etykieta musi dać się rozpoznać z kąta oka.
 *
 * ══ TELEFON PODAJE SIĘ SAM ══
 * Przeglądarka nie ma jak, więc serwer skleja jej dwa słowa z `User-Agent`
 * (`server/src/http/device.ts`). Aplikacja ma lepiej: zna model, wersję systemu i własne
 * wydanie, bo zbiera je już do zgłoszeń błędów (issue #87). Wysyła je nagłówkiem
 * `X-Ninerdeck-Device` i dlatego - jako jedyna - NAZYWA W ETYKIECIE SIEBIE: przy wierszu
 * przeglądarki człon powierzchni dokleja panel, przy telefonie stoi już w napisie.
 *
 * ══ KOLEJNOŚĆ CZŁONÓW JEST KONTRAKTEM SERWERA ══
 * „Android 14 · Pixel 7 · Ninerdeck 2.1.0" - dokładnie tak opisuje ten nagłówek docblock
 * `device.ts` i komentarz kolumny `login_sessions.device`. Wiersz zgłoszenia błędu składa
 * te same fakty ODWROTNIE („Pixel 7a · Android 14") i to nie jest niespójność do
 * naprawienia hurtem: tam etykietą wiersza jest „Telefon", więc model prowadzi, a tu
 * napis stoi sam w kolumnie obok „Chrome · Windows" i musi się z nim rymować.
 *
 * ══ MODUŁ JEST CZYSTY I DLATEGO MA WŁASNY KSZTAŁT WEJŚCIA ══
 * Fakty przynosi WOŁAJĄCY (`ui/bootstrap/appBootstrap.ts` z `deviceRelease()`), bo
 * `Platform.constants` mieszka w `ui/components/bug/`, a warstwa `infrastructure` nie
 * ma prawa importować `ui` (`__tests__/architecture.test.ts`). `DeviceFacts` jest przez
 * to WĘŻSZE niż `BugRelease` - opisuje cztery pola, których ta funkcja naprawdę używa,
 * zamiast wiązać logowanie z kontekstem reportera błędów.
 *
 * Sufitu długości tu NIE MA: nagłówek jest dla serwera danymi z zewnątrz, więc tnie go
 * `deviceLabelFrom` - drugie ucięcie po tej stronie byłoby drugą definicją tej granicy.
 */

/** Cztery fakty, z których składa się etykieta. Zgodne strukturalnie z `BugRelease`. */
export interface DeviceFacts {
  /** `Platform.OS`: `android`, `ios`, … - małą literą, jak podaje React Native. */
  platform: string;
  /** Wersja systemu widoczna dla człowieka („14"), nie poziom API. */
  osVersion: string | null;
  /** Model telefonu („Pixel 7a"); `null`, gdy RN go nie zna bez modułu natywnego. */
  deviceModel: string | null;
  /** Wydanie aplikacji („1.1.0 (build 2)"); `null` w Expo Go. */
  appVersion: string | null;
}

/**
 * `Platform.OS` jest małą literą, a etykietę czyta człowiek. Nazwa spoza tablicy wraca
 * z wielką pierwszą literą zamiast wpaść w „nieznane": nowa platforma ma się nazwać
 * z grubsza dobrze, a nie zniknąć z listy sesji.
 */
const SYSTEM_NAMES: Record<string, string> = {
  android: 'Android',
  ios: 'iOS',
  macos: 'macOS',
  windows: 'Windows',
  web: 'Web',
};

function systemName(platform: string): string {
  const known = SYSTEM_NAMES[platform.toLowerCase()];
  if (known != null) return known;
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

/**
 * „Android 14 · Pixel 7a · Ninerdeck 1.1.0 (build 2)".
 *
 * Człon, którego nie znamy, po prostu nie powstaje - pusty („Android · · Ninerdeck")
 * albo słowo „nieznany" zajmowałyby miejsce, nie niosąc nic. Przy samej platformie
 * zostaje jedno słowo i to wystarcza: lepsze niż `null`, bo wiersz sesji telefonu ma
 * odróżniać się od wiersza przeglądarki.
 */
export function deviceLabel(facts: DeviceFacts): string {
  const system =
    facts.osVersion == null ? systemName(facts.platform) : `${systemName(facts.platform)} ${facts.osVersion}`;
  const app = facts.appVersion == null ? null : `Ninerdeck ${facts.appVersion}`;
  return [system, facts.deviceModel, app].filter((part): part is string => part != null && part !== '').join(' · ');
}
