/**
 * UZ Aero - panel: ODCZYT ekranu konserwacji (`A11`).
 *
 * Hooki są cienkie z zasady: decyzja o treści mieszka w czystych modułach
 * `screens/maintenance/*.ts`, a tutaj zostaje wyłącznie to, co dotyczy cache'u.
 *
 * ══ PORÓWNANIE PROJEKCJI NIE ODPALA SIĘ SAMO ══
 * `useProjectionCompare` startuje wyłączone i włącza je człowiek przyciskiem. Powód
 * jest w koszcie operacji: porównanie czyta CAŁY strumień każdej sesji w rejestrze
 * (mockup szacuje ~4 min dla 1291 sesji), więc uruchamianie go przy każdym wejściu na
 * ekran - a `refetchOnWindowFocus` dokładałby po jednym za każdym powrotem do karty
 * przeglądarki - zamieniłoby ekran diagnostyczny w generator obciążenia.
 *
 * Stąd też `staleTime: Infinity` i wyłączone odświeżanie na fokusie: raport ma zostać
 * na ekranie dokładnie taki, jaki wyszedł, dopóki człowiek nie poprosi o nowy. Ekran
 * pokazuje przy nim godzinę pobrania, żeby „przelicz i porównaj" nie było mylone
 * z „tak jest teraz" - stempel bierze się z `dataUpdatedAt` tego zapytania i wypisuje go
 * `runFacts` (`screens/maintenance/rebuildRun.ts`, wiersz „Raport z porównania").
 * Do 2026-08-02 to zdanie było obietnicą bez pokrycia: stempla nie było nigdzie,
 * a przy wyłączonym odświeżaniu akurat tu raport wisi bez terminu ważności.
 *
 * ══ ŻADNA MUTACJA NIE UNIEWAŻNIA TEGO KLUCZA ══
 * Skan uruchamia WYŁĄCZNIE człowiek. Unieważnienie prefiksem `['maintenance']` po
 * nadpisaniu projekcji odpalało go ubocznie (`invalidateQueries` refetchuje zapytania
 * aktywne niezależnie od `staleTime`) i wyrzucało wynik - `useMaintenanceCommands.ts`
 * i jego test pilnują, żeby to nie wróciło.
 */

import { useQuery } from '@tanstack/react-query';

import type { RebuildReportDto, RefreshTokenScanDto, SchemaStateDto } from '../api/dto';
import { compareProjections, getRefreshTokens, getSchemaState } from '../api/maintenance';
import { keys } from './keys';

export function useProjectionCompare(enabled: boolean) {
  return useQuery<RebuildReportDto>({
    queryKey: keys.maintenance.projections,
    queryFn: () => compareProjections(),
    enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/**
 * Stan tabeli refresh tokenów. Zwykłe zapytanie - jedno `COUNT` na małej tabeli, więc
 * pobiera się przy wejściu: karta ma od razu powiedzieć, ile martwych wierszy leży
 * w bazie, zamiast czekać na kliknięcie.
 */
export function useRefreshTokens(enabled = true) {
  return useQuery<RefreshTokenScanDto>({
    queryKey: keys.maintenance.refreshTokens,
    queryFn: () => getRefreshTokens(),
    enabled,
  });
}

/**
 * Stan schematu. `staleTime: Infinity`, bo migracje wprowadza START SERWERA, a nie
 * żadna akcja panelu - odpowiedź nie może zmienić się w trakcie oglądania ekranu.
 */
export function useSchemaState(enabled = true) {
  return useQuery<SchemaStateDto>({
    queryKey: keys.maintenance.schema,
    queryFn: () => getSchemaState(),
    enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
