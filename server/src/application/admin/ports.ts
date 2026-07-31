/**
 * UZ Aero (serwer) — PORTY warstwy aplikacji dla panelu administracyjnego.
 *
 * Osobny plik od `application/ports.ts`, i to nie dla symetrii: tamten ma docblock
 * mówiący, czym jest — kontraktem powierzchni TELEFONU. Panel jest drugą powierzchnią,
 * o innym zestawie operacji (listy globalne, cykl życia flagi, konta, flota), więc
 * dopisanie ich tam złamałoby cel reguły granulacji: „żeby plik dało się przeczytać
 * w całości". Jeden plik portów na POWIERZCHNIĘ, nie jeden na projekt.
 *
 * Kierunek zależności bez zmian: `application/admin` zna wyłącznie te interfejsy,
 * implementacje (`infrastructure/pg/admin/*`) wstrzykuje composition root.
 */

import type { FlagType } from '@uzaero/domain';

import type { AdminAction } from '../../domain/adminActions.ts';
import type { PilotRole } from '../../domain/roles.ts';
import type { FlagRecord, Queryable } from '../ports.ts';

// ── tożsamość działającego ──────────────────────────────────────────────────────

/**
 * KTO wykonuje akcję panelu. Osobny typ od `Identity` (tożsamość odczytana z tokenu),
 * bo niesie co innego: `Identity` odpowiada na pytanie „czy token jest ważny",
 * a `Actor` — „co wpisać do dziennika audytu". Stąd `ip`, którego w tokenie nie ma
 * i być nie może.
 *
 * `role` jest rolą Z CHWILI AKCJI i tak trafia do `admin_audit`. Role się zmieniają;
 * odczytanie ich później z konta odpowiadałoby na inne pytanie niż „kto miał wtedy
 * prawo to zrobić".
 */
export interface Actor {
  pilotId: string;
  role: PilotRole;
  /** `null` = akcja spoza żądania HTTP (skrypt administracyjny). */
  ip: string | null;
}

// ── dziennik audytu ─────────────────────────────────────────────────────────────

/**
 * Ślad akcji tak, jak opisuje ją KOMENDA: co zrobiono i na czym. Tożsamość, rolę,
 * adres i czas dokłada `AuditedWrite` — komenda nie ma ich skąd wziąć i nie powinna,
 * bo to detale bramy zapisu, nie operacji.
 */
export interface AuditEntry {
  action: AdminAction;
  targetType: string | null;
  targetId: string | null;
  /** Notatka, diff, kontekst decyzji — NIGDY hasło ani hash. */
  details: Record<string, unknown>;
}

/** Kompletny wiersz dziennika: opis akcji + kto, kiedy i skąd. */
export interface AuditRecord extends AuditEntry {
  actorPilotId: string;
  actorRole: PilotRole;
  ip: string | null;
  createdAt: Date;
}

/**
 * Port ma JEDNĄ metodę i to jest jego treść: dziennik audytu jest append-only.
 * Brak `update` i `delete` nie jest przeoczeniem do uzupełnienia — to jedyna
 * gwarancja niezmienności, którą da się dziś wyrazić w kodzie (docelowo dokłada się
 * do niej `GRANT` bez `UPDATE`/`DELETE`, `docs/architektura-panelu-serwer.md` §11).
 *
 * `tx` jest parametrem, nie polem: wpis MUSI móc pojechać transakcją skutku,
 * który opisuje. Adapter z własnym uchwytem do bazy nie umiałby tego zrobić.
 */
export interface AdminAuditPort {
  append(tx: Queryable, record: AuditRecord): Promise<void>;
}

// ── flagi (cykl życia, panel) ───────────────────────────────────────────────────

/**
 * Flaga widziana przez panel: rekord serwera (`FlagRecord`) plus dane ROZSTRZYGNIĘCIA.
 *
 * Dziedziczenie zamiast czwartej deklaracji kształtu flagi jest tu celowe. Do
 * 2026-07-31 ten sam byt był przepisany ręcznie w czterech miejscach i zgodny ze sobą
 * wyłącznie przez przypadek (`packages/domain/src/flags.ts` powstał, żeby to skończyć).
 * Panel widzi WIĘCEJ niż telefon, nie coś innego — i tak to zapisujemy.
 */
export interface AdminFlag extends FlagRecord {
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

/** Skutek zamknięcia flagi: tyle, ile trzeba, żeby zdecydować o re-eksporcie. */
export interface ResolvedFlag {
  type: FlagType;
  sessionUuids: string[];
}

/**
 * Port CYKLU ŻYCIA flagi — nowy, a nie rozszerzenie `FlagsPort`.
 *
 * `FlagsPort` jest portem ścieżki INGESTU (`ensureOpen` + `openFor*`), wołanym
 * w gorącej transakcji przyjęcia paczki zdarzeń. Panel potrzebuje czegoś innego
 * i w innym rytmie. Projekt ma na to precedens i uzasadnienie: `SheetsReadPort` jest
 * osobny od `SheetsPort`, a `PilotPrefsPort` od `PilotsPort` — osobny port wtedy, gdy
 * inny jest POWÓD istnienia. Korzyść uboczna: `infrastructure/pg/flagsRepo.ts`
 * zostaje nietknięty, więc ścieżka ingestu nie ma jak zregresować.
 */
export interface FlagsAdminPort {
  byId(db: Queryable, id: number): Promise<AdminFlag | null>;
  /**
   * Zamknięcie flagi z OPTYMISTYCZNĄ współbieżnością: warunek `status='open'` siedzi
   * w SQL-u, więc dwie osoby klikające „Rozwiąż i odblokuj kartę" nie prześcigną się
   * timingiem — druga dostaje `null` i trasa odpowiada 409 z aktualnym stanem flagi.
   * Blokad pesymistycznych przy dwóch użytkownikach nie wprowadzamy.
   */
  resolve(
    tx: Queryable,
    id: number,
    by: string,
    note: string,
    at: Date,
  ): Promise<ResolvedFlag | null>;
}
