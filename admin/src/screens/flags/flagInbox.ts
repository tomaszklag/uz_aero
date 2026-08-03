/**
 * UZ Aero — panel: decyzje o treści CAŁEJ skrzynki, nie pojedynczego wiersza
 * (moduł CZYSTY).
 *
 * Dwie rzeczy, których nie da się rozstrzygnąć w komórce tabeli: co powiedzieć nad
 * listą, gdy stoją na niej sprawy trzymające karty dnia, i co powiedzieć zamiast
 * listy, gdy nie ma jej wcale.
 */

import type { FlagListItemDto } from '../../api/dto';
import { isNarrowed, type FlagFilter } from './flagFilters';

export interface BlockingFlag {
  id: number;
  reg: string;
}

/**
 * Sprawy z TEJ listy, które trzymają kartę dnia poza arkuszem.
 *
 * Predykat, nie licznik — i to jest różnica merytoryczna. Panel opisuje tu wiersze,
 * które człowiek ma przed oczami, a nie stan całego systemu: lista bywa zawężona
 * filtrem i przycięta `limit`-em, więc policzenie z niej „ile flag blokuje eksport"
 * dałoby liczbę, której serwer nigdy nie wysłał. Dlatego baner wymienia NUMERY
 * spraw widocznych na ekranie i niczego nie sumuje.
 */
export function blockingFlags(items: readonly FlagListItemDto[]): BlockingFlag[] {
  return items
    .filter((flag) => flag.blocksExport)
    .map((flag) => ({ id: flag.id, reg: flag.reg ?? flag.aircraftId }));
}

export interface InboxEmpty {
  title: string;
  note: string;
}

/**
 * Pusta skrzynka mówi CO INNEGO w zależności od tego, czego szukaliśmy.
 *
 * „Brak otwartych flag" jest wiadomością o stanie klubu (`A03b`) — wszystko jest
 * wyjaśnione i podpisane. „Nic w tym filtrze" jest wiadomością o zapytaniu.
 * Jeden napis na oba przypadki kazałby administratorowi zgadywać, czy właśnie
 * widzi dobrą wiadomość, czy własną literówkę.
 */
export function inboxEmpty(filter: FlagFilter): InboxEmpty {
  if (isNarrowed(filter)) {
    return {
      title: 'NIC W TYM FILTRZE',
      note:
        'Żadna flaga nie spełnia zawężenia, które jest w adresie. Zdejmij filtr typu, ' +
        'sesji albo zakresu dat — skrzynka nie jest pusta, jest zawężona.',
    };
  }

  if (filter.status === 'resolved') {
    return {
      title: 'BRAK ROZWIĄZANYCH FLAG',
      note:
        'Nikt jeszcze nie zamknął żadnej sprawy. Rozwiązana flaga nie znika z bazy — ' +
        'zmienia się tylko status i dopisuje chwila rozstrzygnięcia, żeby po pół roku ' +
        'dało się odtworzyć, kto uznał dziurę w łańcuchu za nieszkodliwą i dlaczego.',
    };
  }

  return {
    title: 'BRAK OTWARTYCH FLAG',
    note:
      'Wszystkie rozbieżności są wyjaśnione i podpisane, więc żadna karta dnia nie czeka ' +
      'na odblokowanie. Nowa flaga pojawi się tu automatycznie, gdy serwer przyjmie ' +
      'zdarzenia z dziurą albo cofnięciem w łańcuchu motogodzin, zobaczy dwie niezamknięte ' +
      'sesje jednego samolotu, rozjazd paliwa poza tolerancją albo przestawiony zegar. ' +
      'Flag nie zakłada i nie kasuje człowiek — pustej skrzynki nie da się „wyczyścić", ' +
      'da się ją tylko wypracować.',
  };
}
