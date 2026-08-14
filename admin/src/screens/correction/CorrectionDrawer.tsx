/**
 * UZ Aero — panel: KOREKTA ADMINISTRATORA (`design/admin/A02b-korekta.html`).
 *
 * Szuflada NAD kartą dnia, adres `#/dni/<sesja>/korekta/<zdarzenie>` — kontekst dnia
 * zostaje pod spodem, bo po zapisie wraca się dokładnie do niego. Wyboru zdarzenia
 * dokonuje oś zdarzeń karty dnia; osobnego ekranu wyboru nie ma i nie będzie.
 *
 * ══ TRZY RZECZY, KTÓRYCH NIE WOLNO TU ZGUBIĆ ══
 *
 *  1. **Ten formularz niczego nie edytuje.** Dopisuje NOWE zdarzenie
 *     `event_correction` z `targetUuid` wskazującym oryginał. Odczyt zostaje w bazie
 *     na zawsze i dalej widać go na osi — projekcja przestaje go uwzględniać (`void`)
 *     albo liczy z nowym czasem (`retime`).
 *  2. **Wszystkie liczby są z serwera.** Karta „przed → po" pochodzi z podglądu
 *     (`POST …/corrections/preview`), który liczy `projectSession` na strumieniu
 *     z doklejonym kandydatem. Panel nie ma czym tego policzyć i nie ma prawa.
 *  3. **`reexport: null` = korekta ZAPISANA, arkusz NIE.** Obie połowy muszą paść
 *     wprost (`correctionResult.ts`), bo powtórzona korekta dopisze drugie zdarzenie.
 *
 * Ekran jest `.tsx` bez arytmetyki i bez decyzji o treści: walidacja, napisy, wiersze
 * i komunikaty mieszkają w czystych modułach obok (`correctionDraft`, `correctionTarget`,
 * `correctionImpact`, `correctionResult`), które mają testy w Node.
 */

import type { SessionState } from '@uzaero/domain';
import { dateUtcShort, timeUtcSeconds } from '@uzaero/format';
import { useEffect, useState } from 'react';

import type { ApiErrorDto, PanelPilotDto, SessionListItemDto, TimelineEntryDto } from '../../api/dto';
import { isHttpError } from '../../api/httpClient';
import { useCorrection } from '../../queries/useCorrection';
import { useCorrectionPreview } from '../../queries/useCorrectionPreview';
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
  TextArea,
  TextInput,
} from '../../ui/components';
import { roleLabel } from '../../ui/shell/whoLabels';
import { targetHref } from '../audit/auditFilters';
import { correctionActionsFor } from '../events/eventCatalog';
import {
  ACTION_OPTIONS,
  amendFieldsFor,
  amendState,
  REASON_MAX_LENGTH,
  correctionDraft,
  initialTimeText,
  reasonState,
  referenceTime,
  timeFieldState,
  type CorrectionActionId,
} from './correctionDraft';
import { impactRows } from './correctionImpact';
import { correctionFailure, correctionOutcome, violationMessages } from './correctionResult';
import { targetRows } from './correctionTarget';
import { correctionWarningBanner } from './correctionWarnings';

interface CorrectionDrawerProps {
  sessionUuid: string;
  targetUuid: string;
  session: SessionListItemDto;
  state: SessionState;
  /** Wpis osi dla korygowanego zdarzenia; `null` = nie ma go na osi tego dnia. */
  entry: TimelineEntryDto | null;
  pilot: PanelPilotDto | null;
  onClose: () => void;
}

export function CorrectionDrawer({
  sessionUuid,
  targetUuid,
  session,
  state,
  entry,
  pilot,
  onClose,
}: CorrectionDrawerProps) {
  if (entry == null) return <MissingTarget targetUuid={targetUuid} onClose={onClose} />;
  return (
    <CorrectionForm
      sessionUuid={sessionUuid}
      targetUuid={targetUuid}
      session={session}
      state={state}
      entry={entry}
      pilot={pilot}
      onClose={onClose}
    />
  );
}

/**
 * Głęboki link do zdarzenia, którego na tej osi nie ma.
 *
 * Mockup nie ma na to stanu — projektujemy go w duchu reszty panelu: konkretnie
 * i z podaniem, co dalej. Korekta celuje w uuid, więc wklejony link z literówką
 * musi powiedzieć „nie ma takiego zdarzenia w tym dniu", a nie pokazać pusty formularz,
 * który po zapisie i tak odbije się od `CORRECTION_TARGET_NOT_FOUND`.
 */
function MissingTarget({ targetUuid, onClose }: { targetUuid: string; onClose: () => void }) {
  return (
    <Drawer
      title="KOREKTA ADMINISTRATORA"
      sub={`cel ${targetUuid} — nie ma go w rejestrze tego dnia`}
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Wróć do osi zdarzeń
        </Button>
      }
    >
      <Banner tone="warn">
        <b>Tego zdarzenia nie ma na osi tego dnia.</b> Korekta zawsze celuje w konkretny
        <code> uuid</code>, a serwer nie znalazł go w rejestrze sesji <code>{targetUuid}</code>.
        Najczęstsza przyczyna to niekompletny albo przekłamany identyfikator z wklejonego
        linku — wybierz zdarzenie z osi zdarzeń dnia, wtedy adres składa panel.
      </Banner>
    </Drawer>
  );
}

function CorrectionForm({
  sessionUuid,
  targetUuid,
  session,
  state,
  entry,
  pilot,
  onClose,
}: CorrectionDrawerProps & { entry: TimelineEntryDto }) {
  /**
   * Akcje dozwolone dla TEGO typu celu (issue #43). Zdanie samolotu ma wyłącznie
   * `amend`, więc `retime` nie może być stanem początkowym — formularz otwierałby się
   * na operacji, którą domena odrzuci.
   */
  const allowedActions = correctionActionsFor(entry.event.type);
  const [action, setAction] = useState<CorrectionActionId>(allowedActions[0] ?? 'retime');
  const [timeText, setTimeText] = useState(() => initialTimeText(entry));
  const [reason, setReason] = useState('');
  // Pola `amend` (issue #43). Puste znaczy „nie ruszaj tej wartości" — administrator
  // poprawia zwykle jedną liczbę i nie ma przepisywać drugiej tylko dlatego, że
  // formularz ją pokazuje.
  const [fuelText, setFuelText] = useState('');
  const [mhText, setMhText] = useState('');

  // Podgląd pytamy o czas USTALONY, a nie o każdy naciśnięty klawisz: poprawianie
  // „13:13:33" na „13:01:33" przechodzi po drodze przez kilka zapisów czytelnych dla
  // parsera, a każdy z nich byłby osobnym żądaniem o liczby, których nikt nie zdąży
  // przeczytać. Komunikat pod polem zostaje NATYCHMIASTOWY — opóźniamy zapytanie,
  // nie informację zwrotną.
  const [settledTime, setSettledTime] = useState(timeText);
  useEffect(() => {
    const id = setTimeout(() => setSettledTime(timeText), 400);
    return () => clearTimeout(id);
  }, [timeText]);

  const reference = referenceTime(entry);
  const time = timeFieldState(timeText, reference);
  const amend = amendState(fuelText, mhText);
  const draft = correctionDraft(
    action,
    targetUuid,
    timeFieldState(settledTime, reference),
    amend,
  );
  /** Pola, które `amend` w ogóle może zmienić w TYM zdarzeniu (lustro białej listy). */
  const amendable = amendFieldsFor(entry.event.type);
  const preview = useCorrectionPreview(sessionUuid, draft);
  const save = useCorrection();

  const reasonCheck = reasonState(reason);
  const violations = violationMessages(preview.data?.violations ?? []);
  // Kolizje z pilotem: po zapisie bierzemy je z ODPOWIEDZI (opisują chwilę zapisu),
  // wcześniej z podglądu. Baner NIE wchodzi do `blocked` — administrator może edytować
  // zawsze i to jest cała treść decyzji z 2026-08-07.
  const warnings = correctionWarningBanner(
    save.data?.warnings ?? preview.data?.warnings ?? [],
  );
  const outcome = save.isSuccess ? correctionOutcome(save.data) : null;
  const failure = save.isError ? failureOf(save.error) : null;
  const done = outcome != null;

  const blocked =
    done ||
    save.isPending ||
    draft == null ||
    !reasonCheck.ok ||
    preview.data == null ||
    violations.length > 0;

  const isVoid = action === 'void';

  return (
    <Drawer
      wide
      title="KOREKTA ADMINISTRATORA"
      sub={
        <>
          {session.reg ?? session.aircraftId} ·{' '}
          {session.claimedAt == null ? 'sesja bez claimu' : dateUtcShort(session.claimedAt)} · sesja{' '}
          {sessionUuid}
          <br />
          {state.closedAt == null
            ? 'samolot nieoddany — sesja wciąż otwarta'
            : `samolot zdany ${dateUtcShort(state.closedAt)} ${timeUtcSeconds(state.closedAt)} UTC`}
        </>
      }
      onClose={onClose}
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>
            Wróć do karty dnia
          </Button>
        ) : (
          <>
            <span className="drawer-note">brak edycji · brak kasowania</span>
            <Button variant="ghost" onClick={onClose}>
              Anuluj
            </Button>
            <Button
              variant={isVoid ? 'danger' : 'primary'}
              disabled={blocked}
              onClick={() => {
                if (draft != null) save.mutate({ sessionUuid, draft, reason });
              }}
            >
              {save.isPending ? 'Zapisuję…' : `Dopisz korektę ${action}`}
            </Button>
          </>
        )
      }
    >
      {outcome == null ? null : (
        <Banner tone={outcome.tone} live>
          <b>{outcome.title}</b> {outcome.note}
          {outcome.steps.map((step) => (
            <span key={step}>
              <br />
              <code>{step}</code>
            </span>
          ))}
        </Banner>
      )}

      {failure == null ? null : (
        <Banner tone={failure.tone} live>
          <b>{failure.title}</b> {failure.detail}
          {failure.violations.map((message) => (
            <span key={message}>
              <br />
              <code>{message}</code>
            </span>
          ))}
        </Banner>
      )}

      {warnings == null ? null : (
        <Banner tone={warnings.tone}>
          <b>{warnings.title}</b> {warnings.note}
          {warnings.items.map((item) => (
            <span key={item.code}>
              <br />
              <code>{item.code}</code> — {item.text}
              {item.consequence == null ? null : ` ${item.consequence}`}
            </span>
          ))}
        </Banner>
      )}

      <Banner tone="danger">
        <b>Rejestr zdarzeń jest append-only — nie ma tu edycji ani kasowania.</b> Ten formularz
        nie zmienia zdarzenia <code>{entry.event.type}</code>. Dopisuje <b>nowe</b> zdarzenie{' '}
        <code>event_correction</code> z <code>targetUuid</code> wskazującym oryginał. Oryginalny
        odczyt zostaje w bazie na zawsze i dalej widać go na osi zdarzeń — projekcja tylko
        przestaje go uwzględniać albo liczy z nowym czasem.
      </Banner>

      <Card
        title="Zdarzenie korygowane · oryginalny odczyt"
        actions={<Pill tone="dim">zostaje na zawsze</Pill>}
      >
        {preview.data?.target == null ? (
          <span className="hint">
            Opis odczytu pochodzi z podglądu serwera —{' '}
            {preview.isError
              ? 'nie udało się go pobrać (patrz baner niżej).'
              : 'trwa pobieranie.'}
          </span>
        ) : (
          targetRows(preview.data.target).map((row) => (
            <KeyValue
              key={row.label}
              label={row.label}
              value={row.value}
              {...(row.note == null ? {} : { unit: row.note })}
              {...(row.tone == null ? {} : { tone: row.tone })}
            />
          ))
        )}
      </Card>

      {/* Nie `Field`: nazwę grupy wyboru niesie `aria-label` na `radiogroup`, a `<label
          htmlFor>` musiałby wskazywać jedno pole, którego tu nie ma. Klasy zostają
          te same, więc wygląd jest identyczny z mockupem. */}
      <div className="field">
        {/* Pokazujemy WYŁĄCZNIE akcje mające sens dla tego typu: karta „retime" przy
            zdaniu samolotu obiecywałaby operację, którą reguła odrzuci
            (`CORRECTION_TARGET_NOT_ALLOWED`), a wyszarzona byłaby jeszcze gorsza —
            zapraszałaby do zgadywania, dlaczego nie działa. */}
        <span className="label">
          {allowedActions.length === 1
            ? 'Akcja — dla tego zdarzenia dozwolona jest jedna'
            : `Akcja — ${allowedActions.length === 3 ? 'dokładnie trzy' : 'dwie'}, każda dopisuje zdarzenie`}
        </span>
        <OptionList ariaLabel="Akcja korekty">
          {ACTION_OPTIONS.filter((option) => allowedActions.includes(option.id)).map((option) => (
            <OptionButton
              key={option.id}
              name={option.name}
              desc={option.desc}
              selected={action === option.id}
              disabled={done || save.isPending}
              onSelect={() => setAction(option.id)}
            />
          ))}
        </OptionList>
      </div>

      {action !== 'retime' ? null : (
        <Field
          htmlFor="korekta-czas"
          label="Nowy czas zdarzenia (UTC)"
          hint={time.message}
        >
          <TextInput
            id="korekta-czas"
            mono
            value={timeText}
            invalid={time.invalid}
            disabled={done || save.isPending}
            placeholder="2026-07-30 13:01:33"
            onChange={(event) => setTimeText(event.target.value)}
          />
        </Field>
      )}

      {/* Pola `amend` (issue #43) — pokazujemy WYŁĄCZNIE te, które biała lista domeny
          dopuszcza dla tego typu celu. Formularz z polem, którego reguła i tak odrzuci,
          obiecuje zmianę niemożliwą do wykonania. */}
      {action !== 'amend' ? null : amendable.length === 0 ? (
        <Banner tone="warn">
          <b>
            <code>amend</code> nie ma tu czego zmienić.
          </b>{' '}
          Wartości poprawia się w odczytach przy przejęciu i zdaniu samolotu
          (<code>preflight_confirm</code>, <code>day_close</code>) oraz w składzie zrzutu.
          Godzinę tego zdarzenia zmienia <code>retime</code>.
        </Banner>
      ) : (
        <>
          {amendable.includes('fuelL') && (
            <Field htmlFor="korekta-paliwo" label="Nowy odczyt paliwa (L)" hint={amend.message}>
              <TextInput
                id="korekta-paliwo"
                mono
                value={fuelText}
                invalid={amend.invalid}
                disabled={done || save.isPending}
                placeholder="bez zmiany"
                onChange={(event) => setFuelText(event.target.value)}
              />
            </Field>
          )}
          {amendable.includes('mh') && (
            <Field
              htmlFor="korekta-mh"
              label="Nowy odczyt motogodzin"
              hint="Godziny dziesiętne, tak jak trzyma je rejestr (3907.8). Puste pole zostawia wartość bez zmian."
            >
              <TextInput
                id="korekta-mh"
                mono
                value={mhText}
                invalid={amend.invalid}
                disabled={done || save.isPending}
                placeholder="bez zmiany"
                onChange={(event) => setMhText(event.target.value)}
              />
            </Field>
          )}
          {amendable.includes('jumpers') && (
            <Banner tone="status">
              Skład zrzutu poprawia <b>pilot</b> w trybie edycji sesji (ekran 10G aplikacji).
              Panel zmienia tu odczyty paliwa i motogodzin — liczby, których pilot po zamknięciu
              okna 24 h nie ruszy już sam.
            </Banner>
          )}
        </>
      )}

      {!isVoid ? null : (
        <Banner tone="warn">
          <b>
            <code>void</code> znaczy „zdarzenia NIE BYŁO".
          </b>{' '}
          Jeżeli zdarzenie zaszło, a pomylona jest tylko godzina, właściwym narzędziem jest{' '}
          <code>retime</code>. Unieważnienie <code>engine_stop</code> zostawia cykl silnika{' '}
          <b>otwarty</b>, więc jego czas wypada z czasu blokowego <b>w całości</b>, zamiast
          skrócić się o różnicę — kartę „przed → po" niżej warto wtedy przeczytać uważnie.{' '}
          <code>void</code> jest dla zdarzeń, których nie było, jak fałszywe lądowanie zaliczone
          przez detektor.
        </Banner>
      )}

      <Field
        htmlFor="korekta-powod"
        label="Powód korekty · pole obowiązkowe"
        hint={
          reasonCheck.reason ?? (
            <>
              Powód idzie do <b>audytu</b>, nie do rejestru — zdarzenie opisuje lot, a nie
              motywację człowieka przy biurku. Po roku to jedyna rzecz, która wyjaśni, dlaczego
              liczby dnia różnią się od tego, co zapisał telefon.
            </>
          )
        }
      >
        <TextArea
          id="korekta-powod"
          value={reason}
          maxLength={REASON_MAX_LENGTH}
          disabled={done || save.isPending}
          invalid={reason.length > 0 && !reasonCheck.ok}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>

      <Card
        title="Wpływ na liczby dnia"
        actions={
          <>
            <Pill tone="dim">przed → po</Pill>
            <Pill tone="blue">liczy serwer</Pill>
          </>
        }
      >
        {preview.isError ? (
          <Banner tone="danger" live>
            <b>Nie udało się policzyć wpływu korekty.</b> Panel nie policzy go sam — liczby dnia
            mają jedno źródło i jest nim <code>projectSession</code> po stronie serwera. Bez
            podglądu zapis jest zablokowany, żeby nikt nie dopisywał do rejestru zmiany, której
            skutku nie widział.{' '}
            <Button variant="ghost" size="sm" onClick={() => void preview.refetch()}>
              Ponów
            </Button>
          </Banner>
        ) : draft == null ? (
          <span className="hint">
            Uzupełnij czytelny czas w UTC — wtedy serwer policzy, jak zmienią się liczby dnia.
          </span>
        ) : preview.data == null ? (
          <span className="hint">Serwer liczy dzień przed korektą i po niej…</span>
        ) : (
          <>
            {impactRows(preview.data.before, preview.data.after, session.mhFormat).map(
              (row) => (
                <KeyValue
                  key={row.label}
                  label={row.label}
                  value={
                    row.changed ? (
                      <>
                        <span className="was">{row.before}</span> → {row.after}
                      </>
                    ) : (
                      row.after
                    )
                  }
                  unit={row.note ?? (row.changed ? undefined : 'bez zmian')}
                  {...(row.tone == null ? {} : { tone: row.tone })}
                />
              ),
            )}
            <span className="hint">
              Obie kolumny liczy <code>projectSession</code> — ta sama funkcja, którą telefon
              liczy statystyki dnia i którą serwer buduje kartę arkusza. Wierszy{' '}
              <b>„Średnie zużycie L/h"</b> i <b>„Blok − Δ MH"</b> z mockupu tu nie ma i to jest
              decyzja, nie przeoczenie: projekcja nie niesie tych wielkości, a policzenie ich
              w panelu byłoby pierwszą liczbą na ekranie, której serwer nigdy nie wysłał.
            </span>
          </>
        )}
      </Card>

      {violations.length === 0 ? null : (
        <Banner tone="danger">
          <b>Domena odmówi zapisu tej korekty.</b> Uchylenie 24-godzinnego okna pilota jest
          jedynym przywilejem administratora — reszta inwariantów rejestru obowiązuje go tak samo.
          {violations.map((message) => (
            <span key={message}>
              <br />
              <code>{message}</code>
            </span>
          ))}
        </Banner>
      )}

      <Card title="Czyim nazwiskiem zapisze się korekta">
        <KeyValue
          label="W rejestrze jako"
          value={session.picName ?? session.picId}
          {...(session.picCode == null ? {} : { unit: `PIC sesji (${session.picCode})` })}
        />
        <KeyValue
          label="Wykonał"
          value={pilot == null ? '—' : pilot.name}
          tone="green"
          {...(pilot == null ? {} : { unit: roleLabel(pilot.role).toLowerCase() })}
        />
        {/* Obietnica z mockupu („Ślad → A09") jest tu LINKIEM, a nie zdaniem: dziennik
            odfiltrowany po uuid-zie tego zdarzenia pokazuje wszystkie korekty, które
            już na nim zrobiono — razem z powodami, których w rejestrze nie ma.
            Wejście na surową listę wszystkiego byłoby odesłaniem po igłę. */}
        <KeyValue
          label="Ślad"
          value={
            <LinkButton to={targetHref('event', targetUuid)} variant="ghost" size="sm">
              wpis w dzienniku audytu → A09
            </LinkButton>
          }
          unit="tą samą transakcją"
        />
        <span className="hint">
          Zdarzenie <code>event_correction</code> musi nieść <code>picId</code> <b>PIC-a tej
          sesji</b>, nie administratora — do jednej sesji pisze jedna tożsamość (single-writer),
          więc korekta ostemplowana Twoim kontem zostałaby odrzucona jako <b>WRITER_MISMATCH</b>.
          Dlatego oś zdarzeń przy Twojej korekcie pokaże nazwisko pilota. Fakt, że zrobił to
          administrator, żyje w audycie i w <code>events.source_device</code> — i tylko tam.
        </span>
      </Card>

      <Banner tone="warn">
        <b>Ta korekta nie wróci na telefon pilota.</b> Synchronizacja jest dziś jednokierunkowa —
        kontrakt API nie ma endpointu, który oddawałby zdarzenia do aplikacji. Poprawiasz rejestr
        na serwerze i kartę arkusza; telefon zostanie ze <b>swoją, starą wersją</b> i na ekranie
        historii dni dalej pokaże stary czas blokowy. Rozjazd utrzyma się, dopóki nie powstanie
        pobieranie zdarzeń. Jeśli różnica ma dla pilota znaczenie — powiedz mu o niej poza aplikacją.
      </Banner>

      <Card title="Co się stanie po zapisie">
        <KeyValue label="1 · Rejestr" value="+1 zdarzenie" unit="event_correction, nic nadpisanego" />
        <KeyValue label="2 · Audyt" value="kto, kiedy, obie wartości, powód" unit="ta sama transakcja" />
        <KeyValue
          label="3 · Arkusz"
          value={session.exportRevision == null ? 'karta powstanie' : `rewizja ${session.exportRevision} → nowa`}
          unit="numer poda odpowiedź serwera"
          tone="amber"
        />
        <KeyValue label="4 · Flagi" value="zostają otwarte" unit="zamyka je człowiek w skrzynce" />
        <span className="hint">
          Re-eksport jest <b>wymuszony</b>, nie opcjonalny: karta arkusza pokazuje aktualny stan
          dnia, więc po zmianie liczb serwer regeneruje ją i dopisuje wiersz w{' '}
          <code>export_log</code> z podbitą rewizją. Eksport idzie <b>po</b> zatwierdzeniu
          transakcji, żeby awaria arkusza nie cofała decyzji człowieka — i dlatego odpowiedź może
          powiedzieć „korekta zapisana, karta nie".
        </span>
      </Card>
    </Drawer>
  );
}

/**
 * `HttpError` → komunikat. Rozpakowanie wyjątku należy do ekranu, a nie do modułu
 * czystego: `correctionFailure` przyjmuje STATUS i CIAŁO, żeby dało się je przetestować
 * bez klienta HTTP.
 */
function failureOf(error: unknown) {
  if (isHttpError(error)) return correctionFailure(error.status, error.body as ApiErrorDto);
  return correctionFailure(null, null);
}
