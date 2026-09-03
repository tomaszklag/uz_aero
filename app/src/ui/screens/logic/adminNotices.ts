/**
 * UZ Aero - KOMUNIKAT O OPERACJI ZAKOŃCZONEJ PRZEZ ADMINISTRATORA (issue #81) - warstwa czysta.
 *
 * ══ PO CO ══
 * Administrator zakończył albo unieważnił z panelu operację, którą prowadził TEN
 * telefon. Decyzja przyszła dosyłką (§4.9), kokpit z niej zszedł, a zaległe zapisy
 * zostały wstrzymane. Pilot ma się o tym dowiedzieć na ekranie domowym - kto, kiedy,
 * dlaczego i co się stało z jego zapisami - a nie zgadywać, czemu nagle stoi na 01.
 *
 * ══ Z CZEGO SIĘ LICZY ══
 * Z lokalnego rejestru (§6 pkt 1), nie z osobnej skrzynki: operacja zakończona przez
 * panel nosi `closedByAdmin`, unieważniona - `voidedByAdmin`, a liczbę wstrzymanych
 * zapisów zna zapytanie historii. Komunikat znika, gdy pilot go POTWIERDZI - zbiór
 * potwierdzonych operacji trzyma `session_meta` (`ADMIN_NOTICES_META_ACKED`); operacja
 * unieważniona nie ma innego śladu na ekranie (wypada z list), więc bez tej pamięci
 * albo świeciłaby na zawsze, albo pilot nigdy by jej nie zobaczył.
 *
 * Operacje sprzed issue #81 (unieważnienie bez `source`) komunikatu nie dostają -
 * telefon nie ma jak odróżnić ich od własnego wycofania.
 */

import { dateTimeUtcShort, plural } from '../../format';
import type { HistoryDay } from '../../../application';

/** Klucz `session_meta`: JSON z tablicą uuidów operacji, których komunikat pilot potwierdził. */
export const ADMIN_NOTICES_META_ACKED = 'admin.notices.acked';

export interface AdminNotice {
  sessionUuid: string;
  aircraftId: string | null;
  /** `closed` = zakończenie administracyjne (liczy się dalej); `voided` = unieważnienie. */
  kind: 'closed' | 'voided';
  /** Chwila decyzji administratora (UTC). */
  at: number;
  /** Powód z panelu; `null` = nie podano (panel go wymaga, ale rejestr tego nie wymusza). */
  reason: string | null;
  /** Ile zapisów tego telefonu do tej operacji wstrzymano - nie wyjdą na serwer. */
  withheldCount: number;
}

/**
 * Komunikaty do pokazania - od najnowszej decyzji. Unieważnienie wygrywa z zakończeniem
 * (jest dalej idące), a operacja potwierdzona przez pilota nie wraca.
 */
export function buildAdminNotices(
  days: readonly HistoryDay[],
  acked: ReadonlySet<string>,
): AdminNotice[] {
  const notices: AdminNotice[] = [];
  for (const day of days) {
    const { state } = day;
    if (state.sessionUuid == null || acked.has(state.sessionUuid)) continue;
    if (state.voidedByAdmin) {
      notices.push({
        sessionUuid: state.sessionUuid,
        aircraftId: state.aircraftId,
        kind: 'voided',
        at: state.voidedAt ?? 0,
        reason: state.voidReason,
        withheldCount: day.withheldCount,
      });
    } else if (state.closedByAdmin) {
      notices.push({
        sessionUuid: state.sessionUuid,
        aircraftId: state.aircraftId,
        kind: 'closed',
        at: state.closedAt ?? 0,
        reason: state.adminCloseReason,
        withheldCount: day.withheldCount,
      });
    }
  }
  return notices.sort((a, b) => b.at - a.at);
}

/** Zbiór potwierdzonych z zapisu w `session_meta`; uszkodzony wpis = pusty zbiór. */
export function parseAcked(raw: string | null): Set<string> {
  if (raw == null) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

export function serializeAcked(acked: ReadonlySet<string>): string {
  return JSON.stringify([...acked]);
}

export interface AdminNoticeText {
  title: string;
  text: string;
}

/**
 * Treść banera: KTÓRA operacja (sygnatura, a bez niej znak i data), KIEDY zdecydowano,
 * DLACZEGO i co z zapisami telefonu. Zdanie o wstrzymanych zapisach pojawia się TYLKO,
 * gdy jakieś są - „0 zapisów nie wyszło" niczego by nie odróżniało.
 */
export function adminNoticeText(
  notice: AdminNotice,
  regOf: (aircraftId: string) => string | null,
  signatureOf: (sessionUuid: string) => string | null,
): AdminNoticeText {
  const signature = signatureOf(notice.sessionUuid);
  const reg = notice.aircraftId == null ? null : regOf(notice.aircraftId);
  const when = `${dateTimeUtcShort(notice.at)} UTC`;
  const which = signature ?? (reg == null ? when : `${reg} · ${when}`);

  const lines = [signature == null ? which : `${which} · ${when}`];
  if (notice.reason != null && notice.reason.trim() !== '') lines.push(`Powód: ${notice.reason}`);
  lines.push(
    notice.kind === 'voided'
      ? 'Wpis nie liczy się do Twojego nalotu ani do sum dnia.'
      : 'Operacja liczy się dalej, ale bez odczytów końcowych - poprawek już nie naniesiesz.',
  );
  if (notice.withheldCount > 0) {
    lines.push(
      `${notice.withheldCount} ${plural(notice.withheldCount, 'zapis', 'zapisy', 'zapisów')} z tego telefonu do tej operacji nie ${notice.withheldCount === 1 ? 'wyjdzie' : 'wyjdą'} na serwer.`,
    );
  }

  return {
    title:
      notice.kind === 'voided'
        ? 'Operację unieważnił administrator'
        : 'Operację zakończył administrator',
    text: lines.join('\n'),
  };
}
