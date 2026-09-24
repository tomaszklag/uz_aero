/**
 * Ninerdeck - KLUBY, Z KTÓRYCH LOGOWANO SIĘ NA TYM URZĄDZENIU (2.1.0, §5.1, D10).
 *
 * Powód istnienia jest jeden: **kod pilota jest jedyny W KLUBIE, nie na serwerze.**
 * Sam nie może być więc loginem - „BNO" wskazuje tyle osób, ile jest klubów. E-mail
 * wystarcza sobie, kod pilota potrzebuje klubu, a jedynym miejscem, które ten klub zna
 * PRZED zalogowaniem, jest samo urządzenie: wspólny tablet w samolocie lata dla jednego
 * klubu, a jego piloci wpisują swoje trzy litery.
 *
 * ══ URZĄDZENIE PAMIĘTA KLUBY, NIE OSOBY ══
 * Zapisujemy nazwę i chwilę logowania, nigdy pilota, adresu ani tokenu. Lista jest
 * podpowiedzią dla pola loginu, a nie szczątkiem cudzej sesji - wylogowanie MA czyścić
 * poświadczenia i czyści je, a klub zostaje, bo opisuje SAMOLOT, nie człowieka.
 * Dlatego to zwykły magazyn klucz→wartość, a nie `expo-secure-store`: tam mieszkają
 * sekrety, a tu nie ma czego chronić - i nie ma czego kasować przy zmianie pilota.
 *
 * ══ JEDEN KLUB MILCZY, KILKA DAJE WYBÓR ══
 * Przy jednym znanym klubie ekran 00F nie mówi o nim nic (nie ma czego odróżniać -
 * reguła SyncChipa z issue #12); przy kilku pokazuje pigułkę z nazwą BIEŻĄCEGO i wejście
 * „Zmień klub" na 00I. Stąd `activeId` osobno od listy: to kontekst, w którym rozwiąże
 * się wpisany kod, a nie „ostatni wpis" - pilot może go świadomie przestawić na 00I,
 * zanim się zaloguje.
 */

import type { OrgRef } from './serverPort';

/** Jeden klub znany urządzeniu. `lastLoginAt` = ISO, chwila wydania tokenów TU. */
export interface DeviceClub {
  id: string;
  name: string;
  lastLoginAt: string;
}

/**
 * Stan urządzenia wobec klubów. `activeId` bywa `null` przy pustej liście i jest wtedy
 * normalnym stanem: świeży telefon nikogo jeszcze nie widział, więc kod pilota nie ma
 * się w czym rozwiązać i loginem zostaje sam adres.
 */
export interface DeviceClubsRecord {
  clubs: DeviceClub[];
  activeId: string | null;
}

export interface DeviceClubsPort {
  read(): Promise<DeviceClubsRecord>;
  /**
   * Dopisuje klub (albo odświeża jego stempel) i czyni go BIEŻĄCYM - bo właśnie w nim
   * wydano tokeny, więc to on jest kontekstem następnego kodu pilota na tym urządzeniu.
   */
  remember(club: OrgRef, at: string): Promise<void>;
  /** Wybór z 00I. Identyfikator spoza listy jest ignorowany - nie ma czego wybrać. */
  setActive(orgId: string): Promise<void>;
}
