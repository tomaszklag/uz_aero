/**
 * Ninerdeck - panel: KARTY KROKU „ZADANIE" wspólne dla własnej rezerwacji i zlecenia
 * (makiety K7a i ZL2a; issue #233, epik Z-D #248).
 *
 * Rodzaj operacji listą kart bez wartości podstawionej (wybór ma być świadomy) i plan lotu
 * z podpisem o tym, ile terminu zostaje na obsługę. Trasa i notatka zostają w szufladach:
 * rezerwacja i zlecenie nazywają je inaczej (notatka dla siebie kontra opis, który
 * przeczyta adresat).
 */

import { Card, Field, OptionButton, Pill, TextInput } from '../../ui/components';
import { OWN_OPERATIONS } from './ownBookingForm';

export function OperationCard({ value, onSelect }: { value: string; onSelect: (operation: string) => void }) {
  return (
    <Card title="Rodzaj operacji">
      <div className="opt-list">
        {OWN_OPERATIONS.map((o) => (
          <OptionButton key={o.value} name={o.name} desc={o.desc} selected={value === o.value} onSelect={() => onSelect(o.value)} />
        ))}
      </div>
    </Card>
  );
}

interface PlanCardProps {
  idPrefix: string;
  air: string;
  fuel: string;
  onChange: (next: { plannedAir?: string; plannedFuel?: string }) => void;
  /** Podpis pod parą pól (`planNote`); `warn` - plan nie mieści się w terminie. */
  note: { text: string; warn: boolean } | null;
}

export function PlanCard({ idPrefix, air, fuel, onChange, note }: PlanCardProps) {
  return (
    <Card title="Plan lotu">
      <div className="field-row">
        <Field htmlFor={`${idPrefix}-air`} label="Czas lotu (h:mm)">
          <TextInput
            id={`${idPrefix}-air`}
            mono
            inputMode="numeric"
            placeholder="1:30"
            value={air}
            onChange={(e) => onChange({ plannedAir: e.target.value })}
          />
        </Field>
        <Field htmlFor={`${idPrefix}-fuel`} label="Paliwo do zabrania (L)" action={<Pill tone="dim">opcjonalne</Pill>}>
          <TextInput
            id={`${idPrefix}-fuel`}
            mono
            inputMode="decimal"
            value={fuel}
            onChange={(e) => onChange({ plannedFuel: e.target.value })}
          />
        </Field>
      </div>
      {note == null ? null : note.warn ? (
        <p className="hint">
          <b>{note.text}</b>
        </p>
      ) : (
        <p className="hint">{note.text}</p>
      )}
    </Card>
  );
}
