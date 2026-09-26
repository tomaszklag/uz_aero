/**
 * Ninerdeck - panel 3.2: karta „Zużycie z lotów" w szufladzie samolotu (`docs/panel-3.2.md`
 * §8; makieta `samoloty-karta` S2c).
 *
 * Analityka jest własnością MASZYNY, więc mieszka obok norm z dokumentacji i stanu
 * bieżącego, a nie w kolumnie panelu. Komponent SAM rozstrzyga, czy ma co pokazać:
 * bez opublikowanego modelu karty NIE MA (issue #69) - szuflada idzie wprost
 * z „Motogodziny" do „Poprawy odczytów". Treść liczy `consumptionCard.ts`; tu jest
 * wyłącznie układ: pasmo jako wypełnienie, norma z dokumentacji jako marker, wiersze
 * klucz-wartość.
 */

import { useConsumption } from '../../queries/useFleet';
import { Banner, Card, Pill } from '../../ui/components';
import { errorMessage } from '../common/apiMessage';
import { consumptionCardView, type ConsumptionKv } from './consumptionCard';

interface ConsumptionCardProps {
  aircraftId: string;
}

export function ConsumptionCard({ aircraftId }: ConsumptionCardProps) {
  const report = useConsumption(aircraftId);

  // Awaria pobrania to INNY stan niż brak modelu: o tym drugim karta milczy, o pierwszym
  // mówi - inaczej zerwane łącze wyglądałoby jak młoda maszyna bez danych.
  if (report.error != null) return <Banner tone="warn">{errorMessage(report.error)}</Banner>;

  const view = report.data == null ? null : consumptionCardView(report.data);
  // W trakcie pobierania też nic: plamka obiecywałaby kartę, która może nie przyjść.
  if (view == null) return null;

  return (
    <Card title="Zużycie z lotów" actions={<Pill tone="dim">{view.badge}</Pill>}>
      <Kv row={view.band} />
      <div className="band" role="img" aria-label={view.gauge.aria}>
        <span className="band-fill" style={{ left: `${view.gauge.leftPct}%`, width: `${view.gauge.widthPct}%` }} />
        {view.gauge.markPct == null ? null : (
          <span className="band-mark" style={{ left: `${view.gauge.markPct}%` }} title={view.gauge.markTitle ?? undefined} />
        )}
      </div>
      <div className="band-scale">
        <span>{view.gauge.scaleLow}</span>
        <span>{view.gauge.scaleHigh}</span>
      </div>
      {view.rows.map((row) => (
        <Kv key={row.label} row={row} />
      ))}
    </Card>
  );
}

function Kv({ row }: { row: ConsumptionKv }) {
  return (
    <div className="kv">
      <span className="kv-k">{row.label}</span>
      <span className={['kv-v', row.tone].filter((c) => c != null).join(' ')}>
        {row.value} <small>{row.small}</small>
      </span>
    </div>
  );
}
