/**
 * Ninerdeck - KIEDY ŁĄCZE KANAŁU KLUBU MA STAĆ OTWARTE (4.0.0, `docs/kanal-klubu.md`
 * §3.4, K1, K4, K6; epik KK-C #246).
 *
 * Czysta decyzja wyjęta z bindera w UI, bo jest REGUŁĄ, a nie szczegółem montowania -
 * i bo każdy jej warunek ma powód, który łatwo zgubić przy „uproszczeniu":
 *  - **na wierzchu** - aplikacja w tle nie trzyma połączenia; wiadomości przychodzą wtedy
 *    pushem, bo serwer wysyła go dokładnie do sesji BEZ połączenia (K4);
 *  - **po odblokowaniu** - za PIN-em łącze nie ma komu pokazać banera, a baner nad zamkiem
 *    pokazałby treść komuś, kto telefonu nie odblokował;
 *  - **z żywą sesją** - po zdalnym wylogowaniu (2.1.0, D7) token już nie przejdzie, więc
 *    łączenie się byłoby pętlą odmów; wraca dopiero z ponownym zalogowaniem;
 *  - **poza kokpitem** - dopóki pilot trzyma samolot, łącze się rozłącza, a powiadomienia
 *    przychodzą pushem po cichu na listę systemową (K6). Kokpit jest stanem modalnym, więc
 *    „trzyma samolot" znaczy dokładnie „jest w kokpicie";
 *  - **z klubem** - poświadczenie łącza jest poświadczeniem KLUBU: każda zmiana klubu
 *    aktywnego to nowe połączenie, nigdy przepięcie starego.
 */

export interface LinkConditions {
  /** Aplikacja na wierzchu (`isForegroundState`). */
  foreground: boolean;
  /** Bramka tożsamości otwarta (`signed_in`). */
  signedIn: boolean;
  /** Serwer zerwał sesję zdalnie (znacznik z odświeżenia tokenów). */
  revoked: boolean;
  /** Pilot trzyma samolot - kokpit. */
  holdsAircraft: boolean;
  /** Klub aktywny; `null` poza `signed_in`. */
  orgId: string | null;
}

/** Klub, dla którego łącze ma stać otwarte - albo `null`, gdy ma być rozłączone. */
export function linkTarget(conditions: LinkConditions): string | null {
  const { foreground, signedIn, revoked, holdsAircraft, orgId } = conditions;
  if (!foreground || !signedIn || revoked || holdsAircraft) return null;
  return orgId;
}

/**
 * Czy stan aplikacji (`AppState`) to „na wierzchu". `inactive` liczy się jako wierzch:
 * na iOS to chwila, w której pilot ściąga centrum powiadomień albo przełącza aplikacje,
 * a zrywanie połączenia na tę sekundę kosztowałoby ponowne połączenie i dociągnięcie
 * wszystkich ekranów. Stan nieznany (początek startu na iOS) i rozszerzenie - nie: łącze
 * otworzy pierwsze `active`.
 */
export function isForegroundState(state: string | null): boolean {
  return state === 'active' || state === 'inactive';
}
