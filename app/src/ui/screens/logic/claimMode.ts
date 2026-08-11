/**
 * UZ Aero — decyzja o trybie `session_claim` przy przejęciu samolotu (§4.4).
 *
 * §4.4 rozróżnia trzy tryby claimu i to rozróżnienie czyta później serwer przy
 * scalaniu nakładających się sesji:
 *  • `free`             — cache mówił „wolny" (kolizję z kimś, kogo cache nie widział,
 *                         wykryje flaga `aircraft_overlap` — §4.5; do 2026-08-07 jedna
 *                         flaga `session_overlap` udawała tu dwie różne patologie);
 *  • `takeover_online`  — przejęcie ZWERYFIKOWANE: w chwili claimu zapytaliśmy serwer
 *                         i wiemy, czyją sesję przejmujemy (żywy `claimPicId`);
 *  • `takeover_offline` — przejęcie na podstawie cache, który mógł się zdezaktualizować.
 *
 * Zasada uczciwości wobec serwera: `takeover_online` wolno zadeklarować WYŁĄCZNIE
 * z odpowiedzią serwera w ręku. Gdy żywy stan mówi, że samolot jednak jest wolny
 * (poprzednik ZDAŁ SAMOLOT, a cache tego nie widział), przejęcie ZNIKA — claim
 * jest zwykłym `free`, bo nie ma czyjej sesji przejmować. Zdanie maszyny nie kończy
 * dnia poprzednika (§3.6a) — kończy jego sesję z tą maszyną i tylko to nas tu obchodzi.
 */

export type ClaimMode = 'free' | 'takeover_online' | 'takeover_offline';

export interface ClaimDecision {
  mode: ClaimMode;
  /** Kogo przejmujemy — do payloadu `session_claim`; null przy `free`. */
  previousPicId: string | null;
}

/**
 * @param cachePicId aktywny PIC wg cache referencyjnego (stan, który pilot widział na 02)
 * @param live       odpowiedź `GET /aircraft/:id/state` z chwili claimu; null = brak odpowiedzi
 */
export function claimDecision(
  cachePicId: string | null,
  live: { claimPicId: string | null } | null,
): ClaimDecision {
  // Cache mówił „wolny" — nie było czego weryfikować (pilot nie potwierdzał przejęcia).
  if (cachePicId == null) return { mode: 'free', previousPicId: null };

  // Nie udało się spytać — deklarujemy słabszy wariant; zawyżenie do „online" byłoby
  // kłamstwem wobec logiki scalania.
  if (live == null) return { mode: 'takeover_offline', previousPicId: cachePicId };

  // Serwer odpowiedział: przejmujemy DOKŁADNIE tego, kogo wskazał — albo nikogo.
  return live.claimPicId != null
    ? { mode: 'takeover_online', previousPicId: live.claimPicId }
    : { mode: 'free', previousPicId: null };
}
