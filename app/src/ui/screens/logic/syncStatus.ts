/**
 * UZ Aero - stan synchronizacji → sekcja „Synchronizacja" w Ustawieniach (13).
 *
 * Ten sam podział co `statsDay.ts`: logika prezentacji w czystych funkcjach,
 * testowalnych bez React Native.
 *
 * MODUŁ SCHUDŁ WRAZ Z EKRANEM 11 (2026-08-12). Był modelem widoku osobnego ekranu
 * synchronizacji, który okazał się trzecim widokiem tej samej sesji: licznik
 * „wysłane / wszystkie", podgląd arkusza, równanie paliwa i podsumowanie zrzutów
 * powtarzały ekran 10 albo arkusz pod SyncChipem. Poszły razem z ekranem
 * (`sheetTabName`, `sentProgress`, `sentLabel`, `dayDoneHint`, `flagCatalog`,
 * `fuelSummary`, `fuelEquation`, `dropsShort`, `dropsSummary`). Zostało to, co opisuje
 * rzeczy NIEISTNIEJĄCE gdzie indziej: uwagi serwera (§4.5).
 */

import type { FlagType } from '../../../domain';

// Odmiana liczebników awansowała do `ui/format.ts` (używają jej też komponenty DS) -
// re-eksport trzyma dotychczasowe importy ekranów i testów w mocy.
export { eventsCount, plural } from '../../format';

/**
 * Flagi §4.5 po polsku - KOMPLET sześciu typów, tymi samymi słowami co panel.
 *
 * Napisy są przepisane z `admin/src/screens/flags/flagTypes.ts` (pole `short`) i to nie
 * jest kosmetyka: pilot dzwoni do administratora, żeby zapytać o uwagę, którą zobaczył
 * w Ustawieniach. Jeśli telefon mówi „nakładka czasowa", a panel „pilot rzekomo na dwóch
 * maszynach naraz", rozmawiają o dwóch różnych rzeczach. Kopia zamiast importu, bo
 * warstwa UI telefonu nie ma prawa importować z klienta panelu - pilnuje tego
 * `Record<FlagType, …>` niżej: dopisanie siódmego typu w domenie WYWALA KOMPILACJĘ
 * tego pliku.
 *
 * Do 2026-08-08 katalog znał trzy typy, w tym `session_overlap` skasowany w etapie D4 -
 * pilot widział więc surowe `aircraft_overlap` i `fuel_mismatch`, a jedyna „ładna" nazwa
 * opisywała flagę, której serwer już nie wystawia. Nieznany typ nadal wraca surowy:
 * techniczny kod jest lepszy od zgadywanej etykiety.
 */
const FLAG_LABELS: Record<FlagType, string> = {
  aircraft_overlap: 'dwa telefony piszą do jednej maszyny',
  pilot_overlap: 'pilot rzekomo na dwóch maszynach naraz',
  mh_gap: 'dziura w łańcuchu MH',
  mh_regression: 'licznik się cofnął',
  fuel_mismatch: 'paliwo poza tolerancją',
  clock_drift: 'zegar telefonu przestawiony',
};

export function flagLabel(type: string): string {
  return FLAG_LABELS[type as FlagType] ?? type;
}

/**
 * Wiersz „Uwagi serwera" w Ustawieniach - trzy stany, bo trzy różne rzeczy.
 *
 * Cisza nie może znaczyć dwóch rzeczy naraz (§6 pkt 2): „serwer nic nie zgłasza" i
 * „serwer jeszcze nic nie widział" to zupełnie inne wiadomości dla pilota, który
 * właśnie zastanawia się, czy dzwonić do administratora. Flagi przychodzą w odpowiedzi
 * na wysyłkę, więc bez ani jednej udanej wysyłki nie wiemy NIC - i tak to nazywamy.
 */
export function serverNoticeLabel(count: number, everSynced: boolean): string {
  if (!everSynced) return 'jeszcze nie sprawdzone';
  return count === 0 ? 'brak uwag' : `${count}`;
}
