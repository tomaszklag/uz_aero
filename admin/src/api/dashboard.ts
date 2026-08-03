/**
 * UZ Aero — panel: pulpit (`GET /admin/api/dashboard`).
 *
 * Jeden plik = jeden zasób = jeden prefiks trasy, jak `server/src/http/routes/`.
 * Najkrótszy z nich, bo trasa nie ma parametrów: pulpit odpowiada na jedno pytanie
 * („czy coś wymaga mojej uwagi teraz") i nie ma go czym zawęzić — zawężenia mieszkają
 * na ekranach, do których pulpit prowadzi.
 *
 * ══ DLACZEGO JEDNO ŻĄDANIE, A NIE SZEŚĆ ══
 * Kusi, żeby ekran startowy złożyć z gotowych hooków (`useFlags`, `useFleet`,
 * `useExports`…) — ale wtedy każda liczba na kaflu byłaby WŁASNYM zapytaniem
 * o własnym momencie odświeżenia, a pulpit pokazywałby stan złożony z czterech różnych
 * chwil. Do tego `docs/architektura-panelu-frontend.md` §4.3 stanowi, że
 * `['dashboard']` unieważnia KAŻDA mutacja panelu; sześć kluczy do unieważnienia po
 * każdym zapisie to lista, o której ktoś kiedyś zapomni.
 */

import type { DashboardDto } from './dto';
import { apiGet } from './httpClient';

export function getDashboard(): Promise<DashboardDto> {
  return apiGet<DashboardDto>('/dashboard');
}
