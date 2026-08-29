/**
 * UZ Aero - panel: SZUFLADA KONTA (`design/admin/A06a-konto.html`).
 *
 * **Jedna szuflada, trzy wejścia** - dokładnie jak mówi mockup: „Nowe konto"
 * (wszystkie pola aktywne), „Szczegóły" z wiersza (edycja tożsamości i roli) oraz
 * „Reset hasła" z wiersza (`?akcja=haslo`: tożsamość zablokowana, aktywna sekcja
 * hasła). Nie rozdzielamy tego na ekrany, bo to ta sama decyzja: kto ma dostęp
 * i z jakim hasłem wchodzi.
 *
 * ══ TRZY RZECZY, KTÓRYCH NIE WOLNO TU ZGUBIĆ ══
 *
 *  1. **Hasła nie ma w formularzu i nigdy nie będzie.** Generuje je serwer i oddaje
 *     JEDEN RAZ w odpowiedzi; panel pokazuje wartość w szufladzie i zapomina razem
 *     z jej zamknięciem. Nie ma trasy „pokaż ponownie" - kolejny reset generuje nowe.
 *  2. **Deaktywacja zrywa sesje.** Nie „wyloguje przy najbliższej okazji": serwer
 *     kasuje refresh tokeny w tej samej transakcji, a panel pokazuje ICH LICZBĘ,
 *     bo to jest odpowiedź na pytanie „czy ktoś jeszcze na tym koncie pracował".
 *  3. **Odmowa niesie ZASADĘ, nie kod.** `last_admin` znaczy „klub zostałby bez
 *     nikogo, kto zarządza kontami" - i tak ma to przeczytać człowiek, bo to jest
 *     ta chwila, w której sięga się po `UPDATE` w psql.
 *
 * Szuflada jest `.tsx` bez decyzji o treści: walidacja, komunikaty i dostępność akcji
 * mieszkają w `accountForm.ts` i `accountActions.ts`, które mają testy w Node.
 */

import { useRef, useState } from 'react';

import type { ApiErrorDto, Capability, PilotChangeDto, PilotListItemDto } from '../../api/dto';
import { isHttpError } from '../../api/httpClient';
import {
  useCreatePilot,
  useResetPilotPassword,
  useSetPilotActive,
  useUpdatePilot,
} from '../../queries/usePilotCommands';
import {
  Banner,
  Button,
  Card,
  Drawer,
  Field,
  KeyValue,
  LinkButton,
  OptionButton,
  OptionList,
  Pill,
  TextInput,
} from '../../ui/components';
import { targetHref } from '../audit/auditFilters';
import { drawerAccount } from './account';
import {
  accountFailure,
  activeAction,
  activeChangeCopy,
  editAction,
  resetAction,
  secretCopy,
} from './accountActions';
import {
  ROLE_OPTIONS,
  createBody,
  draftOf,
  formState,
  hasChanges,
  updateBody,
  type AccountDraft,
} from './accountForm';

interface AccountDrawerProps {
  /** Konto z listy; `null` przy zakładaniu nowego albo przy nieznanym identyfikatorze. */
  pilot: PilotListItemDto | null;
  creating: boolean;
  /** Wejście „Reset hasła" - tożsamość zablokowana (mockup A06a). */
  passwordMode: boolean;
  capabilities: readonly Capability[] | undefined;
  /** Identyfikator konta ZALOGOWANEGO - do blokady „nie odetniesz sam siebie". */
  selfId: string | null;
  loading: boolean;
  onClose: () => void;
}

/**
 * Szuflada jest KLUCZOWANA identyfikatorem konta w `PilotsScreen` - więc zmiana konta
 * montuje ją od nowa i żaden szkic ani hasło nie przechodzi między kontami.
 *
 * Tutaj rozstrzyga się druga połowa tej samej sprawy: **wiersz może zniknąć spod
 * szuflady, która została otwarta.** Lista jest zawężona filtrem i wyszukiwaniem, a
 * mutacja potrafi wyrzucić konto spod bieżącego chipa (deaktywacja przy chipie
 * „Aktywni" robi to zawsze). Wtedy `props.pilot` staje się `null` - a odmontowanie
 * szuflady zabrałoby ze sobą jednorazowe hasło i potwierdzenie akcji nieodwracalnej.
 * Dlatego, gdy wiersz był już raz znany, `ExistingAccount` zostaje zamontowany, a co
 * ma pokazać, rozstrzyga czysty `drawerAccount`.
 */
export function AccountDrawer(props: AccountDrawerProps) {
  // Ostatni wiersz, jaki lista pokazała dla TEGO konta (szuflada jest kluczowana jego
  // identyfikatorem, więc ref nie może przenieść wartości na inne konto). Służy
  // wyłącznie do pierwszego montażu - szkic formularza powstaje z jego wartości.
  const known = useRef(props.pilot);
  if (props.pilot != null) known.current = props.pilot;

  if (props.creating) return <NewAccount {...props} />;
  if (known.current == null) {
    return <MissingAccount loading={props.loading} onClose={props.onClose} />;
  }
  return <ExistingAccount {...props} initial={known.current} />;
}

/**
 * Głęboki link do konta, którego nie ma na liście.
 *
 * Dwie przyczyny i obie trzeba rozróżnić: lista jeszcze się nie pobrała (wtedy to nie
 * jest błąd) albo konto wypadło spod zawężenia - bo trasa `GET /pilots/:id` nie
 * istnieje, a lista jest jedynym źródłem wierszy. Mockup nie ma na to stanu;
 * projektujemy go w duchu reszty panelu: konkretnie i z podaniem, co dalej.
 */
function MissingAccount({ loading, onClose }: { loading: boolean; onClose: () => void }) {
  return (
    <Drawer
      title="KONTO PILOTA"
      sub={loading ? 'wczytywanie listy kont…' : 'nie ma go w bieżącym zawężeniu listy'}
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Wróć do listy
        </Button>
      }
    >
      {loading ? (
        <Banner tone="status">
          <b>Lista kont jeszcze się pobiera.</b> Szuflada otwiera wiersz, który jest na liście -
          serwer nie ma osobnej trasy dla pojedynczego konta, bo klub ma ich kilkanaście
          i pobranie całości jest tańsze niż druga trasa.
        </Banner>
      ) : (
        <Banner tone="warn">
          <b>Tego konta nie ma w bieżącym zawężeniu.</b> Zdejmij filtr albo wyszukiwanie na
          liście i otwórz konto z tabeli. Kont nie kasujemy - deaktywacja zostawia wiersz -
          więc konto najczęściej po prostu wypadło spod chipa, którym patrzysz.
        </Banner>
      )}
    </Drawer>
  );
}

/** Szuflada „Nowe konto": tożsamość + rola, hasło pokazane RAZ po zapisie. */
function NewAccount({ capabilities, onClose }: AccountDrawerProps) {
  const [draft, setDraft] = useState<AccountDraft>({
    name: '',
    code: '',
    email: '',
    role: 'pilot',
  });
  const create = useCreatePilot();

  const edit = editAction(capabilities);
  const form = formState(draft);
  const failure = create.isError ? failureOf(create.error) : null;
  const secret = create.data ?? null;
  const done = secret != null;

  return (
    <Drawer
      wide
      title="NOWE KONTO PILOTA"
      sub="konto zakłada administrator - aplikacja nie ma samodzielnej rejestracji"
      onClose={onClose}
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>
            Gotowe - wróć do listy
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
              {create.isPending ? 'Zakładam…' : 'Utwórz konto'}
            </Button>
          </>
        )
      }
    >
      {secret == null ? null : <SecretCard kind="create" secret={secret} />}
      {failure == null ? null : <FailureBanner failure={failure} />}

      {done ? null : (
        <>
          <Banner tone="status">
            <b>Hasło startowe wygeneruje serwer przy zapisie</b> i pokaże je tutaj{' '}
            <b>jeden raz</b>. Panel nigdy hasła nie wysyła i nie ma pola, w które dałoby się je
            wpisać - dlatego w tym formularzu ustawiasz wyłącznie tożsamość i rolę.
          </Banner>

          <IdentityFields draft={draft} onChange={setDraft} disabled={!edit.enabled} />
          <RoleChoice
            role={draft.role}
            disabled={!edit.enabled}
            onSelect={(role) => setDraft({ ...draft, role })}
          />
        </>
      )}
    </Drawer>
  );
}

/**
 * Szuflada istniejącego konta: tożsamość, rola, hasło, strefa deaktywacji.
 *
 * `initial` to wiersz Z CHWILI OTWARCIA - jedyne, do czego służy, to szkic formularza
 * i ostatnia deska ratunku, gdy konto wypadło z zawężenia, zanim cokolwiek zmieniono
 * (np. człowiek przestawił chip przy otwartej szufladzie). Co szuflada POKAZUJE,
 * rozstrzyga `drawerAccount`: wiersz listy, dopóki na niej jest, a potem skutek
 * najświeższej mutacji.
 */
function ExistingAccount({
  pilot: fromList,
  initial,
  passwordMode,
  capabilities,
  selfId,
  onClose,
}: AccountDrawerProps & { initial: PilotListItemDto }) {
  const [draft, setDraft] = useState<AccountDraft>(() => draftOf(initial));

  const update = useUpdatePilot();
  const reset = useResetPilotPassword();
  const setActive = useSetPilotActive();

  // Skutki udanych mutacji razem z chwilą, w której serwer odpowiedział - kolejność
  // rozstrzyga `drawerAccount`, bo dwie różne mutacje oddają dwa różne stany konta.
  const pilot =
    drawerAccount(fromList, [
      update.data == null ? null : { pilot: update.data.pilot, at: update.submittedAt },
      reset.data == null ? null : { pilot: reset.data.pilot, at: reset.submittedAt },
      setActive.data == null ? null : { pilot: setActive.data.pilot, at: setActive.submittedAt },
    ]) ?? initial;

  const edit = editAction(capabilities);
  const resetGate = resetAction(pilot, capabilities);
  const activeGate = activeAction(pilot, capabilities, selfId);

  const form = formState(draft);
  const changed = hasChanges(pilot, draft);
  const secret = reset.data ?? null;

  const failure =
    update.isError || reset.isError || setActive.isError
      ? failureOf(update.error ?? reset.error ?? setActive.error)
      : null;

  const busy = update.isPending || reset.isPending || setActive.isPending;
  // Tożsamość jest zablokowana w wariancie „Reset hasła" (mockup A06a) - po to, żeby
  // dwie decyzje nie jechały jednym kliknięciem: reset hasła i zmiana nazwiska to
  // różne wpisy w dzienniku audytu i różne rozmowy z pilotem.
  const identityLocked = passwordMode || !edit.enabled;

  return (
    <Drawer
      wide
      title={pilot.name.toUpperCase()}
      sub={
        <>
          {pilot.code} · {pilot.email ?? 'bez e-maila'} ·{' '}
          {pilot.active ? 'konto aktywne' : 'konto nieaktywne'}
        </>
      }
      onClose={onClose}
      footer={
        <>
          {identityLocked && passwordMode ? (
            <span className="drawer-note">tożsamość zablokowana - to wejście „reset hasła"</span>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Zamknij
          </Button>
          <Button
            variant="primary"
            disabled={identityLocked || !form.ok || !changed || busy}
            onClick={() => update.mutate({ id: pilot.id, body: updateBody(pilot, draft) })}
          >
            {update.isPending ? 'Zapisuję…' : 'Zapisz zmiany'}
          </Button>
        </>
      }
    >
      {secret == null ? null : <SecretCard kind="reset" secret={secret} />}
      {failure == null ? null : <FailureBanner failure={failure} />}
      {!update.isSuccess ? null : (
        <Banner tone="ok" live>
          <b>Zapisano zmiany konta.</b> Wpis w dzienniku audytu powstał tą samą transakcją -
          widać w nim, co dokładnie się zmieniło.
        </Banner>
      )}
      {setActive.data == null ? null : <ActiveChangeBanner change={setActive.data} />}

      <Banner tone="status">
        <b>Jedna szuflada, trzy wejścia.</b> „Szczegóły" - tożsamość i rola do zmiany.{' '}
        „Reset hasła" z wiersza listy - tożsamość zablokowana, aktywna tylko sekcja hasła
        startowego. „Nowe konto" - wszystkie pola puste. To ta sama decyzja: kto ma dostęp
        i z jakim hasłem wchodzi.
      </Banner>

      <IdentityFields draft={draft} onChange={setDraft} disabled={identityLocked} />
      <RoleChoice
        role={draft.role}
        disabled={identityLocked}
        onSelect={(role) => setDraft({ ...draft, role })}
      />

      <Card
        title="Hasło startowe"
        actions={<Pill tone="amber">pokazane raz</Pill>}
      >
        <span className="hint">
          Hasło generuje <b>serwer</b> i pokazuje je w tym oknie <b>jeden raz</b>. Nie trafia
          do adresu URL, do logów serwera ani do dziennika audytu - w bazie zostaje wyłącznie
          hash (<code>password_hash</code>), a audyt zapisuje sam fakt: kto, komu i kiedy
          ustawił hasło. Po zamknięciu szuflady nie da się go odczytać; jedyne wyjście to
          kolejny reset.
        </span>
        <div className="field-row">
          <Button
            variant="ok"
            disabled={!resetGate.enabled || busy}
            onClick={() => reset.mutate(pilot.id)}
          >
            {reset.isPending ? 'Generuję…' : 'Wygeneruj nowe hasło'}
          </Button>
          {resetGate.reason == null ? null : <span className="hint">{resetGate.reason}</span>}
        </div>
        {/* Dwa rodzaje sesji, dwa różne mechanizmy - i dlatego stoją tu osobno.
            Refresh tokeny telefonu serwer KASUJE z tabeli i potrafi policzyć; sesji
            panelu nie ma w żadnej tabeli (podpisany JWT w ciasteczku), więc odbiera ją
            znacznik unieważnienia poświadczeń. Jedno zdanie „unieważnione" o obu
            naraz było przed 2026-08-01 obietnicą bez pokrycia po stronie panelu. */}
        <KeyValue label="Sesje telefonu" value="skasowane" tone="amber" unit="refresh tokeny" />
        <KeyValue
          label="Sesja panelu"
          value="unieważniona"
          tone="amber"
          unit="token sprzed resetu nie przechodzi bramy"
        />
        <KeyValue label="PIN na telefonie" value="do ustawienia od nowa" tone="amber" />
        <KeyValue label="Zdarzenia w rejestrze" value="bez zmian" tone="green" />
        <span className="hint">
          Reset wymaga od pilota <b>pełnego logowania przy sieci</b> - to jedyny świadomy
          wyjątek od offline-first. Nie resetuj hasła pilotowi, który jest w tej chwili
          w powietrzu z niepustym outboxem.
        </span>
      </Card>

      <Card
        title={pilot.active ? 'Strefa deaktywacji' : 'Przywrócenie dostępu'}
        actions={<Pill tone={pilot.active ? 'red' : 'dim'}>{pilot.active ? 'aktywne' : 'nieaktywne'}</Pill>}
      >
        {pilot.active ? (
          <Banner tone="warn">
            <b>Konto nieaktywne nie loguje się w aplikacji ani w panelu</b> - znika też z listy
            wyboru Duala, a jego <b>aktywne sesje są zrywane w tej samej transakcji</b>. Ale{' '}
            <b>jego zdarzenia zostają w rejestrze</b> (append-only, nic tu nie kasujemy) i dalej
            liczą się w statystykach, w kartach dnia i w łańcuchu motogodzin samolotu.
            Deaktywacja odbiera dostęp, nie zmienia historii.
          </Banner>
        ) : (
          <Banner tone="status">
            <b>Konto jest wyłączone.</b> Aktywacja przywraca logowanie tym samym hasłem, które
            konto miało wcześniej. Jeśli pilot go nie pamięta - najpierw aktywuj, potem
            zresetuj hasło (reset konta nieaktywnego serwer odrzuca, bo hasło i tak nikogo
            nie zaloguje).
          </Banner>
        )}

        <div className="field-row">
          <Button
            variant={pilot.active ? 'danger' : 'ok'}
            disabled={!activeGate.enabled || busy}
            onClick={() => setActive.mutate({ id: pilot.id, active: !pilot.active })}
          >
            {pilot.active ? 'Deaktywuj konto' : 'Aktywuj konto'}
          </Button>
          {activeGate.reason == null ? null : <span className="hint">{activeGate.reason}</span>}
        </div>
      </Card>

      <Card title="Ślad i historia">
        <KeyValue
          label="Identyfikator konta"
          value={pilot.id}
          unit="zdarzenia wiążą się z nim, nie z kodem"
        />
        <KeyValue
          label="Historia zmian"
          value={
            <LinkButton to={targetHref('pilot', pilot.id)} variant="ghost" size="sm">
              wpisy w dzienniku audytu → A09
            </LinkButton>
          }
          unit="kto, kiedy i co zmienił"
        />
        <span className="hint">
          Zmiana kodu pilota <b>nie przepisuje historii</b>: zdarzenia wiążą się z{' '}
          <code>id</code> konta. W kartach arkusza wyeksportowanych wcześniej zostaje jednak
          stary kod - dlatego kod zmienia się świadomie, a nie „przy okazji".
        </span>
      </Card>
    </Drawer>
  );
}

/** Pola tożsamości - wspólne dla obu wariantów szuflady. */
function IdentityFields({
  draft,
  onChange,
  disabled,
}: {
  draft: AccountDraft;
  onChange: (next: AccountDraft) => void;
  disabled: boolean;
}) {
  const form = formState(draft);

  return (
    <Card title="Tożsamość">
      <Field htmlFor="konto-nazwisko" label="Imię i nazwisko" hint={form.name.message}>
        <TextInput
          id="konto-nazwisko"
          value={draft.name}
          disabled={disabled}
          invalid={draft.name.length > 0 && !form.name.ok}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </Field>

      <Field
        htmlFor="konto-kod"
        label="Kod pilota"
        hint={
          form.code.message ?? (
            <>
              Unikalny w całym systemie. Widoczny w logu dnia, na liście lotów i w kartach
              arkusza - dlatego krótki i mono. Zapisujemy go WERSALIKAMI niezależnie od tego,
              jak go wpiszesz.
            </>
          )
        }
      >
        <TextInput
          id="konto-kod"
          mono
          value={draft.code}
          disabled={disabled}
          invalid={draft.code.length > 0 && !form.code.ok}
          onChange={(event) => onChange({ ...draft, code: event.target.value })}
        />
      </Field>

      <Field
        htmlFor="konto-email"
        label="E-mail"
        hint={
          form.email.message ?? (
            <>
              Służy jako login - do aplikacji na telefonie i (jeśli rola pozwala) do panelu.
              Pole może zostać puste: wtedy loginem jest sam kod pilota.
            </>
          )
        }
      >
        <TextInput
          id="konto-email"
          mono
          value={draft.email}
          disabled={disabled}
          invalid={draft.email.length > 0 && !form.email.ok}
          onChange={(event) => onChange({ ...draft, email: event.target.value })}
        />
      </Field>
    </Card>
  );
}

/** Wybór roli - lista kart, jedyny dozwolony „select" w produkcie. */
function RoleChoice({
  role,
  disabled,
  onSelect,
}: {
  role: AccountDraft['role'];
  disabled: boolean;
  onSelect: (role: AccountDraft['role']) => void;
}) {
  return (
    // Nie `Field`: nazwę grupy wyboru niesie `aria-label` na `radiogroup`, a `<label
    // htmlFor>` musiałby wskazywać jedno pole, którego tu nie ma.
    <div className="field">
      <span className="label">Rola w panelu</span>
      <OptionList ariaLabel="Rola w panelu">
        {ROLE_OPTIONS.map((option) => (
          <OptionButton
            key={option.id}
            name={option.name}
            desc={option.desc}
            selected={role === option.id}
            disabled={disabled}
            onSelect={() => onSelect(option.id)}
          />
        ))}
      </OptionList>
    </div>
  );
}

/**
 * Hasło pokazane RAZ.
 *
 * Pole jest `readonly` i mono - nie ma tu czego wpisać, bo wartość przyszła z serwera.
 * Kopiowanie do schowka jest wygodą, a nie warunkiem: gdy przeglądarka odmówi dostępu
 * do schowka, hasło i tak stoi na ekranie do przepisania.
 */
function SecretCard({
  kind,
  secret,
}: {
  kind: 'create' | 'reset';
  secret: { password: string; revokedSessions: number };
}) {
  const [copied, setCopied] = useState(false);
  const copy = secretCopy(kind, secret.revokedSessions);

  return (
    <Card title="Hasło startowe" actions={<Pill tone="amber">pokazane raz</Pill>}>
      <Banner tone="ok" live>
        <b>{copy.title}</b> {copy.note}
      </Banner>

      <Field htmlFor="konto-haslo" label="Wygenerowane hasło">
        <div className="field-row">
          <TextInput id="konto-haslo" mono readOnly value={secret.password} />
          <Button
            variant="default"
            onClick={() => {
              void navigator.clipboard?.writeText(secret.password).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
          >
            {copied ? 'Skopiowano' : 'Kopiuj'}
          </Button>
        </div>
      </Field>

      <Banner tone="danger">
        <b>Hasło widzisz wyłącznie teraz, w tym oknie.</b> Nie trafia do adresu URL, do logów
        serwera ani do dziennika audytu - w bazie zostaje wyłącznie hash
        (<code>password_hash</code>). Audyt zapisuje sam fakt: „ustawiono hasło", kto to zrobił
        i kiedy. Po zamknięciu szuflady nie da się go odczytać - jedyne wyjście to kolejny
        reset i nowe hasło.
      </Banner>
    </Card>
  );
}

/**
 * Potwierdzenie zmiany dostępu do konta.
 *
 * Cała treść - łącznie z odmianą liczebnika i z rozróżnieniem sesji telefonu od sesji
 * panelu - pochodzi z `activeChangeCopy`. Składanie tego napisu w JSX-ie dawało
 * „Unieważniono 1 sesji" i milczało o sesji panelu, której serwer nie potrafi zliczyć.
 */
function ActiveChangeBanner({ change }: { change: PilotChangeDto }) {
  const copy = activeChangeCopy(change.pilot.active, change.revokedSessions);
  return (
    <Banner tone="ok" live>
      <b>{copy.title}</b> {copy.note}
    </Banner>
  );
}

function FailureBanner({ failure }: { failure: ReturnType<typeof accountFailure> }) {
  return (
    <Banner tone={failure.tone} live>
      <b>{failure.title}</b> {failure.detail}
    </Banner>
  );
}

/**
 * `HttpError` → komunikat. Rozpakowanie wyjątku należy do ekranu, a nie do modułu
 * czystego: `accountFailure` przyjmuje STATUS i CIAŁO, żeby dało się je przetestować
 * bez klienta HTTP.
 */
function failureOf(error: unknown) {
  if (isHttpError(error)) return accountFailure(error.status, error.body as ApiErrorDto);
  return accountFailure(null, null);
}
