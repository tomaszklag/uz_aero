/**
 * Ninerdeck (serwer) - KONTRAKT listy sesji logowania dla panelu (2.1.0, issue #133;
 * `docs/logowanie-haslem.md` §5.6, mockupy `piloci-konto` i `konto`).
 *
 * Lista odpowiada na JEDNO pytanie: „czy to moje urządzenie". Wszystko, co tu stoi, ma
 * pomóc je rozpoznać - i nic ponadto.
 *
 * ══ CZEGO TU NIE MA ══
 * Refresh tokenu ani niczego, czym dałoby się sesję podszyć: identyfikator jedzie, bo
 * bez niego nie da się kliknąć „Wyloguj", ale sam w sobie nie otwiera niczego - brama
 * pyta o PODPISANY token, w którym ten identyfikator jest tylko jednym z claimów.
 */

/**
 * Lustro `SESSION_SURFACES` z `domain/loginSessions.ts` - patrz nagłówek pliku.
 *
 * Kopia, a nie import, bo `contracts/` jest POWIERZCHNIĄ dla klienta panelu i nie wolno
 * jej wciągać wnętrza serwera (`architecture.test.ts`). Rozjazd złapie kompilator:
 * `loginSessionView` przepisuje tu wartość typu domenowego, więc nowa wartość w domenie
 * przestanie się tu podstawiać.
 */
export type SessionSurfaceWire = 'mobile' | 'panel';

/** Lustro `LOGIN_METHODS`; `legacy` = poświadczenie sprzed 2.1.0, o którym rejestr nie wie. */
export type LoginMethodWire = 'google' | 'password' | 'legacy';

/**
 * Czym ta OSOBA może dziś wejść - plakietki „Google" i „hasło" w karcie członka (P2)
 * i na `#/konto` (K1). Lustro `IssuedLoginMethod`.
 *
 * Wyprowadzone z `LoginMethodWire`, żeby związek między nimi był w typie, a nie
 * w komentarzu: sesja ma METODĘ, którą się nią zalogowano, a konto ma METODY, którymi
 * wolno się logować - i te pierwsze są podzbiorem drugich powiększonym o przeszłość.
 */
export type AccountMethodWire = Exclude<LoginMethodWire, 'legacy'>;

export interface AdminLoginSession {
  id: string;
  surface: SessionSurfaceWire;
  method: LoginMethodWire;
  /** ISO 8601 - panel formatuje sam, jak wszędzie indziej w tym kontrakcie. */
  createdAt: string;
  lastSeenAt: string;
  /** `null` = urządzenie nieznane; panel pisze wtedy „urządzenie nieznane", nie zmyśla. */
  device: string | null;
  ip: string | null;
  /**
   * Czy to sesja, z której przyszło TO żądanie.
   *
   * Panel oznacza ją „to urządzenie" i NIE daje jej wyłączyć: kliknięcie „Wyloguj" przy
   * własnej karcie przeglądarki wyglądałoby jak awaria (ekran logowania bez powodu),
   * a od wylogowania siebie jest przycisk „Wyloguj" w pasku.
   */
  current: boolean;
}
