/**
 * Ninerdeck - TOKEN PUSH TEGO URZĄDZENIA (3.1.0, epik R-J; `docs/rezerwacje.md` §12).
 *
 * Adres, pod którym dostawca push dosięga TEJ instalacji aplikacji. Warstwa aplikacji
 * nie wie, skąd się bierze (Expo Push Service nad FCM) ani czemu bywa `null`: brak
 * projektu Firebase w buildzie, brak sieci przy pierwszym pytaniu, Expo Go. Wie
 * wyłącznie, że bez adresu nie ma czego zgłosić serwerowi - i że to nie jest błąd,
 * bo push jest budzikiem, a skrzynka działa bez niego (§12.1).
 */

export interface PushDevicePort {
  /** Token urządzenia albo `null`, gdy tej instalacji nie da się obudzić. */
  token(): Promise<string | null>;
}
