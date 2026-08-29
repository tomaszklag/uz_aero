/**
 * UZ Aero - panel: KTÓRE konto pokazuje szuflada `A06a` (moduł CZYSTY).
 *
 * ══ PROBLEM, KTÓRY TEN MODUŁ ROZWIĄZUJE ══
 * Szuflada bierze wiersz z LISTY, a lista jest zawężona filtrem i wyszukiwaniem -
 * i to samo zawężenie potrafi wyrzucić wiersz spod siebie w reakcji na mutację, którą
 * administrator właśnie wykonał. Trzy skutki, wszystkie zdarzały się przed 2026-08-01:
 *
 *  • wygenerowane hasło ZNIKA, bo po zmianie danych konto wypada spod chipa i szuflada
 *    przełącza się na stan „tego konta nie ma w bieżącym zawężeniu" - a hasło jest
 *    pokazywane RAZ i nie ma trasy „pokaż ponownie";
 *  • potwierdzenie akcji nieodwracalnej (deaktywacja) zamienia się w komunikat
 *    o filtrze, więc człowiek nie wie, czy operacja się udała;
 *  • przy chipie „Aktywni" deaktywacja z definicji wyrzuca wiersz z listy, czyli
 *    najczęstsza ścieżka jest jednocześnie tą, która gubi potwierdzenie.
 *
 * Stąd reguła: **wiersz listy jest źródłem prawdy, dopóki na liście jest; gdy zniknie,
 * szuflada pokazuje SKUTEK ostatniej udanej mutacji.** Nie odwrotnie - lista po
 * unieważnieniu wraca świeża, a skutek mutacji z czasem się starzeje.
 *
 * Konta z mutacji nie da się „zapamiętać na zawsze": kolejność ma znaczenie, bo dwie
 * różne mutacje (zmiana tożsamości, deaktywacja) oddają dwa różne stany tego samego
 * konta. Dlatego skutek niesie CHWILĘ i wygrywa najświeższy.
 */

import type { PilotListItemDto } from '../../api/dto';

/** Skutek udanej mutacji: konto po zmianie + chwila, w której serwer odpowiedział. */
export interface AccountEffect {
  pilot: PilotListItemDto;
  /** Znacznik czasu z klienta mutacji (`submittedAt`) - służy WYŁĄCZNIE do kolejności. */
  at: number;
}

/**
 * Konto, które szuflada ma narysować. `null` = nie ma czego pokazać (głęboki link do
 * konta spoza zawężenia, jeszcze bez żadnej mutacji) - wtedy szuflada tłumaczy filtr.
 */
export function drawerAccount(
  fromList: PilotListItemDto | null,
  effects: readonly (AccountEffect | null)[],
): PilotListItemDto | null {
  if (fromList != null) return fromList;
  return latestEffect(effects)?.pilot ?? null;
}

/**
 * Najświeższy skutek. `>=` zamiast `>` przy równych znacznikach jest tu świadome:
 * dwie mutacje w tej samej milisekundzie rozstrzyga kolejność argumentów, a ta jest
 * kolejnością deklaracji w szufladzie - czyli czymś, co widać w kodzie, a nie losem.
 */
export function latestEffect(
  effects: readonly (AccountEffect | null)[],
): AccountEffect | null {
  let best: AccountEffect | null = null;
  for (const effect of effects) {
    if (effect == null) continue;
    if (best == null || effect.at >= best.at) best = effect;
  }
  return best;
}
