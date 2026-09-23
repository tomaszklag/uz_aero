/**
 * Ninerdeck - panel: HISTORIA DECYZJI na karcie rezerwacji - wiersze karty „Ścieżka
 * akceptacji" w szufladzie zajętości (makieta `kalendarz-wpis` K2a; issue #165, H5).
 *
 * Moduł CZYSTY (bez Reacta).
 *
 * ══ HISTORIA NIESIE OSOBĘ - INACZEJ NIŻ NA TELEFONIE ══
 * Pilot dostaje samą nazwę kroku (§9.4), administrator pyta „kto to rozstrzygnął i do
 * kogo zadzwonić" - więc przy decyzji stoi nazwisko z kodem, rozwiązane z listy członków.
 *
 * ══ ROZSTRZYGNIĘCIE JEST RZECZOWNIKIEM ══
 * „zgoda · Jan Bąk", nie „zatwierdził Jan Bąk": czasownika nie da się odmienić bez
 * znajomości płci, a odmiany nie wyprowadza się regułą (ta sama granica, co przy
 * `originLabel`). Pominięcie („przeszedł sam") odmienia się przez KROK, więc wolno.
 */

import type { ApprovalViewDto } from '../../api/dto';
import type { PillTone } from '../../ui/components';
import { NONE } from '../common/values';
import { stempel, type PersonLookup } from './bookingLabels';

export interface HistoryRow {
  id: string;
  /** „1 · Mechanik" - numer, bo kolejność jest treścią ścieżki. */
  label: string;
  /** „zgoda" / „odmowa" / „przeszedł sam" / „czeka na decyzję" / kreska. */
  value: string;
  tone: 'amber' | 'plain' | 'dim';
  who: { name: string; code: string | null } | null;
  /** Chwila decyzji w strefie klubu; `null` przy kroku bez decyzji. */
  when: string | null;
  /** Powód odmowy albo adnotacja o pominięciu - druga linia. */
  note: string | null;
}

export function historyRows(view: ApprovalViewDto, person: PersonLookup, timezone: string): HistoryRow[] {
  return view.steps.map((step, index) => {
    const label = `${index + 1} · ${step.label}`;
    const d = step.decision;
    if (d == null) {
      // Krok bieżący czeka; krok, do którego sprawa nie doszła (albo już nie dojdzie,
      // bo ktoś odmówił wcześniej), ma kreskę - nie „czeka", bo nie czeka.
      return step.current && view.outcome === 'pending'
        ? { id: step.id, label, value: 'czeka na decyzję', tone: 'amber', who: null, when: null, note: null }
        : { id: step.id, label, value: NONE, tone: 'dim', who: null, when: null, note: null };
    }
    if (d.via === 'self') {
      return {
        id: step.id,
        label,
        value: 'przeszedł sam',
        tone: 'plain',
        who: null,
        when: null,
        note: 'rezerwujący jest na liście kroku',
      };
    }
    const p = person(d.decidedBy);
    return {
      id: step.id,
      label,
      value: d.decision === 'approved' ? 'zgoda' : 'odmowa',
      tone: 'plain',
      who: p == null ? { name: NONE, code: null } : { name: p.name, code: p.code },
      when: stempel(new Date(d.decidedAt), timezone),
      note: d.decision === 'rejected' ? d.reason : null,
    };
  });
}

/**
 * Plakietka w tytule karty. Bursztyn tylko przy sprawie W TOKU; rozstrzygnięta wraca do
 * tonu neutralnego - zieleń znaczy w panelu stan w normie albo akcję główną, a to jest
 * fakt o przeszłości. `null` = klub bez ścieżki, karty nie ma wcale.
 */
export function pathPill(view: ApprovalViewDto): { label: string; tone: PillTone } | null {
  if (view.steps.length === 0) return null;
  if (view.outcome === 'confirmed') return { label: 'Potwierdzona', tone: 'dim' };
  if (view.outcome === 'rejected') return { label: 'Odrzucona', tone: 'dim' };
  const at = view.steps.findIndex((s) => s.current);
  return { label: `Czeka na krok ${at < 0 ? '?' : at + 1} z ${view.steps.length}`, tone: 'amber' };
}

/** Krok, ZA KTÓRY administrator decyduje - tytuł karty decyzji; `null` = nie ma o czym. */
export function currentStepLabel(view: ApprovalViewDto): string | null {
  if (view.outcome !== 'pending') return null;
  return view.steps.find((s) => s.current)?.label ?? null;
}
