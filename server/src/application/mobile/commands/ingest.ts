/**
 * Ninerdeck (serwer) - komenda przyjęcia paczki zdarzeń (`POST /events`, §4.3–4.5).
 *
 * Cała operacja jest JEDNĄ transakcją: wstawienie zdarzeń → przeliczenie projekcji
 * dotkniętych sesji → flagi łańcucha MH. Telefon, który dostał odpowiedź, może
 * oznaczyć zdarzenia jako wysłane; stan `sessions` nigdy nie rozjeżdża się z `events`.
 *
 * Dwie zasady, które ta komenda MUSI utrzymać:
 *
 *  • **Idempotencja** (§4.3): retry tej samej paczki daje `duplicates`, nie podwójne
 *    wiersze. Klucz = uuid nadany przez telefon.
 *  • **Serwer nie blokuje, flaguje** (§4.5): nakładka sesji, dziura albo cofnięcie
 *    łańcucha MH nie odrzucają zdarzeń - trafiają do `flags` do wyjaśnienia. Jedyny
 *    twardy warunek to TOŻSAMOŚĆ: paczkę sesji wysyła wyłącznie telefon jej PIC-a
 *    (single-writer §4.4); cudze zdarzenia to nie konflikt danych, tylko brak
 *    uprawnień.
 *
 * ══ KLUB (wielofirmowość, epik C - issue #99) ══
 * Klub przychodzi Z TOKENU nadawcy (`IngestSender.orgId`) - brama trasy sprawdziła
 * już, że nadawca jest AKTYWNYM członkiem tego klubu (`authorizeMember`). Każde
 * zdarzenie ląduje w rejestrze pod tym klubem, pod warunkiem że maszyna i sesja
 * do niego należą. Zdarzenie celujące w CUDZY klub (maszyna z rejestru floty innego
 * klubu, sesja założona pod innym klubem) jest WSTRZYMYWANE - tym samym mechanizmem
 * `withheld`, co zapis do operacji zakończonej przez administratora (issue #81):
 * nie wchodzi do rejestru, telefon dostaje jego uuid i oznacza go u siebie, a reszta
 * paczki przechodzi. Do epiku C taka paczka odbijała się w całości (`403
 * aircraft_not_in_org`) - i blokowała wysyłkę WSZYSTKIEGO, co telefon miał w kolejce,
 * mimo że pozostałe zapisy były do własnego klubu. Cudzy klub nie jest błędem
 * nadawcy do naprawienia, tylko zapisem, który nigdy nie przejdzie - a to jest
 * dokładnie definicja wstrzymania.
 *
 * Projekcję liczy `projectSession` z `@ninerdeck/domain` - DOKŁADNIE ten sam kod, który
 * liczy ekran statystyk na telefonie. Korekty (04c) wchodzą w wynik automatycznie,
 * bo nakłada je sama projekcja.
 */

import { eventTime, projectSession, type Event } from '@ninerdeck/domain';

import { clockDriftFlag } from '../../../domain/clockDrift.ts';
import { chainFlags, type ChainLink } from '../../../domain/mhChain.ts';
import { pilotOverlapFlags } from '../../../domain/pilotOverlap.ts';
import { sessionRowFrom } from '../../common/mappers/sessionRow.ts';
import {
  recomputeConsumptionNorm,
  type ConsumptionNormPorts,
} from '../../common/consumptionNorm.ts';
import type { DayExporter } from '../../common/export/dayExporter.ts';
import { aircraftEngineStarted, aircraftReleased } from '../../common/notify/aircraftNotices.ts';
import type { AircraftWatching } from '../../common/notify/aircraftWatching.ts';
import type { NotificationDraft } from '../../common/notify/bookingNotices.ts';
import type {
  BookingsPort,
  AircraftConfigPort,
  Clock,
  Database,
  EventsStorePort,
  FlagRecord,
  FlagsPort,
  Queryable,
  SessionRow,
  SessionsProjectionPort,
} from '../../common/ports.ts';

export interface IngestResult {
  accepted: number;
  duplicates: number;
  /**
   * Uuidy zdarzeń WSTRZYMANYCH: sesja zakończona albo unieważniona przez administratora
   * (issue #81) ALBO zapis do cudzego klubu (issue #99). Nie weszły do rejestru i nie
   * wejdą - telefon ma je oznaczyć u siebie jako wstrzymane, nie ponawiać.
   */
  withheld: string[];
  /** Otwarte flagi dotykające przysłanych sesji - telefon pokaże je na ekranie 11. */
  flags: FlagRecord[];
}

export type IngestOutcome =
  | { ok: true; result: IngestResult }
  /** Nadawca nie jest PIC-em sesji, którą próbuje dopisać (single-writer §4.4). */
  | { ok: false; reason: 'not_session_pic' };

/**
 * Nadawca paczki tak, jak zna go token: osoba I klub. Klub jest tu treścią, nie
 * metadanymi - trafia do każdego wiersza rejestru i do projekcji (`org_id`), a maszyna
 * z paczki musi do niego należeć.
 */
export interface IngestSender {
  pilotId: string;
  orgId: string;
}

export class IngestCommands {
  constructor(
    private readonly db: Database,
    private readonly events: EventsStorePort,
    private readonly sessions: SessionsProjectionPort,
    private readonly flags: FlagsPort,
    /** Pojemność zbiorników → tolerancja `fuel_mismatch` (§4.5); klub maszyny → wstrzymanie. */
    private readonly aircraft: AircraftConfigPort,
    /** `null` = eksport §4.7 wyłączony (brak konfiguracji Sheets w composition root). */
    private readonly exporter: DayExporter | null,
    /**
     * Porty przeliczenia normy zużycia; `null` = wyłączone. Norma jest podpowiedzią
     * dla pilota (ekrany 04/06/10), więc jej brak nie blokuje niczego - dokładnie tak
     * samo jak brak eksportu arkusza.
     */
    private readonly norms: ConsumptionNormPorts | null,
    private readonly clock: Clock,
    /**
     * Rezerwacje (3.0.0) - `null` = wyłączone. Ingest dotyka ich w JEDNYM miejscu
     * i w jedną stronę: `session_claim` z `reservationId` przestawia rezerwację na
     * `fulfilled`. Rejestr nie wie o rezerwacjach nic poza tym identyfikatorem.
     */
    private readonly bookings: BookingsPort | null = null,
    /**
     * Obserwowanie samolotu (3.2.0, issue #205) - `null` = wyłączone. Ingest budzi
     * obserwujących przy PRZYJĘTYM uruchomieniu silnika i zdaniu maszyny (§5.3, §5.4):
     * adresatów liczy `AircraftWatching`, wiadomość powstaje w tej samej transakcji,
     * co projekcja, a budzik dzwoni po commicie.
     */
    private readonly watching: AircraftWatching | null = null,
  ) {}

  async ingest(
    sender: IngestSender,
    batch: readonly Event[],
    sourceDevice: string | null,
  ): Promise<IngestOutcome> {
    const senderPilotId = sender.pilotId;
    const orgId = sender.orgId;
    // Samoloty dotknięte paczką - wypełniane w transakcji, używane PO commicie
    // (przeliczenie normy zużycia), więc muszą przeżyć jej zakres.
    const aircraftIds = new Set<string>();
    const picIds = new Set<string>();
    // Single-writer (§4.4), warstwa 1: każda paczka niesie zdarzenia podpisane PIC-em
    // sesji; nadawca musi nim być. Odrzucamy CAŁĄ paczkę - częściowe przyjęcie
    // rozjechałoby księgowość outboxa (telefon nie wie, które wiersze weszły).
    if (batch.some((e) => e.picId !== senderPilotId)) {
      return { ok: false, reason: 'not_session_pic' };
    }

    /*
     * ══ CUDZY KLUB → WSTRZYMANIE (issue #99, C2) ══
     * Najpierw KLUB, potem PIC - w tej kolejności, bo odpowiedź o cudzym klubie ma
     * niczego nie zdradzać: gdyby sprawdzić PIC-a wcześniej, `403 not_session_pic`
     * mówiłoby nadawcy „ta sesja istnieje i ma innego pilota" o operacji, której
     * nie ma prawa zobaczyć. Wstrzymanie jest ciche z konstrukcji - telefon dostaje
     * tylko listę uuidów, które nie weszły.
     *
     * Dwa źródła cudzości: maszyna z REJESTRU FLOTY innego klubu (`aircraft.org_id`)
     * i sesja JUŻ ISTNIEJĄCA pod innym klubem (`sessions.org_id`) - drugie łapie
     * dosyłkę po przełączeniu klubu (epik F), gdzie maszyna mogłaby nie być w rejestrze.
     * Maszyna NIEZNANA rejestrowi przechodzi (rejestr przyjmuje to, co przyszło
     * z terenu, `aircraft_id` nie ma klucza obcego) i dostaje klub tokenu.
     */
    const withheld = new Set<string>();
    for (const aircraftId of new Set(batch.map((e) => e.aircraftId))) {
      const owner = await this.aircraft.orgIdOf(this.db, aircraftId);
      if (owner != null && owner !== orgId) {
        for (const e of batch) if (e.aircraftId === aircraftId) withheld.add(e.uuid);
      }
    }
    for (const sessionUuid of new Set(batch.map((e) => e.sessionUuid))) {
      const owner = await this.sessions.ownerOf(this.db, sessionUuid);
      if (owner != null && owner.orgId !== orgId) {
        for (const e of batch) if (e.sessionUuid === sessionUuid) withheld.add(e.uuid);
      }
    }
    const own = batch.filter((e) => !withheld.has(e.uuid));

    // Warstwa 2 (audyt: KRYTYCZNE): sam podpis w paczce nie wystarcza - napastnik
    // wpisałby WŁASNE picId w zdarzenia celujące w CUDZĄ sessionUuid i antydatowanym
    // zdarzeniem przejął sesję, unieważnił loty korektą albo zamknął cudzy dzień.
    // Dlatego nadawcę porównujemy z PIC-em sesji JUŻ ISTNIEJĄCEJ na serwerze; nowa
    // sesja należy do tego, kto ją pierwszy przyniósł. Sprawdzamy WYŁĄCZNIE sesje
    // własnego klubu - cudze zostały wstrzymane wyżej, zanim cokolwiek o nich powiemy.
    for (const sessionUuid of new Set(own.map((e) => e.sessionUuid))) {
      const existing = await this.sessions.ownerOf(this.db, sessionUuid);
      if (existing != null && existing.picId !== senderPilotId) {
        return { ok: false, reason: 'not_session_pic' };
      }
    }

    const { closedNow, notices, ...result } = await this.db.transaction(async (tx) => {
      // Blokada advisory per sesja (audyt: lost update) - dwie równoległe paczki tej
      // samej sesji liczyłyby projekcję każda bez zdarzeń drugiej i ostatni commit
      // nadpisałby `sessions` niekompletnym stanem. Lock szereguje ingest per sesja,
      // zwalnia się sam z końcem transakcji.
      for (const sessionUuid of [...new Set(own.map((e) => e.sessionUuid))].sort()) {
        await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [sessionUuid]);
      }

      /*
       * OPERACJA ZAKOŃCZONA PRZEZ ADMINISTRATORA NIE PRZYJMUJE JUŻ NIC Z TELEFONU
       * (issue #81). Telefon sam wstrzymuje takie zapisy, zanim je wyśle (pyta serwer
       * PRZED wysyłką, `SyncEngine`), ale wyścig jest realny: paczka mogła wyjść
       * w tej samej sekundzie, w której panel zamykał operację. Wtedy ZATRZYMUJEMY ją
       * TU - zdarzenia wstrzymane nie wchodzą do rejestru, a telefon dostaje ich listę
       * (`withheld`) i oznacza je u siebie tak samo, jak te wstrzymane z własnej woli.
       *
       * To jeden z dwóch wyjątków od „serwer nie odrzuca, flaguje" (§4.5; drugim jest
       * cudzy klub wyżej) - i świadomy: decyzja administratora o zamknięciu jest
       * ostatnim słowem o tej operacji, a zdanie dosłane po niej (albo lądowanie „po"
       * zakończeniu) rozjechałoby rejestr z decyzją człowieka, który widział całą sytuację.
       *
       * Sprawdzamy WYŁĄCZNIE sesje, których wiersz projekcji nie jest `active`: paczka
       * do sesji otwartej albo nowej to norma i nie ma za co płacić odczytem strumienia.
       */
      let toInsert = own;
      for (const sessionUuid of new Set(own.map((e) => e.sessionUuid))) {
        const existing = await this.sessions.get(tx, orgId, sessionUuid);
        if (existing == null || existing.status === 'active') continue;
        const state = projectSession(await this.events.sessionEvents(tx, orgId, sessionUuid));
        if (!state.closedByAdmin && !state.voidedByAdmin) continue;
        for (const e of own) if (e.sessionUuid === sessionUuid) withheld.add(e.uuid);
        toInsert = toInsert.filter((e) => e.sessionUuid !== sessionUuid);
      }

      const { accepted, duplicates, inserted } = await this.events.insertBatch(
        tx,
        orgId,
        toInsert,
        sourceDevice,
      );

      // Projekcje przeliczamy per DOTKNIĘTA sesja - pełny strumień, nie przyrost.
      // Strumień dnia to dziesiątki zdarzeń; odtwarzalność > mikrooptymalizacja.
      const sessionUuids = [...new Set(toInsert.map((e) => e.sessionUuid))];
      const closedNow: string[] = [];
      // Wiersze projekcji i rezerwacja z przejęcia - materiał powiadomień obserwujących
      // (niżej), zebrany w tej samej pętli, żeby nie czytać strumienia drugi raz.
      const rows = new Map<string, SessionRow>();
      const reservations = new Map<string, string | null>();

      for (const sessionUuid of sessionUuids) {
        const stream = await this.events.sessionEvents(tx, orgId, sessionUuid);
        if (stream.length === 0) continue;
        const row = sessionRowFrom(sessionUuid, stream, orgId);
        await this.sessions.upsert(tx, row);
        rows.set(sessionUuid, row);
        const claim = stream.find((e) => e.type === 'session_claim');
        const reservationId = (claim?.payload as { reservationId?: string | null } | undefined)
          ?.reservationId;
        reservations.set(
          sessionUuid,
          typeof reservationId === 'string' && reservationId !== '' ? reservationId : null,
        );
        aircraftIds.add(row.aircraftId);
        picIds.add(row.picId);
        if (row.status === 'closed') closedNow.push(sessionUuid);

        // Rozjazd zegarów jest własnością POJEDYNCZEGO zdarzenia, nie łańcucha sesji,
        // więc liczy się tu - na pełnym strumieniu dnia, który i tak mamy wczytany.
        const drift = clockDriftFlag(sessionUuid, stream);
        if (drift != null) {
          await this.flags.ensureOpen(tx, { ...drift, orgId, aircraftId: row.aircraftId });
        }
      }

      // Flagi liczymy per samolot, z CAŁEJ jego historii sesji W KLUBIE - anomalia
      // łańcucha z definicji dotyczy pary sesji, więc sama paczka nie wystarcza.
      for (const aircraftId of aircraftIds) {
        const links: ChainLink[] = (
          await this.sessions.listByAircraft(tx, orgId, aircraftId)
        ).map((s) => ({
          sessionUuid: s.sessionUuid,
          mhStart: s.mhStart,
          mhEnd: s.mhEnd,
          fuelStartL: s.fuelStartL,
          fuelEndL: s.fuelEndL,
          closed: s.status === 'closed',
        }));
        const capacityL = await this.aircraft.capacityL(tx, orgId, aircraftId);
        for (const flag of chainFlags(links, capacityL)) {
          await this.flags.ensureOpen(tx, { ...flag, orgId, aircraftId });
        }
      }

      // Nakładka CZASU PILOTA - druga oś, więc drugie przejście (§4.7). Grafik człowieka
      // idzie w poprzek maszyn, więc pętla po samolotach wyżej nie ma jak jej zobaczyć:
      // dwie sesje tworzące nakładkę należą z definicji do RÓŻNYCH samolotów.
      //
      // Flaga ląduje na samolocie PÓŹNIEJSZEJ z pary - tabela `flags` wymaga jednego
      // `aircraft_id`, a to ta maszyna została wzięta, gdy poprzednia nie była zdana.
      // Wskazuje ją `laterSessionUuid`, NIE `sessionUuids[1]`: tamta tablica jest
      // posortowana alfabetycznie (zbiór kanoniczny dla `UNIQUE`) i o czasie nie mówi nic.
      //
      // Nakładka MIĘDZY klubami nie jest wykrywana (issue #99): flaga w dzienniku jednego
      // klubu wskazywałaby operację drugiego, czyli byłaby wyciekiem.
      for (const picId of picIds) {
        const spans = (await this.sessions.listByPilot(tx, orgId, picId)).map((s) => ({
          sessionUuid: s.sessionUuid,
          aircraftId: s.aircraftId,
          claimedAt: s.claimTime,
          closedAt: s.closeTime,
        }));
        for (const { laterSessionUuid, ...flag } of pilotOverlapFlags(spans)) {
          const later = spans.find((s) => s.sessionUuid === laterSessionUuid);
          if (later != null) {
            await this.flags.ensureOpen(tx, { ...flag, orgId, aircraftId: later.aircraftId });
          }
        }
      }

      /*
       * REZERWACJA ZREALIZOWANA (3.0.0, issue #158 B7; `docs/rezerwacje.md` §14 R7).
       *
       * Jedyne miejsce, w którym rejestr dotyka rezerwacji - i tylko w jedną stronę.
       * Nieznany albo już zamknięty identyfikator NIE JEST błędem i niczego nie
       * wstrzymuje: rezerwacja nie jest warunkiem lotu (§2.3), a pilot mógł wejść
       * w lot z rezerwacji odwołanej w międzyczasie przez administratora. Zapis lotu
       * jest wtedy ważniejszy niż porządek w kalendarzu.
       *
       * Ta sama transakcja, co zdarzenia: rezerwacja oznaczona jako zrealizowana
       * przy paczce, która się nie zapisała, wskazywałaby operację, której nie ma.
       */
      if (this.bookings != null) {
        for (const event of toInsert) {
          if (event.type !== 'session_claim') continue;
          const id = (event.payload as { reservationId?: string | null }).reservationId;
          if (typeof id !== 'string' || id === '') continue;
          await this.bookings.fulfil(
            tx,
            orgId,
            id,
            { sessionUuid: event.sessionUuid, pilotId: event.picId, aircraftId: event.aircraftId },
            this.clock.now(),
          );
        }
      }
      /*
       * OBSERWOWANIE SAMOLOTU (3.2.0, issue #205; `docs/obserwowanie-samolotu.md` §5.3, §5.4).
       *
       * Budzimy WYŁĄCZNIE przy zdarzeniu, które NAPRAWDĘ weszło (`inserted`) - ponowiona
       * paczka nie dzwoni drugi raz o tym samym. Paczka niosąca uruchomienie I zdanie
       * tej samej operacji rodzi TYLKO „zdana" (§2.3): wiadomość o zdaniu niesie czas
       * uruchomienia, a „uruchomiona" obok niej byłaby zdaniem o stanie, który już nie
       * istnieje. Wpis ręczny milczy (decyzja 3) - opisuje przeszłość, nie to, co dzieje
       * się z maszyną teraz. Uruchomienie dosłane do operacji już ZAMKNIĘTEJ też milczy
       * z tego samego powodu. Adresaci: obserwujący z prawem sprawdzonym przy wysyłce,
       * bez PIC-a i Duala operacji - o własnym locie nikogo nie budzimy. Czas wiadomości
       * to czas Z REJESTRU (`eventTime`), nie chwila dotarcia paczki.
       */
      const notices: NotificationDraft[] = [];
      if (this.watching != null) {
        const arrived = new Set(inserted);
        for (const sessionUuid of sessionUuids) {
          const row = rows.get(sessionUuid);
          if (row == null || row.manualEntry === true || row.status === 'voided') continue;
          const fresh = toInsert.filter((e) => e.sessionUuid === sessionUuid && arrived.has(e.uuid));
          const close = fresh.find((e) => e.type === 'day_close');
          const start = fresh.find((e) => e.type === 'engine_start');
          if (close != null) {
            if (row.status !== 'closed') continue;
            const audience = await this.watching.audience(tx, orgId, row.aircraftId, [row.picId, row.dualId]);
            if (audience == null) continue;
            const payload = close.payload as { noFlightReason?: string | null };
            notices.push(
              ...aircraftReleased(audience, {
                sessionUuid,
                aircraftId: row.aircraftId,
                pilotId: row.picId,
                dualId: row.dualId,
                at: eventTime(close),
                engineStartAt: row.engineStartAt,
                engineStopAt: row.engineStopAt,
                blockMs: row.blockMs,
                flights: row.flightsCount,
                fuelEndL: row.fuelEndL,
                mhEnd: row.mhEnd,
                noFlightReason: payload.noFlightReason ?? null,
                closedBy: 'pilot',
                reason: null,
              }),
            );
          } else if (start != null && row.status === 'active') {
            const audience = await this.watching.audience(tx, orgId, row.aircraftId, [row.picId, row.dualId]);
            if (audience == null) continue;
            // „Zgodnie z planem" = rezerwacja ZREALIZOWANA tą operacją (`fulfil` wyżej),
            // nie sam identyfikator w przejęciu: rezerwacja odwołana w międzyczasie nie
            // jest planem, na który mechanik czekał.
            const bookingId = reservations.get(sessionUuid) ?? null;
            const booking =
              bookingId == null || this.bookings == null
                ? null
                : await this.bookings.byId(tx, orgId, bookingId);
            const planned = booking != null && booking.sessionUuid === sessionUuid;
            notices.push(
              ...aircraftEngineStarted(audience, {
                sessionUuid,
                aircraftId: row.aircraftId,
                pilotId: row.picId,
                dualId: row.dualId,
                at: eventTime(start),
                operation: row.operation,
                planned,
                bookingId: planned ? bookingId : null,
              }),
            );
          }
        }
        await this.watching.record(tx, orgId, notices, this.clock.now());
      }

      const flags = await openFlagsFor(this.flags, tx, orgId, sessionUuids);
      return { accepted, duplicates, flags, closedNow, notices, withheld: [...withheld] };
    });

    // Budzik obserwujących PO commicie (obserwowanie §5): push jest budzikiem, nie
    // treścią - wiersze skrzynki już są, a awaria dostawcy ma kosztować ciszę
    // w telefonie, nie przyjętą paczkę.
    if (this.watching != null) await this.watching.wake(orgId, notices);

    // Eksport §4.7 - PO commicie i poza gwarancjami odpowiedzi: telefon dostaje 200
    // za PRZYJĘCIE zdarzeń, a arkusz jest skutkiem, nie warunkiem. Awaria Sheets nie
    // może zamienić dostarczonej paczki w wieczny retry outboxa - dlatego wyjątek
    // kończy się logiem, nigdy błędem odpowiedzi. Sesja zamknięta w tej paczce
    // (albo domknięta wcześniej i właśnie uzupełniona spóźnionymi danymi) dostaje
    // świeżą kartę; rewizje nalicza eksporter.
    if (this.exporter != null) {
      for (const sessionUuid of closedNow) {
        try {
          await this.exporter.exportSession(orgId, sessionUuid);
        } catch (err) {
          console.error(`eksport arkusza sesji ${sessionUuid} nie powiódł się:`, err);
        }
      }
    }

    // Norma zużycia - dokładnie ta sama umowa, co przy eksporcie: PO commicie, poza
    // gwarancjami odpowiedzi, wyjątek do logu. Model czyta strumienie kilkudziesięciu
    // sesji i puszcza je przez regresję, więc jest to najdroższa rzecz w tym przepływie -
    // a przelicza się wyłącznie wtedy, gdy dzień faktycznie się domknął, bo tylko wtedy
    // przybył nowy interwał paliwowy. Otwarcie dnia niczego w modelu nie zmienia.
    if (this.norms != null && closedNow.length > 0) {
      for (const aircraftId of aircraftIds) {
        try {
          await recomputeConsumptionNorm(this.db, orgId, aircraftId, this.norms, this.clock.now());
        } catch (err) {
          console.error(`przeliczenie normy zużycia ${aircraftId} nie powiodło się:`, err);
        }
      }
    }

    return { ok: true, result };
  }
}

async function openFlagsFor(
  flags: FlagsPort,
  db: Queryable,
  orgId: string,
  sessionUuids: string[],
): Promise<FlagRecord[]> {
  const seen = new Map<number, FlagRecord>();
  for (const uuid of sessionUuids) {
    for (const flag of await flags.openForSession(db, orgId, uuid)) {
      seen.set(flag.id, flag);
    }
  }
  return [...seen.values()].sort((a, b) => a.id - b.id);
}
