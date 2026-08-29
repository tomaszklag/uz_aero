/**
 * UZ Aero (serwer) - oś faz pionowych jako PLIK POBOCZNY przy śladzie (`PhaseTimelinePort`).
 *
 * ══ PROBLEM ══
 * Model czterofazowy potrzebuje, dla każdego interwału paliwowego, rozbicia lotu na
 * wznoszenie, przelot i zniżanie. Wynika ono ze śladu GPS, a ślad to NDJSON o rozmiarze
 * kilku megabajtów na dzień lotny. Analityka okna 90-dniowego dotyka kilkudziesięciu
 * sesji - czytanie ich wszystkich przy każdym otwarciu ekranu byłoby setkami megabajtów
 * parsowania na jedno żądanie.
 *
 * ══ ROZWIĄZANIE: PLIK POBOCZNY LICZONY LENIWIE ══
 * Obok `<sesja>.ndjson` leży `<sesja>.phases.json` - kilkaset bajtów zamiast kilku
 * megabajtów. Powstaje przy pierwszym pytaniu i żyje, dopóki ślad się nie zmieni.
 *
 * ══ DLACZEGO PLIK, A NIE TABELA ══
 * Trzy powody, każdy wystarczający osobno:
 *  • **retencja za darmo** - pochodna śladu żyje przy śladzie, więc skasowanie nagrania
 *    zabiera ze sobą jego oś; tabela wymagałaby własnego sprzątania i pamiętania o nim;
 *  • **skasowanie jest bezpieczne z definicji** - plik odtworzy się przy następnym
 *    pytaniu, więc nie ma tu stanu, który dałoby się nieodwracalnie stracić;
 *  • **zero migracji** - kształt osi zmieni się razem z progami detekcji, a to nie
 *    powód, żeby ruszać schemat bazy.
 *
 * Gdyby kiedyś trzeba było FILTROWAĆ albo SORTOWAĆ po fazach po stronie bazy, wróci
 * tabela. Dziś nikt o to nie pyta.
 *
 * ══ UNIEWAŻNIANIE ══
 * Nagłówek pliku niesie rozmiar i czas modyfikacji ŹRÓDŁA. Niezgodność któregokolwiek
 * znaczy „ślad urósł albo został podmieniony" i wymusza przeliczenie. Ślad jest
 * append-only (`FsTraceSink` dopisuje), więc rozmiar wystarczyłby sam - ale czas
 * modyfikacji kosztuje jedno pole i łapie też podmianę pliku z zewnątrz.
 *
 * Wersja formatu (`version`) unieważnia wszystkie pliki naraz po zmianie progów
 * detekcji: oś policzona starym progiem `VS_THRESHOLD_FPM` opisuje inny lot niż ten,
 * który zobaczyłby dziś administrator.
 */

import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  buildPhaseTimeline,
  toTrackPoints,
  type PhaseSegment,
  type RawTrackEntry,
} from '@uzaero/domain';

import type { PhaseTimelinePort, TraceSourcePort } from '../../application/common/ports.ts';
import { safeName } from './safeName.ts';

/**
 * Wersja formatu pliku pobocznego. **Podbij ją przy każdej zmianie progów albo metody
 * liczenia faz** - inaczej stare pliki opisywałyby lot inaczej niż świeżo policzone,
 * a rozjazdu nie dałoby się zauważyć po samej treści.
 */
const TIMELINE_VERSION = 1;

interface SidecarFile {
  version: number;
  sourceSize: number;
  sourceMtimeMs: number;
  segments: PhaseSegment[];
}

export class FsPhaseTimeline implements PhaseTimelinePort {
  constructor(
    private readonly dir: string,
    private readonly traces: TraceSourcePort,
  ) {}

  async read(sessionUuid: string): Promise<PhaseSegment[]> {
    const source = join(this.dir, `${safeName(sessionUuid)}.ndjson`);

    let sourceStat;
    try {
      sourceStat = await stat(source);
    } catch {
      // Brak śladu to nie awaria: dzień mógł być bez GPS albo nagranie jeszcze nie
      // dotarło. Pusta oś znaczy „interwały tej sesji nie dostaną faz pionowych".
      return [];
    }

    const cached = await this.readSidecar(sessionUuid, sourceStat);
    if (cached != null) return cached;

    const entries = (await this.traces.read(sessionUuid)) as unknown as RawTrackEntry[];
    const segments = buildPhaseTimeline(toTrackPoints(entries));

    await this.writeSidecar(sessionUuid, {
      version: TIMELINE_VERSION,
      sourceSize: sourceStat.size,
      sourceMtimeMs: sourceStat.mtimeMs,
      segments,
    });

    return segments;
  }

  private async readSidecar(
    sessionUuid: string,
    sourceStat: { size: number; mtimeMs: number },
  ): Promise<PhaseSegment[] | null> {
    try {
      const raw = await readFile(this.sidecarPath(sessionUuid), 'utf8');
      const file = JSON.parse(raw) as SidecarFile;

      if (file.version !== TIMELINE_VERSION) return null;
      if (file.sourceSize !== sourceStat.size) return null;
      if (file.sourceMtimeMs !== sourceStat.mtimeMs) return null;

      return file.segments;
    } catch {
      // Brak pliku albo treść nie do odczytania - liczymy od nowa. Plik pochodny nie ma
      // prawa wywrócić żądania, bo z definicji da się go odtworzyć.
      return null;
    }
  }

  private async writeSidecar(sessionUuid: string, file: SidecarFile): Promise<void> {
    try {
      await writeFile(this.sidecarPath(sessionUuid), JSON.stringify(file), 'utf8');
    } catch (err) {
      // Zapis cache'u jest optymalizacją, nie warunkiem poprawności - nieudany kosztuje
      // przeliczenie przy następnym pytaniu i nic poza tym.
      console.error(`nie udało się zapisać osi faz dla ${sessionUuid}:`, err);
    }
  }

  private sidecarPath(sessionUuid: string): string {
    return join(this.dir, `${safeName(sessionUuid)}.phases.json`);
  }
}
