/**
 * UZ Aero - panel: `QueryClient` i jego ustawienia domyślne.
 *
 * Panel NIE MA globalnego store'u i to jest decyzja, nie przeoczenie
 * (`docs/architektura-panelu-frontend.md` §4.1): aplikacja pilota trzyma Zustanda,
 * bo liczy projekcję dnia lokalnie i musi działać offline. Panel nie robi ani jednego,
 * ani drugiego - serwer jest jedynym źródłem prawdy, więc CAŁY stan panelu to cache
 * odpowiedzi HTTP, czyli dokładnie problem, który Query rozwiązuje.
 */

import { QueryClient } from '@tanstack/react-query';

import { isHttpError } from '../api/httpClient';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Back-office czyta te same dane seriami (lista → szczegół → z powrotem);
        // 30 s wycina burzę żądań, nie zmieniając odczuwalnej świeżości.
        staleTime: 30_000,
        // Karta panelu bywa otwarta cały dzień. Po powrocie do niej chcemy prawdy,
        // a nie stanu sprzed lunchu.
        refetchOnWindowFocus: true,
        // Odpowiedzi 4xx NIE ponawiamy: 403 nie naprawi się samo, a 401 ma
        // doprowadzić do ekranu logowania natychmiast, nie po trzech próbach.
        retry: (attempt, error) => attempt < 2 && !isHttpError(error),
      },
    },
  });
}
