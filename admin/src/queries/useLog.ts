/**
 * UZ Aero - panel 2.0: dziennik - trzy poziomy jako trzy zapytania.
 *
 * Wszystkie są ODCZYTEM, więc nie ma tu ani jednej mutacji i ani jednego unieważnienia:
 * dziennik czyta się po fakcie, a jedyne, co go zmienia, to nowa paczka zdarzeń
 * z telefonu - o której panel i tak dowiaduje się dopiero przy następnym pytaniu.
 */

import { useQuery } from '@tanstack/react-query';

import type {
  LogReportDto,
  SessionDetailDto,
  SessionPageDto,
  SessionTrackDto,
} from '../api/dto';
import {
  listSessions,
  loadLog,
  loadSession,
  loadSessionTrack,
  type LogRangeQuery,
  type SessionListQuery,
} from '../api/log';
import { keys } from './keys';

/**
 * Górna granica gridu poziomu 2.
 *
 * Nie jest stronicowaniem, tylko bezpiecznikiem: zakres wybiera człowiek, a klub nie
 * robi dwustu sesji jedną maszyną w miesiącu. Gdy odpowiedź niesie `nextCursor`,
 * ekran mówi wprost, że lista jest przycięta.
 */
export const SESSION_LIST_LIMIT = 200;

/** Poziom 1: cała flota w zakresie dat. */
export function useLogFleet(range: LogRangeQuery) {
  return useQuery<LogReportDto>({
    queryKey: keys.log.fleet(range),
    queryFn: () => loadLog(range),
  });
}

/** Poziom 2: sesje jednej maszyny. `aircraftId` pusty = ekran jeszcze nie wie, której. */
export function useAircraftSessions(query: Omit<SessionListQuery, 'limit'>) {
  const full: SessionListQuery = { ...query, limit: SESSION_LIST_LIMIT };
  return useQuery<SessionPageDto>({
    queryKey: keys.log.sessions(full),
    queryFn: () => listSessions(full),
    enabled: query.aircraftId !== '',
  });
}

/** Poziom 3: jedna sesja - stan z projekcji i surowa oś zdarzeń. */
export function useSessionDetail(uuid: string | undefined) {
  return useQuery<SessionDetailDto>({
    queryKey: keys.log.session(uuid ?? ''),
    queryFn: () => loadSession(uuid as string),
    enabled: uuid != null && uuid !== '',
  });
}

/**
 * Ślad sesji - osobne zapytanie od karty, więc mapa dociąga się pod gotowym ekranem
 * zamiast opóźniać jego pierwsze wyświetlenie.
 *
 * `staleTime: Infinity`, bo nagranie jest zamknięte: telefon oddaje je raz i kasuje
 * swoją kopię. Zmienić może się wyłącznie okno biegu silnika po korekcie
 * administratora - a wtedy przeładowuje się cały ekran sesji.
 */
export function useSessionTrack(uuid: string | undefined) {
  return useQuery<SessionTrackDto>({
    queryKey: keys.log.track(uuid ?? ''),
    queryFn: () => loadSessionTrack(uuid as string),
    enabled: uuid != null && uuid !== '',
    staleTime: Infinity,
  });
}
