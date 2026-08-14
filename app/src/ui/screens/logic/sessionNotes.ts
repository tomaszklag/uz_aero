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

import { applyCorrections, correctionHistory } from '../../../domain';
import type { Event, SessionState } from '../../../domain';
import { timeUtc } from '../../format';

/** Jedna notatka: skąd pochodzi, o której powstała i co mówi. */
export interface SessionNote {
  /** Klucz listy — uuid zdarzenia albo `preflight` dla notatki z zadania. */
  id: string;
  /**
   * `session` — notatka CAŁEJ sesji (payload preflightu). Jest DOKŁADNIE JEDNA, więc
   * kiedy istnieje, da się ją tylko poprawić — nie dopisać drugiej.
   * `entry` — uwaga przypięta do konkretnego wpisu ręcznego; tych bywa wiele.
   */
  kind: 'session' | 'entry';
  /**
   * Podpis wiersza — „Wpis ręczny · 09:12", czyli DO CZEGO ta uwaga należy.
   *
   * `null` dla notatki sesji: nie ma jej od czego odróżnić (jest jedna), a stempel
   * „Zadanie · 08:04" mówił o godzinie potwierdzenia PREFLIGHTU, nie o notatce —
   * i po pierwszej poprawce zaczynał wprost kłamać, bo tekst zmieniał się bez niego.
   */
  when: string | null;
  text: string;
  /**
   * UUID zdarzenia NIOSĄCEGO tekst — adres korekty `amend` (issue #43).
   *
   * Nie zawsze równy `id`: notatka z zadania ma klucz `preflight`, bo jej treść
   * i czas bierzemy z PROJEKCJI (żyje także wtedy, gdy zdarzenia nie ma w podanym
   * wycinku strumienia), a poprawia się payload `preflight_confirm`.
   * `null` = nie ma czego adresować, więc ołówka przy wierszu nie ma.
   */
  targetUuid: string | null;
  /**
   * Ile razy TREŚĆ tej notatki była poprawiana (issue #43, uwaga z urządzenia).
   *
   * Zero = notatka jest taka, jak ją napisano. Powyżej zera wiersz dostaje plakietkę
   * „popr." — widoczną TAKŻE w trybie odczytu, dokładnie jak przy wierszach osi: to
   * fakt o danych, a nie akcja. Tekst, który ktoś zmienił, nie jest tym, który pilot
   * wpisał, i ma prawo to widzieć bez wchodzenia w edycję.
   *
   * Liczymy WYŁĄCZNIE pole `notes`: `preflight_confirm` niesie obok niej paliwo, licznik
   * i Duala, a poprawka odczytu nie jest poprawką notatki. Ta sama liczba zasila licznik
   * przy „Historii zmian" w arkuszu — jedno źródło, więc plakietka i arkusz nie mają
   * jak powiedzieć czegoś innego.
   */
  changes: number;
}

/** Czas zdarzenia: GPS ma pierwszeństwo przed zegarem telefonu (§5.1, dwa zegary). */
const at = (e: Event): number => e.gpsTime ?? e.deviceTime;

/**
 * Gdzie WPISAĆ notatkę, której jeszcze nie ma (issue #43, zgłoszenie z urządzenia).
 *
 * Karta „Notatki" pojawia się w trybie odczytu tylko wtedy, gdy jest treść (issue #40:
 * „Notatki —" byłoby wierszem o niczym) — i to zostaje. Ale w trybie EDYCJI ta sama
 * reguła odbierała jedyne wejście: sesja bez notatki nie miała karty, więc nie miała jak
 * notatki dostać. Wejście znikało w stanie, w którym jest potrzebne.
 *
 * Adresem jest `preflight_confirm`: to jego payload niesie notatkę sesji, a `amend`
 * poprawia ją tak samo, jak odczyt paliwa obok. `null` = sesja bez preflightu w strumieniu,
 * czyli nie ma czego adresować i ołówka nie ma.
 */
export function noteTargetUuid(events: readonly Event[]): string | null {
  return events.find((e) => e.type === 'preflight_confirm')?.uuid ?? null;
}

/**
 * Czy sesji wolno DOPISAĆ notatkę — czyli czy jeszcze żadnej nie ma.
 *
 * Notatka sesji jest jedna (jedno pole w payloadzie preflightu), więc gdy istnieje,
 * jedyną sensowną czynnością jest jej POPRAWIENIE. Wiersz „Dodaj notatkę do sesji"
 * obok istniejącej notatki obiecywał drugą, a naprawdę nadpisałby pierwszą.
 *
 * Uwagi wpisów ręcznych (`kind: 'entry'`) nie mają z tym nic wspólnego: należą do
 * swoich wpisów i jest ich tyle, ile wpisów.
 */
export function missingSessionNote(notes: readonly SessionNote[]): boolean {
  return !notes.some((note) => note.kind === 'session');
}

/**
 * Ile poprawek dotknęło TREŚCI notatki — patrz `SessionNote.changes`.
 *
 * Historia zmian jest w strumieniu z definicji (rejestr jest append-only), więc nie
 * prowadzimy jej osobno: `correctionHistory` czyta ją z tych samych zdarzeń, z których
 * liczy się reszta ekranu. Filtr po polu jest tu istotą rzeczy — bez niego notatka
 * świeciłaby „popr." po korekcie paliwa, bo obie wartości niesie ten sam preflight.
 */
export function noteChanges(events: readonly Event[], targetUuid: string | null): number {
  if (targetUuid == null) return 0;
  return correctionHistory(events, targetUuid).filter((entry) => entry.field === 'notes').length;
}

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
    const target = noteTargetUuid(events);
    dated.push({
      // Notatka z zadania bez stempla w projekcji trafia na sam początek: opisuje CAŁĄ
      // sesję, więc jest jej wstępem, a nie wpisem o nieznanej godzinie.
      at: when ?? Number.NEGATIVE_INFINITY,
      note: {
        id: 'preflight',
        kind: 'session',
        // Bez stempla — patrz docblock pola `when`.
        when: null,
        text: fromTask,
        targetUuid: target,
        changes: noteChanges(events, target),
      },
    });
  }

  for (const event of applyCorrections(events)) {
    if (event.type !== 'manual_log_entry') continue;
    const text = trim(event.payload.notes);
    if (text == null) continue;
    dated.push({
      at: at(event),
      note: {
        id: event.uuid,
        kind: 'entry',
        when: stamp('Wpis ręczny', at(event)),
        text,
        targetUuid: event.uuid,
        changes: noteChanges(events, event.uuid),
      },
    });
  }

  return dated.sort((a, b) => a.at - b.at).map((entry) => entry.note);
}

/** „Wpis ręczny · 09:12"; bez czasu zostaje sam podpis. Notatka sesji stempla nie ma. */
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
