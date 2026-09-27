/**
 * Ninerdeck - panel 2.0: dziennik - trzy poziomy jako trzy zapytania.
 *
 * Wszystkie są ODCZYTEM, więc nie ma tu ani jednej mutacji i ani jednego unieważnienia:
 * dziennik czyta się po fakcie, a jedyne, co go zmienia, to nowa paczka zdarzeń
 * z telefonu - o której panel i tak dowiaduje się dopiero przy następnym pytaniu.
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type {
  AddedEventDto,
  AddEventPreviewDto,
  CorrectionPreviewDto,
  CorrectionShapeDto,
  LogPilotsReportDto,
  LogReportDto,
  SessionDetailDto,
  SessionPageDto,
  SessionTrackDto,
} from '../api/dto';
import {
  listSessions,
  loadLog,
  loadLogPilots,
  loadSession,
  loadSessionTrack,
  previewAddEvent,
  previewCorrection,
  type LogPilotsQuery,
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

/**
 * Poziom 1, OŚ PILOTÓW (3.2.0): ten sam zakres, drugie pytanie. Rozwinięcie
 * zwiniętych (`idle`) jest częścią klucza, a poprzednia odpowiedź zostaje na ekranie,
 * dopóki nie przyjdzie pełna - lista latających nie ma migać przez jedno kliknięcie.
 */
export function useLogPilots(query: LogPilotsQuery) {
  return useQuery<LogPilotsReportDto>({
    queryKey: keys.log.pilots(query),
    queryFn: () => loadLogPilots(query),
    placeholderData: keepPreviousData,
  });
}

/** Poziom 2: sesje jednej maszyny. `aircraftId` pusty = ekran jeszcze nie wie, której. */
export function useAircraftSessions(query: LogRangeQuery & { aircraftId: string }) {
  const full: SessionListQuery = { ...query, limit: SESSION_LIST_LIMIT };
  return useQuery<SessionPageDto>({
    queryKey: keys.log.sessions(full),
    queryFn: () => listSessions(full),
    enabled: query.aircraftId !== '',
  });
}

/**
 * Poziom 2, OŚ PILOTA (3.2.0): operacje jednej osoby - jako dowódcy I w prawym fotelu,
 * bo filtr serwera dopasowuje oba. `pilotId` pusty = kod z adresu jeszcze nierozwiązany.
 */
export function usePilotSessions(query: LogRangeQuery & { pilotId: string }) {
  const full: SessionListQuery = { ...query, limit: SESSION_LIST_LIMIT };
  return useQuery<SessionPageDto>({
    queryKey: keys.log.sessions(full),
    queryFn: () => listSessions(full),
    enabled: query.pilotId !== '',
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

/**
 * PODGLĄD KOREKTY „przed → po" (3.2.0, §5.2) - ODCZYT, choć jedzie `POST`-em: serwer
 * niczego nie zapisuje, a kształt korekty jest parametrem pytania, nie filtrem listy.
 * `shape: null` = formularz jeszcze nie ma czego pokazać (nic się nie zmieniło).
 * `placeholderData` trzyma poprzednią odpowiedź, żeby karta skutku nie migała przy
 * każdej minucie wpisanej w polu czasu.
 */
export function useCorrectionPreview(uuid: string, shape: CorrectionShapeDto | null) {
  return useQuery<CorrectionPreviewDto>({
    queryKey: keys.log.preview(uuid, shape),
    queryFn: () => previewCorrection(uuid, shape as CorrectionShapeDto),
    enabled: shape != null,
    placeholderData: keepPreviousData,
  });
}

/** Podgląd DOPISANIA (§5.4) - ta sama natura, co podgląd korekty. */
export function useAddEventPreview(uuid: string, event: AddedEventDto | null) {
  return useQuery<AddEventPreviewDto>({
    queryKey: keys.log.preview(uuid, event),
    queryFn: () => previewAddEvent(uuid, event as AddedEventDto),
    enabled: event != null,
    placeholderData: keepPreviousData,
  });
}
