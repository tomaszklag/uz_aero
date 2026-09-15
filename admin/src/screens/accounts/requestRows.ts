/**
 * Ninerdeck - panel: zgłoszenie kodem klubu -> WIERSZ KOLEJKI (mockup `piloci-lista`,
 * karta ZGŁOSZENIA; issue #101, E3).
 *
 * Moduł CZYSTY (bez Reacta), bo to są decyzje o treści komórek.
 *
 * ══ OSOBNY OD `accountRows`, BO TO INNY BYT ══
 * Wiersz listy opisuje CZŁONKA: ma kod pilota, rolę i status. Wiersz kolejki opisuje
 * KANDYDATA - kodu jeszcze nie ma (nadaje się go decyzją), roli też nie. Wspólny typ
 * z polami nullowalnymi kazałby obu miejscom pytać „a czy to już członek", a karta
 * ZGŁOSZENIA stoi nad listą właśnie po to, żeby tego pytania nie było.
 */

import type { MembershipRequestDto } from '../../api/dto';
import { dateTimeUtcShort } from '@ninerdeck/format';
import { NONE } from '../common/values';

export interface RequestRow {
  pilotId: string;
  /** Imię z konta GOOGLE - osoba założyła się sama przy pierwszym logowaniu. */
  name: string;
  email: string;
  /** „6 WRZ 18:22 UTC" - jak długo czeka. */
  waiting: string;
}

export function requestRow(request: MembershipRequestDto): RequestRow {
  return {
    pilotId: request.pilotId,
    name: request.name,
    // Adres jest tożsamością Google, więc przy zgłoszeniu kodem jest ZAWSZE. Kreska
    // zostaje dla wiersza z backfillu 1.x, gdzie kolumna osoby bywa pusta.
    email: request.email ?? NONE,
    // Godzina z sufiksem UTC, bo panel nie ma innej strefy i mówi to wprost przy
    // każdym stemplu - tak samo jak kolejka zgłoszeń błędów.
    waiting: `${dateTimeUtcShort(new Date(request.requestedAt).getTime())} UTC`,
  };
}
