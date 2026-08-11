/**
 * UZ Aero (serwer) — KONTRAKT podglądu korekty administratora (`A02b`).
 *
 * Pliki w `contracts/` zawierają WYŁĄCZNIE typy i wolno im importować wyłącznie
 * `@uzaero/domain` (pilnuje `test/architecture.test.ts`).
 *
 * ══ PO CO W OGÓLE PODGLĄD ══
 * Mockup `A02b` pokazuje kartę „Wpływ na liczby dnia · przed → po" PRZED zapisem:
 * czas blokowy 05:53 → 05:41, cykl silnika 3 skrócony o 12 minut, `void` zostawiający
 * cykl otwarty. Panelowi wolno importować z domeny wyłącznie typy, więc policzyć tego
 * nie może i nie ma prawa — liczby dnia mają jedno źródło (`projectSession`) i musi to
 * być serwer. Stąd zapytanie, które robi dokładnie to, co komenda, tyle że **niczego
 * nie zapisuje**: ta sama walidacja, ta sama projekcja, zero `INSERT`-ów i zero wpisów
 * w dzienniku audytu.
 *
 * **Podgląd nie przyjmuje `reason`** — administrator ma zobaczyć skutek, ZANIM napisze
 * uzasadnienie. Wymaganie powodu do obejrzenia liczb odwracałoby kolejność myślenia:
 * najpierw się rozumie, co się zmieni, potem tłumaczy dlaczego.
 */

import type { Event, EventType, RuleViolation, SessionState } from '@uzaero/domain';

/**
 * Zdarzenie korygowane — ORYGINALNY ODCZYT, tak jak leży w rejestrze.
 *
 * Karta „Zdarzenie korygowane" z `A02b` odpowiada na jedno pytanie: skąd wzięła się
 * ta godzina. Dlatego obok siebie stoją oba zegary i czas, którym projekcja liczy dzień
 * DZIŚ — bo różnica między nimi (`gps_time: brak fixa` → fallback na `device_time`)
 * jest całą treścią scenariusza rozjazdu zegara.
 */
export interface AdminCorrectionTarget {
  uuid: string;
  type: EventType;
  /** Zegar telefonu w chwili zapisu — ślad, którego nie rusza żadna korekta. */
  deviceTime: number;
  /** `null` = zdarzenie zapisano BEZ fixa GPS; wtedy projekcja bierze `deviceTime`. */
  gpsTime: number | null;
  /**
   * Czas, którym projekcja liczy dzień W TEJ CHWILI (po nałożeniu korekt już
   * istniejących). `null` = zdarzenie jest już unieważnione, więc nie liczy się wcale.
   */
  effectiveTime: number | null;
  /** `true` = wcześniejsza korekta już to zdarzenie unieważniła (`void`). */
  voided: boolean;
  /**
   * `events.source_device` — dowolny napis podany przez telefon (`Pixel 7a · a41f9c`)
   * albo `admin:<pilotId>`, gdy wpis powstał z panelu. `null` dla zdarzeń sprzed
   * wprowadzenia pola. Panel renderuje to jako TEKST — treść pochodzi z zewnątrz.
   */
  sourceDevice: string | null;
  /** Zdarzenie w całości — panel opisuje payload tym samym kodem, co oś dnia. */
  event: Event;
}

/**
 * Odpowiedź `POST /admin/api/sessions/:uuid/corrections/preview`.
 *
 * `violations` to DOKŁADNIE te naruszenia, które zablokowałyby zapis (twarde błędy
 * z `checkAppend` w trybie administracyjnym). Pusta lista nie obiecuje powodzenia
 * na zawsze — obiecuje, że w tej chwili nie ma powodu odmowy; między podglądem
 * a zapisem telefon może dosłać paczkę i to jest normalne.
 *
 * `before`/`after` liczy `projectSession` — ta sama funkcja, którą liczy dzień telefon
 * i którą serwer buduje kartę arkusza. Panel FORMATUJE te liczby i nic nie liczy.
 */
export interface AdminCorrectionPreview {
  sessionUuid: string;
  /** `null` = celu nie ma w tej sesji; `violations` niesie wtedy powód. */
  target: AdminCorrectionTarget | null;
  before: SessionState;
  after: SessionState;
  violations: RuleViolation[];
  /**
   * Miękkie naruszenia — KOLIZJE, nie powody odmowy. Panel pokazuje je jako baner nad
   * formularzem korekty.
   *
   * Istnieją od 2026-08-07 i zastępują bramkę `400 day_open`, którą podgląd i komenda
   * odrzucały wcześniej razem. Powód zniknięcia bramki jest merytoryczny: po §3.6a brak
   * `day_close` przestał znaczyć „dzień trwa" (zdanie samolotu jest opcjonalne), więc
   * odmowa dotykałaby przede wszystkim spraw, w których korekta jest naprawdę potrzebna.
   *
   * Dwa kody, dwie różne kolizje: `ADMIN_EDIT_SESSION_ACTIVE` (pilot nadal prowadzi
   * sesję i dośle własne zdarzenia — jego paczka trafi do tego samego strumienia)
   * i `ADMIN_EDIT_PILOT_WINDOW_OPEN` (okno 24 h od zdania jeszcze biegnie, więc obie
   * strony mogą poprawiać naraz). Rozstrzyga człowiek, nie kod.
   */
  warnings: RuleViolation[];
}
