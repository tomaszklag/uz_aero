/**
 * Ninerdeck - panel 3.2: statystyki zakresu - jedno zapytanie, trzy przekroje.
 *
 * ODCZYT bez ani jednej mutacji: statystyki czyta się po fakcie, a jedyne, co je zmienia,
 * to nowa paczka zdarzeń z telefonu (albo korekta w dzienniku - ta unieważnia korzeń
 * dziennika, nie ten; zakres statystyk i tak pyta się na nowo przy wejściu na ekran).
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { StatsReportDto } from '../api/dto';
import { loadStats, type StatsQuery } from '../api/stats';
import { keys } from './keys';

/**
 * Poprzednia odpowiedź zostaje na ekranie, dopóki nie przyjdzie nowa: przełączenie
 * chipa „Ten miesiąc" → „Poprzedni miesiąc" ma podmienić liczby, a nie zgasić tabele
 * na czas żądania.
 */
export function useStats(query: StatsQuery) {
  return useQuery<StatsReportDto>({
    queryKey: keys.stats(query),
    queryFn: () => loadStats(query),
    placeholderData: keepPreviousData,
  });
}
