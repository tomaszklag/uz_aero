/**
 * UZ Aero - panel 2.0: karta samolotu (`#/samoloty/:id`).
 *
 * Trzy sekcje: czym jest maszyna, co z niej wynika dla pilota, olej (opcjonalny).
 * Panel 1.0 miał tu siedem sekcji, w tym kartę „Skutki zmiany" - sześć wierszy
 * porównań, z których przy typowej poprawce cztery mówiły „bez zmian".
 *
 * == PROG PALIWA JAKO JEDNA LINIJKA POD POLEM ==
 * Zmieniona pojemność zmienia próg, od którego serwer zgłasza rozjazd paliwa między
 * lotami. To jedyna konsekwencja, której nie widać z samego pola - więc jest napisana,
 * ale JAKO PODPOWIEDZ przy polu i dopiero wtedy, gdy liczba faktycznie się zmieniła.
 * Liczbę podaje serwer (`GET /fleet/tolerance`), bo panelowi nie wolno mnożyć
 * pojemności po swojemu - druga kopia tej reguły rozjechałaby się z pierwszą.
 */

import { litres } from '@uzaero/format';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import type { AircraftListItemDto } from '../../api/dto';
import {
  useCreateAircraft,
  useDeleteAircraft,
  useFuelTolerance,
  useUpdateAircraft,
} from '../../queries/useFleet';
import { Banner, Button, Card, Drawer, Field, OptionButton, Pill, TextInput } from '../../ui/components';
import { conflictField, errorMessage, refusalOf } from '../common/apiMessage';
import {
  capacityValue,
  createBodyOf,
  deleteBlocker,
  disablesAircraftInUse,
  draftKey,
  draftOf,
  EMPTY_AIRCRAFT,
  hasChanges,
  normalizeReg,
  updateBodyOf,
  verdictOf,
  type AircraftDraft,
} from './aircraftForm';
import {
  aircraftConflictMessage,
  AIRCRAFT_IN_USE,
  fleetRefusalMessage,
} from './aircraftRefusal';
import { mhFormatExample, mhFormatLabel, MH_FORMAT_ORDER } from './fleetRows';

interface AircraftDrawerProps {
  /** `nowy` albo identyfikator jednostki z listy. */
  id: string;
  /** `null` = lista jeszcze nie przyszła; pusta tablica = przyszła i jest pusta. */
  fleet: AircraftListItemDto[] | null;
  listPending: boolean;
  manages: boolean;
  onClose: () => void;
}

export function AircraftDrawer({ id, fleet, listPending, manages, onClose }: AircraftDrawerProps) {
  const creating = id === 'nowy';
  const aircraft = creating ? null : (fleet?.find((item) => item.id === id) ?? null);

  const [draft, setDraft] = useState<AircraftDraft>(EMPTY_AIRCRAFT);
  const [done, setDone] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Szkic przestawia się DOKŁADNIE wtedy, gdy zmienia się tożsamość edytowanej
  // jednostki - także przy jej PIERWSZYM pojawieniu się, bo przy wejściu z linku
  // szuflada montuje się przed listą (`draftKey` opisuje to szerzej). Odświeżenie
  // listy po zapisie klucza nie zmienia, więc nie kasuje wpisanych zmian.
  const synced = useRef<string | null>(null);
  useEffect(() => {
    const key = draftKey(creating, aircraft);
    if (key == null || synced.current === key) return;
    synced.current = key;
    setDraft(aircraft == null ? EMPTY_AIRCRAFT : draftOf(aircraft));
    setDone(null);
    setConfirmDelete(false);
  }, [creating, aircraft]);

  const create = useCreateAircraft();
  const update = useUpdateAircraft();
  const remove = useDeleteAircraft();

  const pending = create.isPending || update.isPending || remove.isPending;
  const error = create.error ?? update.error ?? remove.error;

  const verdict = verdictOf(draft);
  const changed = aircraft == null ? true : hasChanges(aircraft, draft);
  const readOnly = !manages;

  const field = conflictField(error);
  const conflict = aircraftConflictMessage(field);
  const refusal = refusalOf(error);
  const refusalText = refusal == null ? null : fleetRefusalMessage(refusal);
  const generalError =
    error == null || conflict != null || refusalText != null ? null : errorMessage(error);

  // Próg liczy serwer dla wartości WPISYWANEJ, więc pytanie leci przy każdej poprawce
  // liczby - i wraca z cache'u, gdy klient wróci do wartości, o którą już pytał.
  const capacity = capacityValue(draft);
  const tolerance = useFuelTolerance(capacity);
  const capacityChanged = aircraft != null && capacity != null && capacity !== aircraft.capacityL;

  // Wyłączenia jednostki w użyciu serwer i tak odmówi - mówimy to przy przycisku,
  // zanim klient straci wypełniony formularz na rzecz komunikatu o błędzie.
  const inUse = aircraft != null && disablesAircraftInUse(aircraft, draft);

  const save = (): void => {
    if (aircraft == null) {
      create.mutate(createBodyOf(draft), {
        onSuccess: (result) => setDone(`${result.aircraft.reg} jest na liście.`),
      });
      return;
    }
    update.mutate(
      { id: aircraft.id, body: updateBodyOf(aircraft, draft) },
      { onSuccess: (result) => setDone(`Zapisano ${result.aircraft.reg}.`) },
    );
  };

  const blocker = verdict.blocker ?? (inUse ? AIRCRAFT_IN_USE : null);

  return (
    <Drawer
      title={creating ? 'NOWY SAMOLOT' : (aircraft?.reg ?? 'SAMOLOT')}
      sub={
        <>
          {aircraft?.type ?? 'Nowa jednostka floty'}
          {readOnly ? <Pill tone="dim">tylko podgląd</Pill> : null}
        </>
      }
      onClose={onClose}
      footer={
        readOnly ? undefined : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Anuluj
            </Button>
            <Button
              variant="primary"
              onClick={save}
              disabled={pending || !verdict.complete || blocker != null || !changed}
              reason={blocker ?? undefined}
            >
              {pending ? 'Zapisuję…' : creating ? 'Dodaj samolot' : 'Zapisz'}
            </Button>
          </>
        )
      }
    >
      {!creating && aircraft == null && !listPending ? (
        <Card title="Nie ma go na liście">
          <p className="hint">
            Wyszukiwanie albo zawężenie ukrywa tę jednostkę.{' '}
            <Link to="/samoloty">Pokaż wszystkie</Link>
          </p>
        </Card>
      ) : null}

      {generalError == null ? null : (
        <Banner tone="danger" live>
          {generalError}
        </Banner>
      )}
      {refusalText == null ? null : (
        <Banner tone="warn" live>
          {refusalText}
        </Banner>
      )}
      {done == null ? null : (
        <Banner tone="ok" live>
          {done}
        </Banner>
      )}

      <Card title="Samolot">
        <Field htmlFor="reg" label="Rejestracja" hint="Znaki z kadłuba, np. SP-KLM.">
          <TextInput
            id="reg"
            mono
            value={draft.reg}
            disabled={readOnly}
            invalid={verdict.invalid.includes('reg') || field === 'reg'}
            onChange={(event) => setDraft({ ...draft, reg: normalizeReg(event.target.value) })}
          />
        </Field>
        {conflict == null ? null : <p className="hint danger">{conflict}</p>}

        <Field htmlFor="type" label="Typ" hint="np. Cessna 182.">
          <TextInput
            id="type"
            value={draft.type}
            disabled={readOnly}
            invalid={verdict.invalid.includes('type')}
            onChange={(event) => setDraft({ ...draft, type: event.target.value })}
          />
        </Field>

        <div className="field-pair">
          <Field htmlFor="year" label="Rok produkcji" hint="Można zostawić puste.">
            <TextInput
              id="year"
              mono
              inputMode="numeric"
              value={draft.year}
              disabled={readOnly}
              invalid={verdict.invalid.includes('year')}
              onChange={(event) => setDraft({ ...draft, year: event.target.value })}
            />
          </Field>

          <Field
            htmlFor="capacity"
            // Krótko, bo etykieta stoi w PARZE pól: „Paliwo - pojemność zbiorników (L)"
            // łamało się na dwie linie i zsuwało pole niżej niż sąsiednie.
            label="Pojemność paliwa (L)"
            hint={
              capacityChanged ? (
                <>
                  Było {litres(aircraft.capacityL)}.
                  {tolerance.data == null
                    ? null
                    : ` Rozjazd paliwa zgłaszamy od ±${litres(tolerance.data.fuelToleranceL)}` +
                      ` (dziś ±${litres(aircraft.fuelToleranceL)}).`}
                </>
              ) : undefined
            }
          >
            <TextInput
              id="capacity"
              mono
              inputMode="decimal"
              value={draft.capacityL}
              disabled={readOnly}
              invalid={verdict.invalid.includes('capacityL')}
              onChange={(event) => setDraft({ ...draft, capacityL: event.target.value })}
            />
          </Field>
        </div>
      </Card>

      <Card title="Ustawienia dla pilota">
        <span className="label">Licznik motogodzin</span>
        <div className="opt-list" role="radiogroup" aria-label="Format licznika motogodzin">
          {MH_FORMAT_ORDER.map((format) => (
            <OptionButton
              key={format}
              name={`${mhFormatLabel(format)} - ${mhFormatExample(format)}`}
              desc={
                format === 'decimal'
                  ? 'Pilot wpisuje jedną liczbę.'
                  : 'Pilot wpisuje godziny i minuty.'
              }
              selected={draft.mhFormat === format}
              disabled={readOnly}
              onSelect={() => setDraft({ ...draft, mhFormat: format })}
            />
          ))}
        </div>

        <span className="label">Drugi pilot</span>
        <div className="opt-list" role="radiogroup" aria-label="Wymóg drugiego pilota">
          <OptionButton
            name="Nieobowiązkowy"
            desc="Pilot może lecieć sam."
            selected={!draft.dualRequired}
            disabled={readOnly}
            onSelect={() => setDraft({ ...draft, dualRequired: false })}
          />
          <OptionButton
            name="Wymagany"
            desc="Bez drugiego pilota aplikacja nie pozwoli zacząć lotu."
            selected={draft.dualRequired}
            disabled={readOnly}
            onSelect={() => setDraft({ ...draft, dualRequired: true })}
          />
        </div>

        <span className="label">Stan</span>
        <div className="opt-list" role="radiogroup" aria-label="Stan służby">
          <OptionButton
            name="W służbie"
            desc="Pilot widzi go na liście samolotów."
            selected={draft.serviceStatus === 'active'}
            disabled={readOnly}
            onSelect={() => setDraft({ ...draft, serviceStatus: 'active' })}
          />
          <OptionButton
            name="Wyłączony"
            desc="Znika z listy. Zapisane loty zostają."
            selected={draft.serviceStatus === 'disabled'}
            disabled={readOnly}
            onSelect={() => setDraft({ ...draft, serviceStatus: 'disabled' })}
          />
        </div>
      </Card>

      <Card
        title={
          <>
            Olej <Pill tone="dim">opcjonalne</Pill>
          </>
        }
      >
        <div className="field-pair">
          <Field htmlFor="oil-min" label="Minimum przed lotem (L)">
            <TextInput
              id="oil-min"
              mono
              inputMode="decimal"
              value={draft.oilMinL}
              disabled={readOnly}
              invalid={verdict.invalid.includes('oilMinL')}
              onChange={(event) => setDraft({ ...draft, oilMinL: event.target.value })}
            />
          </Field>

          <Field htmlFor="oil-capacity" label="Zbiornik oleju (L)">
            <TextInput
              id="oil-capacity"
              mono
              inputMode="decimal"
              value={draft.oilCapacityL}
              disabled={readOnly}
              invalid={verdict.invalid.includes('oilCapacityL')}
              onChange={(event) => setDraft({ ...draft, oilCapacityL: event.target.value })}
            />
          </Field>
        </div>

        <Field
          htmlFor="oil-norm"
          label="Zużycie z dokumentacji (L/h)"
          hint="Puste pola znaczą, że aplikacja nie będzie o oleju przypominać."
        >
          <TextInput
            id="oil-norm"
            mono
            inputMode="decimal"
            value={draft.oilNormLPerH}
            disabled={readOnly}
            invalid={verdict.invalid.includes('oilNormLPerH')}
            onChange={(event) => setDraft({ ...draft, oilNormLPerH: event.target.value })}
          />
        </Field>
      </Card>

      {aircraft == null || readOnly ? null : (
        <Card title="Usuwanie">
          <div className="access-row">
            <span className="kv-k">Usuń trwale</span>
            {/* Powód blokady stoi W PRZYCISKU, bo stan służby widać z listy i z sekcji
                wyżej. Drugiego warunku (brak historii) panel nie zna - lista nie niesie
                liczby lotów - więc ten wraca odmową serwera z nazwanym powodem. */}
            <Button
              variant="danger"
              size="sm"
              disabled={pending || deleteBlocker(aircraft) != null}
              reason={deleteBlocker(aircraft) ?? undefined}
              onClick={() => setConfirmDelete(true)}
            >
              Usuń samolot
            </Button>
          </div>

          {confirmDelete ? (
            <div className="confirm">
              <p className="confirm-q">Usunąć {aircraft.reg}?</p>
              <p className="hint">
                Zniknie z rejestru floty na zawsze - tego nie da się cofnąć. Jeśli ma
                zapisane loty, zostanie tylko wyłączony.
              </p>
              <div className="confirm-actions">
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Anuluj
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={pending}
                  // Po udanym usunięciu ZAMYKAMY kartę: jednostki już nie ma, a formularz
                  // nad nieistniejącym wierszem obiecuje zapis.
                  onClick={() => remove.mutate(aircraft.id, { onSuccess: onClose })}
                >
                  Usuń samolot
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </Drawer>
  );
}
