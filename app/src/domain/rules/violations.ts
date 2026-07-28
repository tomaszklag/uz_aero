/**
 * UZ Aero — słownik naruszeń reguł domenowych.
 *
 * Każda gwardia z `sessionRules.ts` zwraca `RuleViolation` o jednej z dwóch wag:
 *
 *  - `error`   — **twarde odrzucenie**. Zdarzenie NIE trafia do strumienia; pilot dostaje
 *                natychmiastowy, zrozumiały komunikat i poprawia wpis. Stosujemy tam, gdzie
 *                zdarzenie zepsułoby maszynę stanów, na której stoi arytmetyka dnia
 *                (cykle silnika, loty, block time, łańcuch MH) albo gdzie liczby są
 *                wewnętrznie sprzeczne (np. `after ≠ before + added`).
 *  - `warning` — **miękka flaga**. Zdarzenie ZOSTAJE zapisane, ale komenda zwraca ostrzeżenie
 *                do pokazania pilotowi. Stosujemy tam, gdzie dane są tylko podejrzane, a nie
 *                niemożliwe (nieprecyzyjny paliwomierz, rozjazd zegarów) — zgodnie z §4.5
 *                rozstrzyga to serwer flagą, klient nie ma prawa zjeść faktu z terenu.
 *
 * ZASADA NADRZĘDNA (CLAUDE.md, §4.1): brak sieci nigdy nie blokuje pracy pilota, ale
 * *bzdura wpisana lokalnie* jest czymś innym niż *brak sieci* — dlatego lokalnie mamy
 * twarde błędy, których serwer (§4.5) świadomie nie ma. Serwer nie może odrzucić danych
 * z terenu (byłyby stracone), aplikacja może — bo pilot stoi obok i poprawi w 3 sekundy.
 */

/** Waga naruszenia: twarde odrzucenie vs miękka flaga. */
export type Severity = 'error' | 'warning';

/**
 * Kody naruszeń. Nazwy pokrywające się z flagami serwera (§4.5) są celowe —
 * `MH_REGRESSION`, `FUEL_MISMATCH`, `CLOCK_DRIFT` to ten sam fenomen widziany lokalnie.
 */
export type ViolationCode =
  // ── sesja i single-writer ──────────────────────────────────────────────────
  | 'SESSION_NOT_CLAIMED'
  | 'SESSION_ALREADY_CLAIMED'
  | 'SESSION_MISMATCH'
  | 'AIRCRAFT_MISMATCH'
  | 'WRITER_MISMATCH'
  | 'DAY_CLOSED'
  | 'CORRECTION_WINDOW_EXPIRED'
  // ── preflight ──────────────────────────────────────────────────────────────
  | 'PREFLIGHT_REQUIRED'
  | 'PREFLIGHT_ALREADY_CONFIRMED'
  // ── silnik i lot ───────────────────────────────────────────────────────────
  | 'ENGINE_ALREADY_RUNNING'
  | 'ENGINE_NOT_RUNNING'
  | 'ENGINE_STOP_IN_FLIGHT'
  | 'ENGINE_RUNNING_AT_DAY_CLOSE'
  | 'ALREADY_IN_FLIGHT'
  | 'NOT_IN_FLIGHT'
  // ── paliwo ─────────────────────────────────────────────────────────────────
  | 'FUEL_NEGATIVE'
  | 'FUEL_ARITHMETIC'
  | 'FUEL_OVER_CAPACITY'
  | 'FUEL_INCREASE_WITHOUT_REFUEL'
  | 'FUEL_MISMATCH'
  | 'REFUEL_ENGINE_RUNNING'
  // ── motogodziny ────────────────────────────────────────────────────────────
  | 'MH_NEGATIVE'
  | 'MH_REGRESSION'
  | 'MH_DELTA_MISMATCH'
  // ── zrzuty ─────────────────────────────────────────────────────────────────
  | 'DROP_NO_JUMPERS'
  | 'DROP_ON_GROUND'
  | 'DROP_OUTSIDE_JUMP_OPERATION'
  // ── załoga ─────────────────────────────────────────────────────────────────
  | 'PIC_CHANGE_NOT_ALLOWED'
  | 'DUAL_IS_PIC'
  // ── wpis ręczny i zamknięcie dnia ──────────────────────────────────────────
  | 'MANUAL_ENTRY_EMPTY'
  | 'MANUAL_ENTRY_TIME_ORDER'
  | 'DAY_ALREADY_CLOSED'
  | 'DUTY_END_BEFORE_START'
  // ── korekta zdarzenia (04c) ────────────────────────────────────────────────
  | 'CORRECTION_TARGET_NOT_FOUND'
  | 'CORRECTION_TARGET_NOT_ALLOWED'
  | 'CORRECTION_TIME_IN_FUTURE'
  // ── zegary ─────────────────────────────────────────────────────────────────
  | 'CLOCK_DRIFT';

/** Pojedyncze naruszenie reguły. `message` jest po polsku — trafia wprost do pilota. */
export interface RuleViolation {
  code: ViolationCode;
  severity: Severity;
  /** Komunikat dla pilota (PL), konkretny: co jest nie tak i co z tym zrobić. */
  message: string;
  /** Liczby/wartości do podświetlenia w UI (opcjonalne, diagnostyka). */
  details?: Record<string, string | number | null>;
}

/** Skrót konstrukcyjny: twarde odrzucenie. */
export function error(
  code: ViolationCode,
  message: string,
  details?: RuleViolation['details'],
): RuleViolation {
  return { code, severity: 'error', message, ...(details ? { details } : {}) };
}

/** Skrót konstrukcyjny: miękka flaga (zdarzenie i tak zostanie zapisane). */
export function warning(
  code: ViolationCode,
  message: string,
  details?: RuleViolation['details'],
): RuleViolation {
  return { code, severity: 'warning', message, ...(details ? { details } : {}) };
}

export const errorsOf = (v: RuleViolation[]): RuleViolation[] =>
  v.filter((x) => x.severity === 'error');

export const warningsOf = (v: RuleViolation[]): RuleViolation[] =>
  v.filter((x) => x.severity === 'warning');

/**
 * Wyjątek rzucany przez warstwę komend, gdy zdarzenie łamie twardy inwariant.
 * Niesie WSZYSTKIE twarde naruszenia (pilot ma zobaczyć komplet, nie pierwsze z brzegu).
 */
export class DomainRuleError extends Error {
  /** Kod pierwszego naruszenia — wygodny do rozgałęzień w UI. */
  readonly code: ViolationCode;
  readonly violations: RuleViolation[];

  constructor(violations: RuleViolation[]) {
    const list = violations.length > 0 ? violations : [error('SESSION_MISMATCH', 'Nieznane naruszenie reguły.')];
    super(list.map((v) => v.message).join(' '));
    this.name = 'DomainRuleError';
    this.code = list[0]!.code;
    this.violations = list;
    // Babel/TS: przywróć prototyp, żeby `instanceof` działał po transpilacji do ES5-owego łańcucha.
    Object.setPrototypeOf(this, DomainRuleError.prototype);
  }
}

/** Rzuca `DomainRuleError`, jeśli wśród naruszeń jest choć jedno twarde. */
export function assertNoErrors(violations: RuleViolation[]): void {
  const errors = errorsOf(violations);
  if (errors.length > 0) throw new DomainRuleError(errors);
}
