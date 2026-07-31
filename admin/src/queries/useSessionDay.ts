/**
 * UZ Aero — panel: odczyt KARTY jednego dnia (`A02a`).
 *
 * Osobny plik od `useSessions.ts`, bo to inne zapytanie o innym rytmie: lista jest
 * stronicowana kursorem i odświeżana filtrem, karta dnia jest pojedynczym zasobem
 * pod własnym adresem (`#/dni/<uuid>`), otwieranym z linku wklejonego w rozmowie.
 *
 * Karta jest JEDYNYM miejscem, w którym serwer woła `projectSession` na żądanie —
 * i dlatego jedynym, z którego panel dostaje pełny `SessionState`. Wszystko, co ekran
 * z nim robi, to formatowanie (`screens/dzien/*.ts`).
 */

import { useQuery } from '@tanstack/react-query';

import type { SessionDetailDto } from '../api/dto';
import { getSession } from '../api/sessions';
import { keys } from './keys';

export function useSessionDay(sessionUuid: string) {
  return useQuery<SessionDetailDto>({
    queryKey: keys.sessions.detail(sessionUuid),
    queryFn: () => getSession(sessionUuid),
    // Adres bez uuid-a nie jest stanem do pobrania, tylko błędem trasy — pytanie
    // o pustą sesję zwracałoby 404 i zaśmiecało logi serwera.
    enabled: sessionUuid !== '',
  });
}
