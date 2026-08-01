/**
 * UZ Aero — panel: WIERSZ DZIENNIKA AUDYTU, DTO → treść komórek (moduł CZYSTY).
 *
 * Porządek listy jest własnością SERWERA (`created_at DESC, id DESC` pod indeksem
 * `idx_audit_created`) — ta funkcja MAPUJE i nie sortuje. Lista jest przycinana
 * kursorem po stronie bazy, więc przesortowanie tego, co przyszło, przestawiłoby
 * wiersze wewnątrz przypadkowego wycinka.
 *
 * ══ CO TU JEST NAJWAŻNIEJSZE ══
 * Nie plakietki, tylko UCZCIWOŚĆ WOBEC BRAKÓW. Wpis, którego konta już nie ma, wpis
 * z kodem akcji spoza katalogu i wpis bez adresu IP muszą zostać na liście widoczne
 * i opisane. Każde „—" w tym pliku ma obok siebie zdanie, co ono znaczy — bo dziennik
 * nadzoru odpowiada na pytanie „kto to ruszał", a milcząca kreska nie jest odpowiedzią.
 */

import type { AuditEntryDto } from '../../api/dto';
import { dateUtcShort, timeUtcSeconds } from '@uzaero/format';

import { actionView, type ActionView } from './audytActions';
import { detailRows, type DetailRow } from './audytDetails';

export interface AuditRow {
  id: number;
  /** Czas UTC z SEKUNDAMI — w rejestrze różnica sekund rozstrzyga kolejność zmian. */
  when: { text: string; sub: string };
  actor: {
    /** Nazwisko z `pilots`; przy koncie nieistniejącym — sam identyfikator. */
    name: string;
    /** Rola z chwili akcji + identyfikator konta, gdy nazwisko go nie zawiera. */
    sub: string;
    /** Identyfikator do zawężenia listy „tylko to konto". */
    pilotId: string;
    /** `true` = konta nie ma już w `pilots`; wiersz zostaje, ale mówi o tym wprost. */
    missing: boolean;
  };
  action: ActionView;
  target: {
    /** Identyfikator obiektu albo „—", gdy akcja nie dotyczy pojedynczego bytu. */
    text: string;
    /** Typ obiektu (`flag`, `event`, …) — druga linia komórki. */
    sub: string;
    /** Wypełnione, gdy da się zawęzić dziennik do tego obiektu. */
    link: { targetType: string; targetId: string } | null;
  };
  details: DetailRow[];
  /** Adres albo „—" z podpisem: akcja spoza żądania HTTP, nie brak danych. */
  ip: { text: string; offline: boolean };
}

/**
 * Skrócenie UUID-a do rozpoznania wiersza (`4c88…9a01`). Pełna wartość zostaje
 * w kolumnie „Szczegóły" i w adresie po kliknięciu — tu chodzi o szerokość kolumny,
 * a nie o ukrycie danych. Napisy krótkie (id flagi, rejestracja, kod pilota) zostają
 * w całości, bo skrócenie ich niczego nie oszczędza, a zabiera znaczenie.
 */
export function shortTarget(value: string): string {
  return value.length > 16 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
}

export function auditRows(items: readonly AuditEntryDto[]): AuditRow[] {
  return items.map((entry) => {
    const at = Date.parse(entry.createdAt);
    const missing = entry.actorName == null;

    return {
      id: entry.id,
      when: {
        text: Number.isNaN(at) ? '—' : `${dateUtcShort(at)} ${timeUtcSeconds(at)}`,
        sub: `#${entry.id}`,
      },
      actor: {
        name: entry.actorName ?? entry.actorPilotId,
        sub: missing
          ? `${entry.actorRole} · konta nie ma już w rejestrze`
          : `${entry.actorRole} · ${entry.actorCode ?? entry.actorPilotId}`,
        pilotId: entry.actorPilotId,
        missing,
      },
      action: actionView(entry.action),
      target: {
        text: entry.targetId == null ? '—' : shortTarget(entry.targetId),
        sub:
          entry.targetType ??
          // Akcje konserwacyjne działają na całym systemie, nie na jednym bycie —
          // to nie jest brak danych i nie wolno tego zapisać jako „nieznany obiekt".
          'operacja bez pojedynczego obiektu',
        link:
          entry.targetType != null && entry.targetId != null
            ? { targetType: entry.targetType, targetId: entry.targetId }
            : null,
      },
      details: detailRows(entry.details),
      ip: {
        text: entry.ip ?? '—',
        offline: entry.ip == null,
      },
    };
  });
}
