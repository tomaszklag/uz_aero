/**
 * UZ Aero (serwer) - nakładka CZASU PILOTA (§4.7, decyzja 2026-08-07).
 *
 * Druga połowa rozdzielonego `session_overlap`. Pierwsza (`aircraft_overlap`) pyta, kto
 * pisze do MASZYNY, i mieszka w `mhChain.ts`, bo porządkuje ją licznik motogodzin. Ta
 * pyta, co robi PILOT - a jego sesje idą w poprzek maszyn, więc nie mają wspólnego
 * licznika i nie da się ich uporządkować łańcuchem. Jedyną osią jest tu czas.
 *
 * ══ CO JEST NAKŁADKĄ, A CO NIĄ NIE JEST ══
 * Po §3.6a pilot legalnie zdaje jedną maszynę i bierze drugą **co do minuty** - dzień
 * pilota to lista sesji na kilku samolotach i to jest normalny przebieg, nie anomalia. Dlatego
 * granice traktujemy jako **domknięte od lewej, otwarte od prawej**: sesja kończąca się
 * o 11:20 i następna zaczynająca się o 11:20 NIE nachodzą na siebie. Nakładką jest
 * dopiero wspólny odcinek o niezerowej długości, czyli sytuacja, w której rejestr
 * twierdzi, że jeden człowiek prowadził dwie maszyny jednocześnie.
 *
 * ══ SESJA OTWARTA ══
 * Nie ma końca, więc jej odcinek jest półprostą. Dwie otwarte sesje jednego pilota
 * nachodzą na siebie ZAWSZE (obie trwają „do teraz") - i słusznie: to najczęstsza
 * postać tej wady, bo bierze się z zapomnianego zdania samolotu.
 *
 * Czysta funkcja: wejściem odcinki, wyjściem wykryte pary. Zapis, dedupe i cykl życia
 * flag należą do warstwy aplikacji - tak samo jak przy `chainFlags`.
 */

import type { FlagType } from '@uzaero/domain';

/** Odcinek zajętości: od przejęcia maszyny do jej zdania. */
export interface PilotSpan {
  sessionUuid: string;
  aircraftId: string;
  /** Czas `session_claim`; `null` = rejestr niekompletny - taka sesja wypada z analizy. */
  claimedAt: number | null;
  /** Czas `day_close`; `null` = sesja nadal otwarta (odcinek bez końca). */
  closedAt: number | null;
}

export interface PilotOverlapFlag {
  type: Extract<FlagType, 'pilot_overlap'>;
  /**
   * Para sesji POSORTOWANA ALFABETYCZNIE - zbiór kanoniczny dla `uq_flags_type_sessions`
   * (migracja bazowa). Kolejność w tej tablicy nie niesie żadnej informacji o czasie
   * i nie wolno jej tak czytać: patrz `laterSessionUuid`.
   */
  sessionUuids: string[];
  /**
   * Sesja przejęta PÓŹNIEJ - czyli ta maszyna, którą pilot wziął, nie zdawszy poprzedniej.
   *
   * Pole istnieje, bo `flags.aircraft_id` jest jedno, a wołający musi wiedzieć, KTÓRĄ
   * z dwóch maszyn opisać. Do 2026-08-08 ingest brał `sessionUuids[1]` i przypinał flagę
   * do samolotu o alfabetycznie późniejszym identyfikatorze - porządek, który z czasem
   * nie ma nic wspólnego. Wadę ujawniły dopiero dane demo z prawdziwymi uuid-ami; komplet
   * testów jej nie widział, bo każdy fixture nazywał sesje `a`, `b`, `c`.
   */
  laterSessionUuid: string;
  details: Record<string, number | string>;
}

/**
 * Pary sesji jednego pilota, które nachodzą na siebie w czasie.
 *
 * @param spans sesje JEDNEGO pilota - wołający filtruje po `pic_id`, bo to on wie,
 *   czyj grafik sprawdza. Kolejność wejścia dowolna.
 */
export function pilotOverlapFlags(spans: readonly PilotSpan[]): PilotOverlapFlag[] {
  // Sesja bez chwili przejęcia nie ma odcinka, więc nie ma jak stwierdzić nakładki.
  // Milczymy o niej tutaj - jej patologię (niekompletny strumień) widzi osobny licznik.
  const dated = spans
    .filter((s): s is PilotSpan & { claimedAt: number } => s.claimedAt != null)
    .sort((a, b) => a.claimedAt - b.claimedAt);

  const flags: PilotOverlapFlag[] = [];

  for (let i = 0; i < dated.length; i += 1) {
    for (let j = i + 1; j < dated.length; j += 1) {
      const first = dated[i]!;
      const second = dated[j]!;

      // Ta sama maszyna to nie jest nakładka GRAFIKU - pilot nie lata dwoma samolotami,
      // tylko dwa razy tym samym. Ten przypadek należy do `aircraft_overlap`, a podwójne
      // flagowanie kazałoby administratorowi rozstrzygać jedną rzecz dwa razy.
      if (first.aircraftId === second.aircraftId) continue;

      const firstEnd = first.closedAt;
      // Odcinki są posortowane po starcie, więc nakładka istnieje dokładnie wtedy, gdy
      // pierwszy nie zdążył się skończyć przed startem drugiego. Równość = zetknięcie.
      if (firstEnd != null && firstEnd <= second.claimedAt) continue;

      flags.push({
        type: 'pilot_overlap',
        sessionUuids: [first.sessionUuid, second.sessionUuid].sort(),
        // Odcinki są posortowane po chwili przejęcia, więc „drugi" znaczy tu późniejszy.
        laterSessionUuid: second.sessionUuid,
        details: {
          aircraft: [first.aircraftId, second.aircraftId].sort().join(' + '),
          from: second.claimedAt,
          // Koniec wspólnego odcinka: wcześniejsze z domknięć, a przy sesji otwartej
          // po prostu go nie ma - i wtedy nakładka trwa nadal.
          ...(firstEnd != null && second.closedAt != null
            ? { to: Math.min(firstEnd, second.closedAt) }
            : {}),
        },
      });
    }
  }

  return flags;
}
