/**
 * UZ Aero (serwer) — adapter `ReferencePort` na Postgres.
 *
 * Zwraca flotę i pilotów w KSZTAŁTACH DOMENY (`ReferenceAircraft`, `ReferencePilot`) —
 * tych samych, które aplikacja trzyma w cache referencyjnym. Serwer i telefon mówią
 * jednym typem, więc kontrakt `GET /reference` nie ma osobnej, trzeciej definicji.
 *
 * `claim*` i `handover` to pola wyliczane ze strumienia zdarzeń (M2) — do tego czasu
 * świadomie `null`: brak przekazania to pełnoprawny stan §4.8 („brak"), nie błąd.
 */

import type { MhFormat, ReferenceAircraft, ReferencePilot, ServiceStatus } from '@uzaero/domain';

import type { Queryable, ReferencePort, ReferenceSnapshot } from '../../../application/common/ports.ts';

interface AircraftRow {
  id: string;
  reg: string;
  type: string;
  year: number | null;
  capacity_l: number;
  mh_format: string;
  dual_required: boolean;
  service_status: string;
  updated_at: string;
  oil_min_l: number | null;
  oil_capacity_l: number | null;
  oil_norm_l_per_h: number | null;
}

interface PilotRefRow {
  id: string;
  code: string;
  name: string;
  active: boolean;
  updated_at: string;
}

export class PgReferenceRepo implements ReferencePort {
  constructor(private readonly db: Queryable) {}

  async snapshot(): Promise<ReferenceSnapshot> {
    const [aircraftRes, pilotsRes] = await Promise.all([
      this.db.query<AircraftRow>('SELECT * FROM aircraft ORDER BY reg'),
      this.db.query<PilotRefRow>('SELECT id, code, name, active, updated_at FROM pilots ORDER BY code'),
    ]);

    let newest = 0;
    const touch = (iso: string): number => {
      const t = new Date(iso).getTime();
      if (t > newest) newest = t;
      return t;
    };

    const aircraft: ReferenceAircraft[] = aircraftRes.rows.map((r) => ({
      id: r.id,
      reg: r.reg,
      type: r.type,
      year: r.year,
      capacityL: Number(r.capacity_l),
      mhFormat: r.mh_format as MhFormat,
      dualRequired: r.dual_required,
      serviceStatus: r.service_status as ServiceStatus,
      // Konfiguracja oleju (issue #60) — `null` = administrator nie skonfigurował;
      // moduł dla tej jednostki milczy (podpowiedzi i ostrzeżenia śpią, pomiar działa).
      oilMinL: r.oil_min_l != null ? Number(r.oil_min_l) : null,
      oilCapacityL: r.oil_capacity_l != null ? Number(r.oil_capacity_l) : null,
      oilNormLPerH: r.oil_norm_l_per_h != null ? Number(r.oil_norm_l_per_h) : null,
      claimPicId: null,
      claimSince: null,
      handover: null,
      // Normę, tak jak claim i przekazanie, dokłada warstwa aplikacji — adapter oddaje
      // wyłącznie to, co stoi w `aircraft`.
      consumption: null,
      fetchedAt: touch(r.updated_at),
    }));

    const pilots: ReferencePilot[] = pilotsRes.rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      active: r.active,
      fetchedAt: touch(r.updated_at),
    }));

    return { aircraft, pilots, updatedAt: newest > 0 ? new Date(newest) : null };
  }
}
