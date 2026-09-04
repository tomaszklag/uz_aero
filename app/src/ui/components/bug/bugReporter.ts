/**
 * UZ Aero - ZAPLECZE ZGŁASZANIA BŁĘDÓW (issue #87, na czas testów z pilotami).
 *
 * Moduł, a nie store Zustanda, i to jest cała jego treść: przycisk zgłoszenia stoi
 * w RAMACH (`ScreenHeader`, `AppBar`, `SheetSurface`), czyli w miejscach, których nie
 * chcemy podłączać do kolejnego globalnego stanu. Tutaj mieszka to jedno, co musi być
 * wspólne dla całej aplikacji: bieżąca trasa, uchwyt do magazynu i zapis.
 *
 * ══ JAK TO ZDJĄĆ PO TESTACH ══
 * `BUG_REPORTER_ENABLED = false` gasi przycisk we WSZYSTKICH trzech ramach naraz i nic
 * poza tym nie trzeba dotykać. Usunięcie w całości to ten katalog (`components/bug/`),
 * port (`application/ports/bugReportPort.ts`), wysyłka (`application/sync/bugReportSync.ts`),
 * tabela SQLite (migracja 8) i cztery wywołania w ramach. Trzymanie tego razem jest
 * decyzją: narzędzie fazy testów ma dać się usunąć decyzją, a nie archeologią.
 */

import type { BugReportSync } from '../../../application/sync/bugReportSync';
import type { BugReportPort, NewBugReport } from '../../../application/ports';

/**
 * Czy przycisk zgłoszenia w ogóle istnieje. Jedna flaga na całą aplikację - patrz
 * nagłówek pliku.
 */
export const BUG_REPORTER_ENABLED = true;

/**
 * Bieżąca trasa nawigacji. Ustawia ją `RootNavigator` (`onStateChange`), a nie sam
 * ekran - dzięki temu żaden ekran nie musi wiedzieć, że reporter istnieje, a nowy
 * ekran dostaje kontekst za darmo, w chwili dopisania do stosu.
 *
 * Zmienna modułowa, nie kontekst Reacta: to jest FAKT o aplikacji, nie stan renderu.
 * Ten sam wzorzec, co `sheetPresence.ts`.
 */
let route: string | null = null;

export function setBugRoute(name: string | null): void {
  route = name;
}

export function bugRoute(): string | null {
  return route;
}

let store: BugReportPort | null = null;
let sync: BugReportSync | null = null;

/** Composition root podaje magazyn i wysyłkę - jak reszta warstw (`appBootstrap`). */
export function attachBugReporter(deps: { store: BugReportPort; sync: BugReportSync }): void {
  store = deps.store;
  sync = deps.sync;
}

/**
 * Zapisuje zgłoszenie LOKALNIE i próbuje je od razu wypchnąć.
 *
 * Kolejność jest sednem: najpierw zapis, potem próba wysyłki - i to ona decyduje
 * o tym, że formularz działa bez zasięgu (§4.1). Wysyłka jedzie „obok" (bez `await`
 * u wołającego czekającego na wynik), bo pilot dostał już odpowiedź w chwili zapisu;
 * gdy sieci nie ma, paczkę zabierze najbliższa okazja pętli synca.
 *
 * Zwraca `false` WYŁĄCZNIE wtedy, gdy magazyn nie jest podłączony - czyli w testach
 * i w awarii startu. Wołający ma wtedy powiedzieć prawdę, a nie udać sukces.
 */
export async function submitBugReport(report: NewBugReport): Promise<boolean> {
  if (store == null) return false;
  await store.appendBugReport(report);
  // Błąd wysyłki jest normalnym stanem pracy (offline), a zgłoszenie i tak leży
  // w kolejce - dlatego cicho. Nieudana próba nie ma prawa wyglądać jak utrata zapisu.
  void sync?.uploadOnce().catch(() => {});
  return true;
}

/**
 * Okazja do wysyłki z pętli synca - jedna paczka, na samym końcu przebiegu.
 *
 * Cicho przy niepowodzeniu: brak sieci jest normalnym stanem pracy, a zgłoszenie
 * leży w kolejce i pojedzie następnym razem. Bez podłączonej wysyłki (testy, awaria
 * startu) nie robi nic - pętla nie ma prawa się o to wywrócić.
 */
export async function uploadPendingBugReports(): Promise<void> {
  if (sync == null) return;
  try {
    await sync.uploadOnce();
  } catch {
    // patrz wyżej
  }
}
