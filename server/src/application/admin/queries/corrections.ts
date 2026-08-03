/**
 * UZ Aero (serwer) — PODGLĄD korekty administratora (`A02b`, karta „przed → po").
 *
 * ══ TO JEST ZAPYTANIE, NIE KOMENDA — I TO JEST NAJWAŻNIEJSZE ZDANIE TEGO PLIKU ══
 * Podgląd NIE przechodzi przez `AuditedWrite`. Tamta brama z definicji typu wymusza
 * wpis do `admin_audit`, a dziennik audytu nie może opisywać rzeczy, które się nie
 * wydarzyły: „administrator obejrzał skutek" to nie jest zmiana w rejestrze, a wpis
 * o niej rozmyłby jedyny dokument odpowiadający na pytanie „kto co zmienił".
 * Stąd konstruktor bez `AuditedWrite`, bez `SessionsProjectionPort` i bez `DayExporter`
 * — zero zapisów, zero re-eksportu, zero skutków ubocznych.
 *
 * ══ DLACZEGO PODGLĄD W OGÓLE ISTNIEJE ══
 * Mockup pokazuje liczby dnia PRZED zapisem („czas blokowy 05:53 → 05:41", „cykl
 * silnika 3: 01:17:19 → 01:05:19"), a panel nie ma prawa ich policzyć: z domeny wolno
 * mu importować wyłącznie typy, więc `projectSession` jest dla niego nieosiągalne.
 * Gdyby policzył je „na piechotę", pierwszą ofiarą byłby `void`: unieważnienie
 * `engine_stop` NIE skraca cyklu o różnicę czasów, tylko zostawia go OTWARTYM, przez
 * co wypada z czasu blokowego w całości. Tej reguły nie da się odgadnąć z payloadu —
 * mieszka w projekcji i tylko projekcja umie ją zastosować.
 *
 * ══ TA SAMA OCENA, CO PRZY ZAPISIE ══
 * Kandydata buduje i waliduje wspólny helper (`../correctionCandidate.ts`), ten sam,
 * którego używa komenda. Podgląd mówiący „zapiszę", po którym zapis odmawia, byłby
 * gorszy niż brak podglądu.
 *
 * `POST`, a nie `GET`, mimo że to zapytanie: parametry podglądu są kształtem korekty
 * (unia dyskryminowana z opcjonalnym `newTime`), a nie filtrem listy. Wciskanie ich
 * w query string oznaczałoby drugą, ręczną serializację tego samego payloadu, który
 * chwilę później jedzie w ciele `POST /corrections` — czyli dwie okazje do rozjazdu
 * zamiast jednej definicji.
 */

import {
  applyCorrections,
  projectSession,
  type AircraftLimits,
  type Event,
  type EventCorrectionPayload,
} from '@uzaero/domain';

import { correctionCandidate, correctionViolations } from '../correctionCandidate.ts';
import type { AdminCorrectionPreview, AdminCorrectionTarget } from '../contracts/corrections.ts';
import type {
  AircraftConfigPort,
  Clock,
  Database,
  EventsStorePort,
} from '../../common/ports.ts';
import type { EventsAdminPort } from '../ports.ts';

/** Wejście podglądu: co poprawić. BEZ `reason` — patrz docblock kontraktu. */
export interface CorrectionPreviewInput {
  sessionUuid: string;
  /** Kształt bierzemy z domeny — podgląd nie modeluje korekty po raz drugi. */
  correction: EventCorrectionPayload;
}

/**
 * Odmowy IDENTYCZNE z komendą (`session_not_found` → 404, `day_open` → 400). Gdyby
 * podgląd był łaskawszy, panel wystawiłby formularz tam, gdzie zapis i tak odmówi.
 *
 * Naruszenia reguł NIE SĄ tu odmową: to treść odpowiedzi. Administrator ma zobaczyć,
 * że `void` na `day_close` jest niemożliwy, RAZEM z powodem — a nie dostać pustą
 * kartę i kod błędu.
 */
export type CorrectionPreviewOutcome =
  | { ok: true; preview: AdminCorrectionPreview }
  | { ok: false; reason: 'session_not_found' }
  | { ok: false; reason: 'day_open' };

/**
 * Uuid kandydata podglądu. Stały i jawnie nazwany, bo nigdzie nie trafia: reguły go
 * nie sprawdzają (walidują CEL korekty, nie ją samą), a `applyCorrections` odsiewa
 * zdarzenia `event_correction` ze strumienia efektywnego. Losowy uuid udawałby, że
 * cokolwiek tu powstaje.
 */
const PREVIEW_UUID = 'preview-not-persisted';

export class AdminCorrectionQueries {
  constructor(
    private readonly db: Database,
    private readonly events: EventsStorePort,
    private readonly adminEvents: EventsAdminPort,
    /** Pojemność zbiorników → `AircraftLimits`; podgląd waliduje TYMI SAMYMI limitami. */
    private readonly aircraft: AircraftConfigPort,
    private readonly clock: Clock,
  ) {}

  async preview(input: CorrectionPreviewInput): Promise<CorrectionPreviewOutcome> {
    const stream = await this.events.sessionEvents(this.db, input.sessionUuid);
    if (stream.length === 0) return { ok: false, reason: 'session_not_found' };

    const before = projectSession(stream);
    // Dzień OTWARTY = pilot ma pełne prawo zapisu i poprawia sam (04c). Panel nie ma
    // tu czego pokazywać, bo i tak nie ma czego zapisać — ta sama odmowa, co w komendzie.
    if (!before.closed) return { ok: false, reason: 'day_open' };

    const candidate = correctionCandidate(
      before,
      stream,
      input.correction,
      PREVIEW_UUID,
      this.clock.now(),
    );
    const limits: AircraftLimits = {
      capacityL: await this.aircraft.capacityL(this.db, candidate.aircraftId),
    };

    return {
      ok: true,
      preview: {
        sessionUuid: input.sessionUuid,
        target: await this.targetOf(stream, input.correction.targetUuid),
        before,
        // Projekcja liczona z PEŁNEGO strumienia z doklejonym kandydatem — dokładnie
        // tak, jak zrobi to komenda po zapisie (`projectSession` na całości, nigdy
        // „dodaj różnicę"). Kandydat idzie na koniec, bo tam trafiłby w bazie:
        // porządek strumienia to kolejność przyjęcia paczek.
        after: projectSession([...stream, candidate]),
        violations: correctionViolations(before, candidate, limits),
      },
    };
  }

  /**
   * Opis zdarzenia korygowanego; `null` = celu NIE MA w tej sesji.
   *
   * Kreska zamiast zmyślonego wiersza: cel spoza sesji jest jednocześnie naruszeniem
   * (`CORRECTION_TARGET_NOT_FOUND`), więc panel ma co pokazać — powód, a nie pustą
   * kartę z zerami udającymi odczyt.
   */
  private async targetOf(
    stream: readonly Event[],
    targetUuid: string,
  ): Promise<AdminCorrectionTarget | null> {
    const original = stream.find((event) => event.uuid === targetUuid);
    if (original === undefined) return null;

    // Czas użyty W PROJEKCJI bierzemy z `applyCorrections`, a nie z payloadów korekt:
    // reguła „ostatnia wygrywa" (razem z `void` → `retime`, który przywraca zdarzenie
    // do życia) ma jedną implementację, w domenie. Druga kopia tutaj rozjechałaby się
    // przy pierwszej zmianie — i to na ekranie, który istnieje po to, żeby pokazywać
    // prawdę o rejestrze.
    const effective = applyCorrections(stream).find((event) => event.uuid === targetUuid);
    const meta = await this.adminEvents.sourceDeviceOf(this.db, targetUuid);

    return {
      uuid: original.uuid,
      type: original.type,
      deviceTime: original.deviceTime,
      gpsTime: original.gpsTime,
      effectiveTime: effective === undefined ? null : (effective.gpsTime ?? effective.deviceTime),
      voided: effective === undefined,
      sourceDevice: meta?.sourceDevice ?? null,
      event: original,
    };
  }
}
