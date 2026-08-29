/**
 * UZ Aero (serwer) - trasa pulpitu (`GET /admin/api/dashboard`, mockupy `A01`/`A01a`).
 *
 * Najcieńsza trasa panelu: bez parametrów, bez zoda, bez wariantów. Pulpit odpowiada
 * na jedno pytanie („czy coś wymaga mojej uwagi teraz") i nie ma go czym zawęzić -
 * zawężenia mieszkają na ekranach, do których pulpit prowadzi.
 *
 * ══ ZDOLNOŚĆ: `panel.access` I ANI JEDNEJ WIĘCEJ ══
 * Pulpit jest ekranem STARTOWYM - każdy, kto ma wejście do panelu, ląduje tu pierwszy.
 * Odmowa na tej trasie znaczyłaby „zalogowałeś się na pustkę", więc wymóg jest ten sam,
 * co przy wydaniu sesji. Szef wyszkolenia widzi całą jej treść: flagi (rozstrzyga je),
 * flotę i dni (czyta na `A07`/`A02`) oraz monitor eksportu (`GET /exports` też wymaga
 * `panel.access`). Nie ma tu ani jednej liczby, której nie zobaczyłby na ekranie
 * docelowym - a gdyby była, pulpit rozszczepiłby się na dwa i przestał być jedną
 * odpowiedzią na jedno pytanie.
 *
 * Zablokowane pozostają PRZEJŚCIA, nie liczby: kafel prowadzący tam, gdzie jego rola
 * nie sięga, panel pokazuje wyszarzony z powodem (reguła „nigdy nie ukrywamy").
 *
 * ══ DLACZEGO TU NIE MA ŻADNEJ MUTACJI ══
 * Pulpit jest wyłącznie do odczytu i to jest własność, nie brak funkcji. Przycisk
 * „Odśwież" z mockupu odświeża zapytanie po stronie klienta (`refetch`), a nie stan
 * serwera - nazwanie go komendą wprowadziłoby do panelu operację bez skutku i bez
 * śladu w dzienniku audytu.
 */

import type { FastifyInstance } from 'fastify';

import type { AdminDashboardQueries } from '../../../application/admin/queries/dashboard.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';

export function registerAdminDashboardRoutes(
  app: FastifyInstance,
  queries: AdminDashboardQueries,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/dashboard', capability: 'panel.access' },
    async (_req, reply) => reply.send(await queries.load()),
  );
}
