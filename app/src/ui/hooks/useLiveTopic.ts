/**
 * Ninerdeck - EKRAN PODPINA SIĘ POD KANAŁ KLUBU tematami (4.0.0, `docs/kanal-klubu.md`
 * §3.4, §4, K1; epik KK-C #246).
 *
 * Jedyne, co ekran wie o kanale: „odśwież mnie, gdy zmieni się to, co pokazuję". Żadnych
 * pętli odpytywania (K1) - świeżość przynosi sygnał `changed` (albo wiadomość w skrzynce),
 * a po każdym powitaniu łącza szyna każe dociągnąć stan wszystkim podpiętym, więc ekran
 * w stanie „nie wiem" wraca sam, gdy wróci zasięg.
 *
 * PODPIĘTY JEST TYLKO EKRAN WIDOCZNY: ekran pod spodem stosu albo w nieaktywnej zakładce
 * nie ma komu pokazywać świeżych danych, a po powrocie i tak czyta je od nowa przy wejściu
 * (`useFocusEffect`). Odświeżenie powinno być CICHE (bez szkieletu, `liveRefresh.ts`) -
 * ekran stoi z danymi przed oczami pilota.
 *
 * `topics: null` = nie ma czego słuchać (rezerwacja jeszcze nieznana). Tablica może być
 * nowa przy każdym renderze - podpięcie zmienia się dopiero ze zmianą jej TREŚCI.
 */

import { useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';

import { useLive } from '../bootstrap/servicesContext';

export function useLiveTopic(topics: readonly string[] | null, refresh: () => void): void {
  const live = useLive();
  const focused = useIsFocused();
  const latest = useRef(refresh);

  useEffect(() => {
    latest.current = refresh;
  }, [refresh]);

  // Treść tematów jako klucz - nowa tablica o tych samych tematach nie przepina ekranu.
  const key = topics == null || topics.length === 0 ? null : JSON.stringify(topics);

  useEffect(() => {
    if (live == null || key == null || !focused) return;
    return live.bus.subscribe(JSON.parse(key) as string[], () => latest.current());
  }, [live, key, focused]);
}
