/**
 * UZ Aero — panel: SZUFLADA SAMOLOTU (`design/admin/A07a-samolot.html`).
 *
 * **Jedna szuflada, dwa wejścia**: „Dodaj samolot" (pola puste, stan służby domyślnie
 * „w służbie") oraz „Edytuj" z wiersza (pola wypełnione). Nie rozdzielamy tego na
 * ekrany, bo to ta sama decyzja: jaką konfigurację ma ta jednostka.
 *
 * ══ TRZY RZECZY, KTÓRYCH NIE WOLNO TU ZGUBIĆ ══
 *
 *  1. **Skutek widać PRZED zapisem.** Realny scenariusz: administrator poprawia
 *     pojemność z 1257 na 1100 L i musi zobaczyć, że próg flagi `FUEL_MISMATCH`
 *     przesunie się z ±62.9 na ±55.0 L. **Obie liczby przychodzą z serwera** — „przed"
 *     w wierszu listy, „po" z `GET /admin/api/fleet/tolerance`. Panel nie mnoży przez
 *     0.05 i nie może: z domeny wolno mu importować wyłącznie typy.
 *  2. **Panel nigdy nie przepisuje rejestru — ale nowy próg obejmie też pary
 *     historyczne.** Zapisane zdarzenia i wystawione flagi zostają nietknięte (zapis
 *     konfiguracji nie ma pętli po `events` ani po `flags`). Detekcja łańcucha jest
 *     jednak przeliczana z CAŁEJ historii samolotu przy każdej przyjętej paczce
 *     `POST /events` i bierze wtedy pojemność BIEŻĄCĄ — więc po obniżeniu progu
 *     najbliższa synchronizacja tej jednostki potrafi wystawić flagę na parze dni
 *     zamkniętych wcześniej. Sprostowanie z 2026-08-01: „to nie przelicza wstecz" było
 *     prawdą o tym pliku i nieprawdą o systemie.
 *  3. **Telefony zobaczą zmianę przy najbliższym pobraniu danych referencyjnych.**
 *     Zapis podbija znacznik `GET /reference`; samolot z otwartą sesją dokończy dzień
 *     na konfiguracji, którą pobrał rano.
 *
 * Szuflada jest `.tsx` bez decyzji o treści: walidacja, komunikaty, wiersze skutków
 * i dostępność akcji mieszkają w `samolotForm.ts`, `samolotImpact.ts`
 * i `samolotActions.ts`, które mają testy w Node.
 */

import { useRef, useState } from 'react';

import type { AircraftListItemDto, ApiErrorDto, Capability } from '../../api/dto';
import { isHttpError } from '../../api/httpClient';
import { useFuelTolerance } from '../../queries/useFleet';
import { useCreateAircraft, useUpdateAircraft } from '../../queries/useFleetCommands';
import {
  Banner,
  Button,
  Card,
  Drawer,
  Field,
  KeyValue,
  LinkButton,
  OptionButton,
  OptionGrid,
  OptionList,
  Pill,
  TextInput,
} from '../../ui/components';
import { targetHref } from '../audyt/audytFilters';
import { toleranceText } from './flotaRows';
import {
  disableAction,
  editAction,
  fleetFailure,
  missingAircraftCopy,
  saveCopy,
  type FleetLoad,
} from './samolotActions';
import {
  DUAL_OPTIONS,
  EMPTY_DRAFT,
  MH_FORMAT_OPTIONS,
  SERVICE_OPTIONS,
  createBody,
  draftOf,
  formState,
  hasChanges,
  parseCapacity,
  updateBody,
  type SamolotDraft,
} from './samolotForm';
import { impactCard } from './samolotImpact';

interface SamolotDrawerProps {
  /** Jednostka z listy; `null` przy dodawaniu nowej albo nieznanym identyfikatorze. */
  aircraft: AircraftListItemDto | null;
  creating: boolean;
  capabilities: readonly Capability[] | undefined;
  /**
   * Stan pobrania floty — TRZY wartości, nie `boolean`. Szuflada musi odróżnić „lista
   * jeszcze leci" od „lista padła" od „lista jest, jednostki w niej nie ma"; przy
   * dwóch stanach awaria pobrania mówiła człowiekowi „zdejmij filtr".
   */
  load: FleetLoad;
  onClose: () => void;
}

/**
 * Szuflada jest KLUCZOWANA identyfikatorem jednostki w `FlotaScreen`, więc zmiana
 * samolotu montuje ją od nowa i żaden szkic nie przechodzi między maszynami.
 *
 * Tutaj rozstrzyga się druga połowa tej samej sprawy: **wiersz może zniknąć spod
 * szuflady, która została otwarta** — lista jest zawężona filtrem, a zapis potrafi
 * wyrzucić jednostkę spod bieżącego chipa (wyłączenie ze służby przy chipie „W służbie"
 * robi to zawsze). Wtedy `props.aircraft` staje się `null`, a odmontowanie szuflady
 * zabrałoby ze sobą potwierdzenie właśnie wykonanej zmiany.
 */
export function SamolotDrawer(props: SamolotDrawerProps) {
  const known = useRef(props.aircraft);
  if (props.aircraft != null) known.current = props.aircraft;

  if (props.creating) return <NewAircraft {...props} />;
  if (known.current == null) {
    return <MissingAircraft load={props.load} onClose={props.onClose} />;
  }
  return <ExistingAircraft {...props} initial={known.current} />;
}

/**
 * Głęboki link do jednostki, której nie ma na liście.
 *
 * TRZY przyczyny i wszystkie trzeba rozróżnić: lista jeszcze się nie pobrała (to nie
 * jest błąd), lista PADŁA (wtedy nie wiadomo nic — a do 2026-08-01 szuflada mówiła
 * wtedy „zdejmij filtr", czyli kazała poprawiać zawężenie, którego serwer nie zdążył
 * zastosować) albo jednostka wypadła spod zawężenia — bo trasy `GET /fleet/:id` nie ma,
 * a lista jest jedynym źródłem wierszy. Mockup nie ma na to stanu; projektujemy go
 * w duchu reszty panelu: konkretnie i z podaniem, co dalej. Treść trzech wariantów
 * mieszka w `samolotActions.ts` (`missingAircraftCopy`) i ma test w Node, a nie tutaj.
 */
function MissingAircraft({ load, onClose }: { load: FleetLoad; onClose: () => void }) {
  const copy = missingAircraftCopy(load);
  return (
    <Drawer
      title="SAMOLOT"
      sub={copy.sub}
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Wróć do listy
        </Button>
      }
    >
      <Banner tone={copy.tone}>
        <b>{copy.title}</b> {copy.note}
      </Banner>
    </Drawer>
  );
}

/** Szuflada „Dodaj samolot": pełna konfiguracja od zera. */
function NewAircraft({ capabilities, onClose }: SamolotDrawerProps) {
  const [draft, setDraft] = useState<SamolotDraft>(EMPTY_DRAFT);
  const create = useCreateAircraft();

  const edit = editAction(capabilities);
  const form = formState(draft);
  const failure = create.isError ? failureOf(create.error) : null;
  const done = create.data != null;
  // Próg dla wpisywanej pojemności — ta sama trasa, co przy edycji. Nowa jednostka nie
  // ma „przed", więc karta pokazuje samą wartość docelową.
  const tolerance = useFuelTolerance(parseCapacity(draft.capacity));

  return (
    <Drawer
      wide
      title="NOWY SAMOLOT"
      sub="dane referencyjne — z nich aplikacja bierze listę wyboru i wejścia reguł"
      onClose={onClose}
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>
            Gotowe — wróć do listy
          </Button>
        ) : (
          <>
            {edit.reason == null ? null : <span className="drawer-note">{edit.reason}</span>}
            {form.reason == null ? null : <span className="drawer-note">{form.reason}</span>}
            <Button variant="ghost" onClick={onClose}>
              Anuluj
            </Button>
            <Button
              variant="primary"
              disabled={!edit.enabled || !form.ok || create.isPending}
              onClick={() => create.mutate(createBody(draft))}
            >
              {create.isPending ? 'Zapisuję…' : 'Dodaj samolot'}
            </Button>
          </>
        )
      }
    >
      {create.data == null ? null : <SavedBanner kind="create" reg={create.data.aircraft.reg} />}
      {failure == null ? null : <FailureBanner failure={failure} />}

      {done ? null : (
        <>
          <IdentityFields draft={draft} onChange={setDraft} disabled={!edit.enabled} form={form} />
          <MhFormatChoice draft={draft} onChange={setDraft} disabled={!edit.enabled} />
          <DualChoice draft={draft} onChange={setDraft} disabled={!edit.enabled} />
          <ServiceChoice draft={draft} onChange={setDraft} disabled={!edit.enabled} reason={null} />

          <Card title="Co ta konfiguracja włącza" actions={<Pill tone="dim">wejścia reguł</Pill>}>
            {/* Zapis progu składa `toleranceText`, a nie interpolacja w JSX-ie: ten sam
                napis ma wyjść tutaj i w kolumnie tabeli, inaczej „±62.85 L" obok
                „±62.9 L" wygląda na dwie różne liczby. */}
            <KeyValue
              label="Próg FUEL_MISMATCH"
              value={tolerance.data == null ? '—' : toleranceText(tolerance.data.fuelToleranceL)}
              unit={tolerance.data == null ? 'liczy serwer z pojemności' : 'większa z: 10 L albo 5%'}
              {...(tolerance.data == null ? {} : { tone: 'amber' as const })}
            />
            <span className="hint">
              <b>Pojemność</b> steruje tolerancją flagi <code>FUEL_MISMATCH</code> i ogranicza
              wpis tankowania w aplikacji — stan po tankowaniu nie może jej przekroczyć.{' '}
              <b>Format motogodzin</b> zmienia sam sposób wpisywania na ekranie preflight:
              jedno pole dziesiętne albo dwa pola godziny i minuty.
            </span>
          </Card>

          <TelephonesBanner />
        </>
      )}
    </Drawer>
  );
}

/** Szuflada edycji: konfiguracja + karta „Skutki zmiany" + dwa banery skutków. */
function ExistingAircraft({
  aircraft: fromList,
  initial,
  capabilities,
  onClose,
}: SamolotDrawerProps & { initial: AircraftListItemDto }) {
  const [draft, setDraft] = useState<SamolotDraft>(() => draftOf(initial));
  const update = useUpdateAircraft();

  // Wiersz listy, dopóki na niej jest; potem skutek ostatniego zapisu. Bez tego zapis,
  // który wyrzuca jednostkę spod bieżącego chipa, zostawiałby szufladę ze stanem
  // sprzed zmiany.
  const aircraft = fromList ?? update.data?.aircraft ?? initial;

  const edit = editAction(capabilities);
  const disable = disableAction(aircraft, capabilities);
  const form = formState(draft);
  const changed = hasChanges(aircraft, draft);
  const failure = update.isError ? failureOf(update.error) : null;

  const capacityL = parseCapacity(draft.capacity);
  const tolerance = useFuelTolerance(capacityL);
  const impact = impactCard(
    aircraft,
    draft,
    // Próg „po" bierzemy wyłącznie wtedy, gdy serwer policzył go dla TEJ pojemności —
    // odpowiedź dla poprzedniej wartości pola byłaby liczbą, która nie nadąża.
    tolerance.data?.capacityL === capacityL ? tolerance.data.fuelToleranceL : null,
  );

  // Wyłączenie ze służby jest częścią TEGO formularza (mockup A07a), więc blokada
  // „otwarty dzień" musi gasić przycisk zapisu tylko wtedy, gdy szkic faktycznie
  // próbuje wyłączyć jednostkę. Zmiana pojemności przy otwartym dniu jest dozwolona.
  const disabling = draft.serviceStatus === 'disabled' && aircraft.serviceStatus !== 'disabled';
  const blocked = disabling && !disable.enabled;

  return (
    <Drawer
      wide
      title={`${aircraft.reg} · EDYCJA`}
      sub={
        <>
          {aircraft.type} · id {aircraft.id} · dane referencyjne
        </>
      }
      onClose={onClose}
      footer={
        <>
          {edit.reason == null ? null : <span className="drawer-note">{edit.reason}</span>}
          {blocked && disable.reason != null ? (
            <span className="drawer-note">{disable.reason}</span>
          ) : null}
          {form.reason == null ? null : <span className="drawer-note">{form.reason}</span>}
          <Button variant="ghost" onClick={onClose}>
            Anuluj
          </Button>
          <Button
            variant="primary"
            disabled={!edit.enabled || !form.ok || !changed || blocked || update.isPending}
            onClick={() => update.mutate({ id: aircraft.id, body: updateBody(aircraft, draft) })}
          >
            {update.isPending ? 'Zapisuję…' : 'Zapisz zmiany'}
          </Button>
        </>
      }
    >
      {update.data == null ? null : <SavedBanner kind="update" reg={update.data.aircraft.reg} />}
      {failure == null ? null : <FailureBanner failure={failure} />}

      <IdentityFields draft={draft} onChange={setDraft} disabled={!edit.enabled} form={form} />
      <MhFormatChoice draft={draft} onChange={setDraft} disabled={!edit.enabled} />
      <DualChoice draft={draft} onChange={setDraft} disabled={!edit.enabled} />
      <ServiceChoice
        draft={draft}
        onChange={setDraft}
        disabled={!edit.enabled}
        reason={disable.enabled ? null : disable.reason}
      />

      <Card
        title="Skutki zmiany"
        actions={
          <Pill tone={impact.changeCount === 0 ? 'dim' : 'amber'}>
            {impact.changeCount === 0 ? 'bez zmian' : impact.changeLabel}
          </Pill>
        }
      >
        {impact.rows.map((row) => (
          <KeyValue
            key={row.label}
            label={row.label}
            value={row.value}
            {...(row.unit == null ? {} : { unit: row.unit })}
            {...(row.tone == null ? {} : { tone: row.tone })}
          />
        ))}
        <span className="hint">
          <b>Pojemność</b> steruje tolerancją flagi <code>FUEL_MISMATCH</code>: większa z dwóch
          wartości — <b>10 L</b> albo <b>5% pojemności</b>. Po zapisie rozbieżność między
          odczytem paliwomierza a przekazaniem będzie flagowana od nowego progu. Ta sama liczba
          ogranicza wpis tankowania w aplikacji — stan po tankowaniu nie może przekroczyć
          pojemności. <b>Obie liczby progu liczy serwer</b>, żeby na dwóch ekranach nie wyszły
          dwie różne wartości tego samego.
        </span>
        <span className="hint">
          <b>Format motogodzin</b> zmienia sam sposób wpisywania na ekranie preflight: jedno
          pole dziesiętne albo dwa pola godziny i minuty. Wartości już zapisane zostają
          w formacie, w jakim je wpisano.
        </span>
      </Card>

      <Banner tone="danger">
        <b>Sprostowanie z 2026-08-01: nowy próg obejmie także dni już zamknięte.</b> Zapisane
        zdarzenia zostają dokładnie takie, jakie przyszły z telefonu, a <b>panel nigdy nie
        przepisuje rejestru</b> — flagi wystawione wcześniej zachowują próg, przy którym
        powstały, i żadna z nich nie zniknie. Ale rozbieżności paliwa serwer szuka od nowa
        w <b>całej historii tego samolotu</b> przy każdej przyjętej paczce zdarzeń, biorąc
        pojemność aktualną — więc po obniżeniu progu najbliższa synchronizacja tej jednostki
        potrafi wystawić <b>nową flagę na parze dni sprzed zmiany</b>. W drugą stronę to nie
        działa: podniesienie pojemności nie zdejmuje flag, które przy nowym progu by nie
        powstały. Zmiana pojemności jest więc decyzją o tym, co jeszcze wyjdzie z przeszłości,
        a nie tylko o przyszłości.
      </Banner>

      <TelephonesBanner />

      <Card title="Ślad i historia">
        <KeyValue
          label="Identyfikator jednostki"
          value={aircraft.id}
          unit="zdarzenia wiążą się z nim, nie z rejestracją"
        />
        <KeyValue
          label="Historia zmian"
          value={
            <LinkButton to={targetHref('aircraft', aircraft.id)} variant="ghost" size="sm">
              wpisy w dzienniku audytu → A09
            </LinkButton>
          }
          unit="kto, kiedy i co zmienił"
        />
        <span className="hint">
          Zmiana rejestracji <b>nie przepisuje historii</b>: zdarzenia wiążą się z{' '}
          <code>id</code> jednostki. W kartach arkusza wyeksportowanych wcześniej zostaje jednak
          stara rejestracja — dlatego zmieniaj ją tylko przy faktycznej zmianie znaków na
          kadłubie.
        </span>
      </Card>
    </Drawer>
  );
}

/** Rejestracja, typ, rok i pojemność — wspólne dla obu wariantów szuflady. */
function IdentityFields({
  draft,
  onChange,
  disabled,
  form,
}: {
  draft: SamolotDraft;
  onChange: (next: SamolotDraft) => void;
  disabled: boolean;
  form: ReturnType<typeof formState>;
}) {
  return (
    <Card title="Jednostka">
      <Field
        htmlFor="samolot-reg"
        label="Rejestracja"
        hint={
          form.reg.message ?? (
            <>
              Unikalna w całym systemie. Widoczna w logu dnia, w nazwie karty eksportu (
              <code>2026-07-30_SP-KLM</code>) i w każdej fladze — zmieniaj tylko przy faktycznej
              zmianie znaków na kadłubie. Zapisujemy ją WERSALIKAMI niezależnie od tego, jak ją
              wpiszesz.
            </>
          )
        }
      >
        <TextInput
          id="samolot-reg"
          mono
          value={draft.reg}
          disabled={disabled}
          invalid={draft.reg.length > 0 && !form.reg.ok}
          onChange={(event) => onChange({ ...draft, reg: event.target.value })}
        />
      </Field>

      <Field htmlFor="samolot-typ" label="Typ" hint={form.type.message}>
        <TextInput
          id="samolot-typ"
          value={draft.type}
          disabled={disabled}
          invalid={draft.type.length > 0 && !form.type.ok}
          onChange={(event) => onChange({ ...draft, type: event.target.value })}
        />
      </Field>

      <OptionGrid>
        <Field
          htmlFor="samolot-rok"
          label="Rok produkcji"
          hint={form.year.message ?? 'Pole może zostać puste — tabliczka bez daty to realny przypadek.'}
        >
          <TextInput
            id="samolot-rok"
            mono
            value={draft.year}
            disabled={disabled}
            invalid={draft.year.length > 0 && !form.year.ok}
            onChange={(event) => onChange({ ...draft, year: event.target.value })}
          />
        </Field>

        <Field
          htmlFor="samolot-pojemnosc"
          label="Pojemność zbiorników (L)"
          hint={form.capacity.message ?? 'Z niej wynika próg flagi paliwa i limit wpisu tankowania.'}
        >
          <TextInput
            id="samolot-pojemnosc"
            mono
            value={draft.capacity}
            disabled={disabled}
            invalid={draft.capacity.length > 0 && !form.capacity.ok}
            onChange={(event) => onChange({ ...draft, capacity: event.target.value })}
          />
        </Field>
      </OptionGrid>
    </Card>
  );
}

/** Format licznika — lista kart, jedyny dozwolony „select" w produkcie. */
function MhFormatChoice({
  draft,
  onChange,
  disabled,
}: {
  draft: SamolotDraft;
  onChange: (next: SamolotDraft) => void;
  disabled: boolean;
}) {
  return (
    <div className="field">
      <span className="label">Format motogodzin</span>
      <OptionList ariaLabel="Format motogodzin">
        {MH_FORMAT_OPTIONS.map((option) => (
          <OptionButton
            key={option.id}
            name={option.name}
            desc={option.desc}
            selected={draft.mhFormat === option.id}
            disabled={disabled}
            onSelect={() => onChange({ ...draft, mhFormat: option.id })}
          />
        ))}
      </OptionList>
    </div>
  );
}

function DualChoice({
  draft,
  onChange,
  disabled,
}: {
  draft: SamolotDraft;
  onChange: (next: SamolotDraft) => void;
  disabled: boolean;
}) {
  return (
    <div className="field">
      <span className="label">Drugi pilot (Dual)</span>
      <OptionList ariaLabel="Wymóg drugiego pilota">
        {DUAL_OPTIONS.map((option) => (
          <OptionButton
            key={option.id}
            name={option.name}
            desc={option.desc}
            selected={draft.dualRequired === (option.id === 'yes')}
            disabled={disabled}
            onSelect={() => onChange({ ...draft, dualRequired: option.id === 'yes' })}
          />
        ))}
      </OptionList>
    </div>
  );
}

/**
 * Stan służby. `reason` gasi WYŁĄCZNIE kartę „wyłączony": jednostka z otwartym dniem
 * nie może zniknąć z listy wyboru, ale wszystko inne w tym formularzu wolno zmieniać.
 */
function ServiceChoice({
  draft,
  onChange,
  disabled,
  reason,
}: {
  draft: SamolotDraft;
  onChange: (next: SamolotDraft) => void;
  disabled: boolean;
  reason: string | null;
}) {
  return (
    <div className="field">
      <span className="label">Stan służby</span>
      <OptionList ariaLabel="Stan służby">
        {SERVICE_OPTIONS.map((option) => (
          <OptionButton
            key={option.id}
            name={option.name}
            desc={option.desc}
            selected={draft.serviceStatus === option.id}
            disabled={disabled || (option.id === 'disabled' && reason != null)}
            onSelect={() => onChange({ ...draft, serviceStatus: option.id })}
          />
        ))}
      </OptionList>
      {reason == null ? null : <span className="hint">{reason}</span>}
    </div>
  );
}

/** Jedyny kanał, którym konfiguracja wychodzi z panelu — i ekran to mówi wprost. */
function TelephonesBanner() {
  return (
    <Banner tone="status">
      <b>Telefony zobaczą zmianę przy najbliższym pobraniu danych referencyjnych.</b> Zapis
      podbija znacznik zasobu <code>GET /reference</code>, a aplikacja odpytuje go przy starcie
      dnia. Samolot z <b>otwartą sesją dokończy dzień</b> na konfiguracji, którą pobrał rano —
      i to jest zachowanie zamierzone, nie opóźnienie.
    </Banner>
  );
}

function SavedBanner({ kind, reg }: { kind: 'create' | 'update'; reg: string }) {
  const copy = saveCopy(kind, reg);
  return (
    <Banner tone="ok" live>
      <b>{copy.title}</b> {copy.note}
    </Banner>
  );
}

function FailureBanner({ failure }: { failure: ReturnType<typeof fleetFailure> }) {
  return (
    <Banner tone={failure.tone} live>
      <b>{failure.title}</b> {failure.detail}
    </Banner>
  );
}

/**
 * `HttpError` → komunikat. Rozpakowanie wyjątku należy do ekranu, a nie do modułu
 * czystego: `fleetFailure` przyjmuje STATUS i CIAŁO, żeby dało się je przetestować
 * bez klienta HTTP.
 */
function failureOf(error: unknown) {
  if (isHttpError(error)) return fleetFailure(error.status, error.body as ApiErrorDto);
  return fleetFailure(null, null);
}
