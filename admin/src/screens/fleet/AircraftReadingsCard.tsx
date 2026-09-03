/**
 * UZ Aero - panel 2.0: karta „Poprawa odczytów" w szufladzie samolotu (issue #81).
 *
 * ══ OSOBNA AKCJA, NIE POLA „AKTUALNY STAN" ══
 * Gdy maszynę prowadzi dziennik, pola stanu są do odczytu (uwagi do issue #66) - ta
 * karta jest jedyną drogą, którą administrator NADPISUJE odczyty: po zakończeniu
 * administracyjnym operacji osieroconej (bez odczytów końcowych), po tankowaniu poza
 * aplikacją, po remoncie. Ta sama konstrukcja, co unieważnienie w dzienniku: pytanie
 * przy przycisku, formularz w miejscu, komentarz WYMAGANY - jak powód korekty
 * w aplikacji pilota, o który prosi zgłoszenie.
 *
 * Szkic startuje z bieżącego stanu (`readingDraftOf`): poprawia się jedną liczbę,
 * a nie przepisuje trzy. Odmowy serwera (minus, sufit zbiornika) wracają nazwanym
 * powodem przez ten sam słownik, co przy konfiguracji (`fleetRefusalMessage`).
 */

import { useState } from 'react';
import type { MhFormat } from '@uzaero/domain';

import type { AircraftListItemDto } from '../../api/dto';
import { useRecordReading } from '../../queries/useFleet';
import { Banner, Button, Card, Field, TextInput } from '../../ui/components';
import { errorMessage, refusalOf } from '../common/apiMessage';
import { fleetRefusalMessage } from './aircraftRefusal';
import { mhFormatExample } from './fleetRows';
import { readingDraftOf, readingVerdict, type ReadingDraft } from './readingForm';

interface AircraftReadingsCardProps {
  aircraft: AircraftListItemDto;
  mhFormat: MhFormat;
}

export function AircraftReadingsCard({ aircraft, mhFormat }: AircraftReadingsCardProps) {
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState<ReadingDraft>(() => readingDraftOf(aircraft.reading, mhFormat));
  const [done, setDone] = useState<string | null>(null);
  const record = useRecordReading();

  const verdict = readingVerdict(draft);
  const refusal = refusalOf(record.error);
  const failure =
    record.error == null
      ? null
      : ((refusal == null ? null : fleetRefusalMessage(refusal)) ?? errorMessage(record.error));

  const open = (): void => {
    // Świeży szkic przy KAŻDYM otwarciu: stan maszyny mógł się zmienić od poprzedniego.
    setDraft(readingDraftOf(aircraft.reading, mhFormat));
    setDone(null);
    record.reset();
    setAsking(true);
  };

  return (
    <Card title="Poprawa odczytów">
      <p className="hint">
        Nowy stan licznika, paliwa i oleju wpisany ręką administratora - nadrzędny wobec
        ostatniego zdania, dopóki kolejne zdanie nie pokaże wyższego licznika. Pilot
        zobaczy go przy przejęciu jako „odczyty wpisał administrator". Wpis zostaje
        w dzienniku z komentarzem.
      </p>

      {done == null ? null : <Banner tone="ok">{done}</Banner>}

      {asking ? null : (
        <Button variant="default" size="sm" onClick={open}>
          Popraw odczyty
        </Button>
      )}

      {asking ? (
        <div className="confirm">
          <div className="field-pair">
            <Field
              htmlFor="reading-mh"
              label="Motogodziny"
              hint={`Format licznika: ${mhFormatExample(mhFormat)}.`}
            >
              <TextInput
                id="reading-mh"
                mono
                inputMode="decimal"
                value={draft.mh}
                invalid={verdict.invalid.includes('mh')}
                onChange={(event) => setDraft({ ...draft, mh: event.target.value })}
              />
            </Field>
            <Field htmlFor="reading-fuel" label="Paliwo (L)">
              <TextInput
                id="reading-fuel"
                mono
                inputMode="decimal"
                value={draft.fuelL}
                invalid={verdict.invalid.includes('fuelL')}
                onChange={(event) => setDraft({ ...draft, fuelL: event.target.value })}
              />
            </Field>
          </div>

          <Field htmlFor="reading-oil" label="Olej (L)" hint="Puste = stan oleju nieznany.">
            <TextInput
              id="reading-oil"
              mono
              inputMode="decimal"
              value={draft.oilL}
              invalid={verdict.invalid.includes('oilL')}
              onChange={(event) => setDraft({ ...draft, oilL: event.target.value })}
            />
          </Field>

          <Field
            htmlFor="reading-note"
            label="Komentarz"
            hint="Skąd te liczby - zostaje w dzienniku przy wpisie."
          >
            <TextInput
              id="reading-note"
              value={draft.note}
              placeholder="np. odczyt z tarczy po zakończeniu operacji z 3 września"
              invalid={verdict.invalid.includes('note') && draft.note !== ''}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
            />
          </Field>

          {failure == null ? null : (
            <Banner tone="danger" live>
              {failure}
            </Banner>
          )}

          <div className="confirm-actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAsking(false);
                record.reset();
              }}
            >
              Anuluj
            </Button>
            {/* Puste pole wymagane blokuje bez zdania - widać je w formularzu nad
                przyciskiem (issue #55). Odmowa serwera ma zdanie w banerze wyżej. */}
            <Button
              variant="primary"
              size="sm"
              disabled={record.isPending || verdict.body == null}
              onClick={() => {
                if (verdict.body == null) return;
                record.mutate(
                  { id: aircraft.id, body: verdict.body },
                  {
                    onSuccess: (result) => {
                      setAsking(false);
                      setDone(`Zapisano odczyt ${result.aircraft.reg}.`);
                    },
                  },
                );
              }}
            >
              Zapisz odczyt
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
