/**
 * UZ Aero (serwer) - znacznik `events.source_device` dla zapisów PANELU.
 *
 * Rejestr zdarzeń ma jedno pole mówiące, CZYM zdarzenie przyszło, i tylko jedną
 * wartość tego pola, która nie pochodzi z telefonu: `admin:<pilotId>`. Wpisuje ją
 * korekta administratora (`commands/corrections.ts`) - jedyna droga, którą zdarzenie
 * trafia do rejestru spoza aplikacji pilota.
 *
 * **Dlaczego to jest osobny plik, a nie literał w komendzie.** Wartość ma dwóch
 * czytelników po przeciwnych stronach systemu: komenda ją ZAPISUJE, a adapter panelu
 * (`infrastructure/pg/admin/eventsRepo.ts`) po niej ROZPOZNAJE, że korektę wykonał
 * administrator - od tego zależy, czy oś zdarzeń pokazuje przejście do dziennika
 * audytu. Dwa literały w dwóch warstwach rozjechałyby się przy pierwszej zmianie
 * formatu, a rozjazd byłby cichy: link po prostu przestałby się pojawiać.
 *
 * `picId` w rejestrze zostaje PIC-em sesji także przy korekcie administratora
 * (single-writer, atrybucja nalotu) - to jest jedyne miejsce, w którym zapisany jest
 * fakt „to zrobił panel".
 */

/** Prefiks znacznika. Po nim, i tylko po nim, poznaje się zapis z panelu. */
const ADMIN_PREFIX = 'admin:';

/** `source_device` zdarzenia dopisanego przez panel w imieniu konkretnego konta. */
export function adminSourceDevice(pilotId: string): string {
  return `${ADMIN_PREFIX}${pilotId}`;
}

/**
 * Czy zdarzenie o tym `source_device` zapisał PANEL.
 *
 * `null` (kolumna pusta - zdarzenia sprzed wprowadzenia pola) znaczy „nie wiadomo",
 * a nie „panel". Domyślną odpowiedzią jest telefon, bo to on zapisuje wszystko poza
 * jedną komendą.
 */
export function isAdminSourceDevice(sourceDevice: string | null): boolean {
  return sourceDevice != null && sourceDevice.startsWith(ADMIN_PREFIX);
}
