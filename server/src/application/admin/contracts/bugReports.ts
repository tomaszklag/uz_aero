/**
 * UZ Aero (serwer) - KONTRAKT modułu „Zgłoszenia" w panelu (issue #87).
 *
 * Pliki w `contracts/` zawierają WYŁĄCZNIE typy i wolno im importować wyłącznie
 * `@uzaero/domain` (pilnuje `test/architecture.test.ts`). Zgłoszenie błędu nie jest
 * bytem domenowym - opisuje APLIKACJĘ, nie lot - więc ten plik nie importuje niczego,
 * a katalogi statusu i wagi mają tu LUSTRA, dokładnie jak `PilotRoleWire`
 * w `contracts/pilots.ts`: definicja mieszka w `server/src/domain/bugReports.ts`,
 * czyli poza zasięgiem tej granicy.
 *
 * ══ CO ZOSTAJE NIEDOMKNIĘTE ŚWIADOMIE ══
 * `context` jest workiem `Record<string, unknown>` - tak samo jak `details` w dzienniku
 * audytu i z tego samego powodu: kształt należy do TELEFONU i zmienia się co tydzień
 * testów, a serwer go nie interpretuje. Rozpisanie go na pola tutaj kazałoby wdrażać
 * serwer za każdym razem, gdy aplikacja zaczyna dołączać coś nowego - czyli dokładnie
 * wtedy, gdy zgłoszenie niesie najwięcej.
 */

/** Lustro `BUG_STATUSES` z `domain/bugReports.ts` - patrz nagłówek pliku. */
export type BugStatusWire = 'new' | 'in_progress' | 'resolved' | 'rejected';

/** Lustro `BUG_SEVERITIES` z `domain/bugReports.ts`; `null` = pilot nie wybrał. */
export type BugSeverityWire = 'blocking' | 'annoying' | 'minor';

/**
 * Jedno zgłoszenie - wiersz listy I treść szuflady w jednym kształcie.
 *
 * Bez podziału na „element listy" i „szczegóły", inaczej niż flota czy konta: całe
 * zgłoszenie to opis i kontekst, więc lista skrócona o kontekst oszczędzałaby kilobajty
 * i kosztowała drugie żądanie przy każdym otwarciu wiersza. Lista jest krótka (jedna
 * faza testów), a szuflada ma się otwierać natychmiast.
 */
export interface AdminBugReport {
  uuid: string;
  /** ISO 8601 UTC - zegar TELEFONU, chwila, w której pilot zobaczył problem. */
  createdAt: string;
  /** ISO 8601 UTC - zegar SERWERA. Różnica względem `createdAt` mierzy czas offline. */
  receivedAt: string;

  pilotId: string;
  /** Kod i nazwisko z `pilots`; `null` = konta już nie ma, zgłoszenie zostaje. */
  pilotCode: string | null;
  pilotName: string | null;

  severity: BugSeverityWire | null;
  description: string;
  /** Czytelna etykieta miejsca („KOKPIT · arkusz TANKOWANIE"). */
  screen: string;
  appVersion: string | null;
  /** Operacja, przy której powstało zgłoszenie; `null` poza kokpitem i logiem. */
  sessionUuid: string | null;
  context: Record<string, unknown>;

  status: BugStatusWire;
  /** Komentarz administratora przy ostatniej zmianie statusu. */
  statusNote: string | null;
  /** Kod administratora, który zmienił status; `null` = status nigdy nie zmieniany. */
  statusBy: string | null;
  statusAt: string | null;
}

/**
 * Lista + liczniki per status.
 *
 * Liczniki jadą RAZEM z listą, a nie osobnym żądaniem: filtr statusem ma pokazywać,
 * ile jest w każdej szufladzie, także w tych, których właśnie nie widać - inaczej
 * „Rozwiązane" wyglądałoby na puste, dopóki ktoś w nie nie kliknie.
 */
export interface AdminBugReportList {
  items: AdminBugReport[];
  counts: Record<BugStatusWire, number>;
}
