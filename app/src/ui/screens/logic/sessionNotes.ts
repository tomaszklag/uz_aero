/**
 * UZ Aero — NOTATKI SESJI na ekranie 10 (mockup `design/10-statystyki.html`, karta
 * „Notatki"; issue #40 pkt 5).
 *
 * ══ PO CO TO ISTNIEJE ══
 * Pilot pisze o sesji w dwóch miejscach — w kroku „zadanie" (02e, `preflight_confirm.notes`)
 * i przy wpisie ręcznym (08 i 15, `manual_log_entry.notes`) — a do issue #40 ten tekst
 * NIE WRACAŁ do niego nigdzie. Widział go administrator w panelu, autor już nie: po
 * zdaniu samolotu nie dało się sprawdzić, co właściwie zostało zapisane.
 *
 * ══ DLACZEGO OBA ŹRÓDŁA W JEDNEJ LIŚCIE ══
 * Bo dla pilota to jedno pojęcie: „co napisałem o tej sesji". Rozdzielenie ich na dwie
 * karty wymagałoby tłumaczenia różnicy, która jest różnicą MIEJSCA WPISANIA, a nie treści.
 * Podpis wiersza mówi skąd notatka pochodzi, i to wystarczy.
 *
 * ══ PUSTA LISTA ZNACZY „NIC NIE NAPISANO" ══
 * I ekran wtedy karty nie rysuje w ogóle. „Notatki —" byłoby wierszem o niczym; brak
 * notatki nie jest brakiem DANYCH, tylko normalnym stanem większości sesji.
 */

import { applyCorrections } from '../../../domain';
import type { Event, SessionState } from '../../../domain';
import { timeUtc } from '../../format';

/** Jedna notatka: skąd pochodzi, o której powstała i co mówi. */
export interface SessionNote {
  /** Klucz listy — uuid zdarzenia albo `preflight` dla notatki z zadania. */
  id: string;
  /** Podpis wiersza: „Zadanie · 08:04", „Wpis ręczny · 09:12". */
  when: string;
  text: string;
}

/** Czas zdarzenia: GPS ma pierwszeństwo przed zegarem telefonu (§5.1, dwa zegary). */
const at = (e: Event): number => e.gpsTime ?? e.deviceTime;

/**
 * Zbiera notatki sesji w porządku chronologicznym.
 *
 * Notatka z preflightu bierze czas z projekcji (`preflightAt`), a nie ze strumienia:
 * to ta sama chwila, ale projekcja zna ją także wtedy, gdy zdarzenie zostało
 * skorygowane. Kolejność jest chronologiczna, bo notatki czyta się jak resztę tego
 * ekranu — z góry na dół, w czasie sesji.
 *
 * @param projection stan sesji (notatka z zadania i jej czas).
 * @param events surowy strumień sesji — korekty nakładamy tutaj, tak jak na osi czasu.
 */
export function sessionNotes(projection: SessionState, events: Event[]): SessionNote[] {
  const dated: { at: number; note: SessionNote }[] = [];

  const fromTask = trim(projection.notes);
  if (fromTask != null) {
    const when = projection.preflightAt ?? projection.claimedAt;
    dated.push({
      // Notatka z zadania bez stempla w projekcji trafia na sam początek: opisuje CAŁĄ
      // sesję, więc jest jej wstępem, a nie wpisem o nieznanej godzinie.
      at: when ?? Number.NEGATIVE_INFINITY,
      note: { id: 'preflight', when: stamp('Zadanie', when), text: fromTask },
    });
  }

  for (const event of applyCorrections(events)) {
    if (event.type !== 'manual_log_entry') continue;
    const text = trim(event.payload.notes);
    if (text == null) continue;
    dated.push({
      at: at(event),
      note: { id: event.uuid, when: stamp('Wpis ręczny', at(event)), text },
    });
  }

  return dated.sort((a, b) => a.at - b.at).map((entry) => entry.note);
}

/** „Zadanie · 08:04"; bez czasu (sesja bez preflightu w strumieniu) zostaje sam podpis. */
function stamp(label: string, when: number | null): string {
  return when == null ? label : `${label} · ${timeUtc(when)}`;
}

/**
 * Pusty napis to nie notatka. Pole jest wolnym tekstem, więc dochodzą do niego same
 * spacje z klawiatury — a wiersz z pustą treścią wygląda jak utracona dana.
 */
function trim(value: string | null | undefined): string | null {
  const text = value?.trim() ?? '';
  return text.length > 0 ? text : null;
}
