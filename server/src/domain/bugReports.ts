/**
 * UZ Aero (serwer) - słownik ZGŁOSZEŃ BŁĘDÓW z aplikacji pilota (issue #87).
 *
 * Ten sam powód, dla którego istnieją `roles.ts` i `adminActions.ts`: pytanie „jakie
 * stany może mieć zgłoszenie" ma mieć JEDNĄ odpowiedź, w jednym pliku, który da się
 * przeczytać w całości. Literały rozsiane po trasie, komendzie i zapytaniu byłyby
 * konstrukcją, w której nikt nie wie, czy zna wszystkie - a `status` jest zwykłym
 * `TEXT`-em w bazie, więc kompilator sam z siebie nie broni tu niczego.
 *
 * Panel trzyma LUSTRO obu unii (`admin/src/api/dto.ts`), a zgodność przybija
 * `admin/test/mirrors.test.ts` - dopisanie tu pozycji nieznanej panelowi kończy się
 * surowym `in_progress` na ekranie klubu.
 */

/**
 * Cykl życia zgłoszenia. Cztery pozycje, bo tyle różnych rzeczy administrator robi
 * ze zgłoszeniem: przyjmuje je, bierze na warsztat, zamyka albo odkłada jako niebłąd.
 *
 * Kolejność JEST kolejnością na ekranie (filtr statusem w panelu) i idzie od tego,
 * co wymaga uwagi, do archiwum - lista ma pokazywać robotę, nie historię.
 *
 * `rejected` nie znaczy „zignorowane": znaczy „to nie jest błąd" albo „nie zrobimy
 * tego teraz". Dlatego komentarz jest przy nim WYMAGANY (trasa panelu) - odrzucenie
 * bez powodu nie mówi zgłaszającemu nic, a za miesiąc nie mówi nic także temu, kto
 * odrzucał.
 */
export const BUG_STATUSES = ['new', 'in_progress', 'resolved', 'rejected'] as const;

export type BugStatus = (typeof BUG_STATUSES)[number];

/** Stan, w którym zgłoszenie ląduje z telefonu. Nadaje go baza (`DEFAULT 'new'`). */
export const DEFAULT_BUG_STATUS: BugStatus = 'new';

/**
 * Waga zgłoszona przez PILOTA - jak bardzo to przeszkadza w pracy, a nie jak trudne
 * jest do naprawienia. `null` (pole pominięte) jest normalnym stanem: waga jest
 * w formularzu opcjonalna, bo zgłoszenie ma kosztować jedno zdanie, a nie decyzję.
 */
export const BUG_SEVERITIES = ['blocking', 'annoying', 'minor'] as const;

export type BugSeverity = (typeof BUG_SEVERITIES)[number];

/** Strażnik wejścia z zewnątrz (filtr w adresie, kolumna w bazie, ciało żądania). */
export function isBugStatus(value: unknown): value is BugStatus {
  return typeof value === 'string' && (BUG_STATUSES as readonly string[]).includes(value);
}

export function isBugSeverity(value: unknown): value is BugSeverity {
  return typeof value === 'string' && (BUG_SEVERITIES as readonly string[]).includes(value);
}

/**
 * Status z bazy → status znany kodowi. Wartość spoza katalogu (ręczna poprawka SQL-em,
 * pozycja wycofana z kodu) schodzi do `new`, czyli do stanu WYMAGAJĄCEGO UWAGI.
 *
 * Kierunek błędu jest tu świadomy i odwrotny niż w `roles.ts`: tam nieznana rola
 * schodziła do najmniejszych uprawnień, żeby nie otworzyć niczego przypadkiem; tutaj
 * nieznany status ma wrócić na listę roboczą, bo zgłoszenie schowane przed
 * administratorem jest gorsze niż zgłoszenie pokazane drugi raz.
 */
export function bugStatusOf(value: unknown): BugStatus {
  return isBugStatus(value) ? value : DEFAULT_BUG_STATUS;
}
