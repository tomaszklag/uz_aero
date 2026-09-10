/**
 * UZ Aero - panel: kod klubu (`/admin/api/club-code*`).
 *
 * Trzy trasy, bo trzy pytania: jaki kod obowiązuje, nowy kod, koniec dołączania kodem.
 *
 * ══ KLUB BIERZE SIĘ Z SESJI, NIE Z ADRESU ══
 * Dlatego w adresie nie ma identyfikatora klubu: panel klubu prowadzi SWÓJ kod i tylko
 * swój. Kod innego klubu czyta wyłącznie moduł Organizacje - i też tylko do odczytu.
 *
 * ══ DLACZEGO `POST`, A NIE `PATCH` Z WARTOSCIA ══
 * Bo kodu nie da się wpisać z ręki, tylko wylosować: klub dobierający sobie kody
 * wybierałby łatwe do zgadnięcia, a dwa kluby zderzałyby się o ten sam napis. Żądanie
 * nie ma więc ciała, a trasa jest CZYNNOŚCIĄ, nie zmianą pola.
 */

import type { ClubCodeDto } from './dto';
import { apiGet, apiPost } from './httpClient';

export function getClubCode(): Promise<ClubCodeDto> {
  return apiGet<ClubCodeDto>('/club-code');
}

/** Nowy kod. Stary przestaje działać od razu; złożonych zgłoszeń to NIE rusza. */
export function rotateClubCode(): Promise<ClubCodeDto> {
  return apiPost<ClubCodeDto>('/club-code/rotate');
}

/** Koniec dołączania kodem - kasuje kod. Do czasu nowego nikt nie dołączy do klubu. */
export function disableClubCode(): Promise<ClubCodeDto> {
  return apiPost<ClubCodeDto>('/club-code/disable');
}
