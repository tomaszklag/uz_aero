/**
 * UZ Aero - panel 2.0: liczby pod śladem sesji (moduł CZYSTY).
 *
 * ══ TRZY LICZBY, NIE TRZYNAŚCIE ══
 * Koperta śladu niesie komplet statystyk (prędkości, czasy pięciu faz, jakość trzymania
 * wysokości, liczniki bramki jakości). Panel 2.0 pokazuje z tego TRZY: dystans, pułap
 * i największą prędkość. Reszta to materiał do strojenia progów detekcji, a nie
 * odpowiedź na pytanie, z którym się na ten ekran wchodzi - i to ona zamieniała panel
 * 1.0 w projekt techniczny.
 *
 * Blok, dla którego brakuje danych, po prostu NIE ISTNIEJE. Kreska w miejscu liczby
 * wygląda jak usterka zapisu, a tu znaczy „nagranie tego nie obejmuje".
 */

import { thousands } from '@uzaero/format';

import type { SessionTrackDto } from '../../api/dto';

export interface TrackFact {
  label: string;
  value: string;
}

/** Czy jest cokolwiek do narysowania - jeden warunek dla mapy, profilu i liczb. */
export function hasTrack(track: SessionTrackDto | undefined): track is SessionTrackDto {
  return track != null && track.line.length > 0;
}

export function trackFacts(track: SessionTrackDto): TrackFact[] {
  const facts: TrackFact[] = [{ label: 'Dystans', value: `${track.distanceNm.toFixed(1)} NM` }];

  if (track.maxAltitudeFt != null) {
    facts.push({ label: 'Pułap', value: `${thousands(track.maxAltitudeFt)} ft` });
  }

  const speed = track.stats.speed;
  if (speed != null) {
    facts.push({ label: 'Prędkość maks.', value: `${Math.round(speed.maxGroundSpeedKt)} kt` });
  }

  return facts;
}

/**
 * Powód, dla którego mapy nie ma. Wariantów jest kilka i NIE WOLNO ich zwijać do jednego
 * (issue #47): „brak śladu" pokazane przy locie wpisanym z kartki jest kłamstwem o tym
 * locie. Panel zna dwa z czterech powodów telefonu - pozostałe dwa (`pending-upload`,
 * `offline`) opisują stan URZĄDZENIA, którego przeglądarka nie ma jak znać.
 */
export function noTrackReason(manualEntry: boolean): string {
  return manualEntry
    ? 'Lot wpisany ręcznie - telefon nie nagrywał śladu.'
    : 'Ta sesja nie ma nagrania GPS.';
}
