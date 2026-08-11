/**
 * UZ Aero — panel: SZCZEGÓŁ FLAGI I JEJ ROZSTRZYGNIĘCIE
 * (`design/admin/A03a-flaga.html`).
 *
 * Szuflada nad listą, adres `#/flagi/<id>` — kontekst skrzynki zostaje pod spodem.
 *
 * Dwie rzeczy, których nie wolno tu zgubić:
 *
 *  1. **Rozwiązanie flagi to komentarz i zmiana statusu, NIGDY edycja danych.**
 *     Rejestr `events` jest append-only i panel nie ma przycisku „popraw 3906.9".
 *     Jeżeli błędna jest sama liczba, poprawia ją nowe zdarzenie `event_correction`
 *     na ekranie korekty — a oryginał zostaje w rejestrze na zawsze.
 *  2. **Zdolności są ROZŁĄCZNE.** `flags.resolve` ma administrator **oraz** szef
 *     wyszkolenia — skrzynka jest jego głównym narzędziem. `events.correct` ma
 *     **tylko administrator**, więc przycisk korekty jest dla szefa wyszkolenia
 *     widoczny i wyszarzony Z PODANYM POWODEM, nigdy cicho ukryty.
 *
 * Treści, których szuflada NIE pokazuje mimo mockupu (oś zdarzeń, nazwa i rewizja
 * karty dnia, ostatni sync sesji, powiązane flagi tego samolotu), nie mają dziś skąd
 * przyjść — DTO skrzynki ich nie niesie. Zgadnięcie ich byłoby najgorszą możliwą
 * treścią ekranu, który istnieje po to, żeby wykrywać rozjazdy.
 */

import { dateUtcShort, relativeAge, timeUtc } from '@uzaero/format';
import { useState } from 'react';

import type { ApiErrorDto, Capability, FlagListItemDto, PanelPilotDto } from '../../api/dto';
import { isHttpError } from '../../api/httpClient';
import { can } from '../../auth/can';
import { useResolveFlag } from '../../queries/useResolveFlag';
import { Banner, Button, Card, Drawer, KeyValue, LinkButton, OptionLink, OptionList, Pill, TextArea } from '../../ui/components';
import { CheckIcon, EditIcon } from '../../ui/components/icons';
import { roleLabel } from '../../ui/shell/whoLabels';
import { detailRows } from './flagDetails';
import {
  correctionAction,
  noteState,
  resolveFailure,
  resolveOutcome,
  NOTE_MAX_LENGTH,
} from './flagResolve';
import { shortUuid } from './flagRows';

interface FlagDrawerProps {
  flagId: number;
  /** `null` = flagi nie ma na wczytanej liście (patrz `MissingFlag` niżej). */
  flag: FlagListItemDto | null;
  pilot: PanelPilotDto | null;
  capabilities: Capability[] | undefined;
  onClose: () => void;
  /** Rozszerza filtr do „wszystkie" — jedyna droga do flagi spoza bieżącej listy. */
  onWiden: () => void;
}

export function FlagDrawer({ flagId, flag, pilot, capabilities, onClose, onWiden }: FlagDrawerProps) {
  const [note, setNote] = useState('');
  const resolve = useResolveFlag();

  if (flag == null) {
    return (
      <Drawer
        title={`FLAGA · #${flagId}`}
        sub="nie ma jej na wczytanej liście"
        onClose={onClose}
        footer={<Button variant="ghost" onClick={onClose}>Zamknij</Button>}
      >
        <Banner tone="warn">
          <b>Tej flagi nie ma wśród spraw pobranych bieżącym filtrem.</b> Serwer nie wystawia
          dziś odczytu pojedynczej flagi (<code>GET /admin/api/flags/:id</code>), a filtr listy
          nie przyjmuje numeru — szuflada bierze więc sprawę z wiersza, który masz na ekranie.
          Najczęstsza przyczyna: link prowadzi do flagi już rozwiązanej, a lista pokazuje
          otwarte.
        </Banner>
        <Button variant="primary" onClick={onWiden}>
          Pokaż wszystkie flagi i spróbuj ponownie
        </Button>
      </Drawer>
    );
  }

  const opened = Date.parse(flag.createdAt);
  const noteCheck = noteState(note);
  const failure = resolve.isError ? failureOf(resolve.error) : null;
  const outcome = resolve.isSuccess ? resolveOutcome(resolve.data) : null;
  const canResolve = can(capabilities, 'flags.resolve');
  const correction = correctionAction(flag, capabilities);
  const isOpen = flag.status === 'open';
  const done = outcome != null || failure?.final === true;

  return (
    <Drawer
      title={`FLAGA · ${flag.type.toUpperCase()}`}
      sub={
        <>
          #{flag.id} · {flag.reg ?? flag.aircraftId} · dotyczy {flag.sessionUuids.length} sesji
          <br />
          {Number.isNaN(opened)
            ? 'chwila wykrycia nieznana'
            : `otwarta ${dateUtcShort(opened)} ${timeUtc(opened)} UTC · leży ${relativeAge(Date.now() - opened)}`}
        </>
      }
      onClose={onClose}
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>
            Zamknij
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Anuluj
            </Button>
            <Button
              variant="primary"
              disabled={!isOpen || !canResolve || !noteCheck.ok || resolve.isPending}
              onClick={() => resolve.mutate({ id: flag.id, note })}
            >
              <CheckIcon size={13} />
              {flag.blocksExport ? 'Rozwiąż i odblokuj kartę' : 'Rozwiąż sprawę'}
            </Button>
          </>
        )
      }
    >
      {outcome == null ? null : (
        <Banner tone={outcome.tone} live>
          <b>{outcome.title}</b> {outcome.note}
          {outcome.lines.map((line) => (
            <span key={line}>
              <br />
              <code>{line}</code>
            </span>
          ))}
        </Banner>
      )}

      {/* PRZEGRANY WYŚCIG (409). Mockup nie ma na to stanu — projektujemy go tak, jak
          reszta ekranu mówi o odmowach: konkretnie i z podaniem, KTO był pierwszy.
          Komentarz zwycięzcy cytujemy w całości, bo to on jest teraz uzasadnieniem
          zamknięcia sprawy i to z nim, a nie z panelem, można się nie zgadzać. */}
      {failure == null ? null : (
        <Banner tone={failure.tone} live>
          <b>{failure.title}</b> {failure.detail}
          {failure.winner == null ? null : (
            <>
              <br />
              <b>
                {failure.winner.by} · {failure.winner.at}
              </b>
              {failure.winner.note === '' ? null : <>: „{failure.winner.note}"</>}
            </>
          )}
        </Banner>
      )}

      <Banner tone="danger">
        <b>Rejestr zdarzeń jest append-only.</b> Rozwiązanie flagi to komentarz i zmiana
        statusu — <u>nie</u> edycja odczytów. Panel nie ma i nie będzie miał przycisku
        „popraw wartość". Jeśli liczba jest błędna, poprawia ją nowe zdarzenie{' '}
        <code>event_correction</code>, a oryginał zostaje w rejestrze na zawsze.
      </Banner>

      <Card
        title="Skutek dla arkusza"
        actions={
          <Pill tone={flag.blocksExport ? 'red' : 'dim'}>
            {flag.blocksExport ? 'blokada' : 'bez blokady'}
          </Pill>
        }
      >
        <KeyValue
          label="Karta dnia"
          value={flag.blocksExport ? 'ZABLOKOWANA' : 'BEZ BLOKADY'}
          tone={flag.blocksExport ? 'red' : undefined}
        />
        <KeyValue label="Bramka" value={<small>dayExporter · openForSession</small>} />
        <KeyValue label="Status flagi" value={flag.status} />
        <span className="hint">
          {flag.blocksExport ? (
            <>
              §4.7 mówi wprost: nakładające się sesje trafiają do arkusza <b>dopiero po
              rozwiązaniu flagi</b>. Wcześniejszy zapis utrwaliłby w dokumencie klubu wersję
              dnia, o której już wiadomo, że jest sporna.
            </>
          ) : (
            <>
              Ten typ flagi <b>nie jest bramką</b> w <code>dayExporter</code> — karta dnia
              powstaje normalnie, a sprawa zostaje do wyjaśnienia. Rozstrzygnięcie nie uruchomi
              więc żadnego re-eksportu.
            </>
          )}
        </span>
      </Card>

      <Card title="Rozbieżność" actions={<Pill tone="dim">details z ingestu</Pill>}>
        {detailRows(flag).map((row) => (
          <KeyValue key={row.key} label={row.key} value={row.value} tone={row.tone} />
        ))}
      </Card>

      <Card title="Sesje, których dotyczy flaga">
        <OptionList>
          {flag.sessionUuids.map((uuid) => (
            <OptionLink key={uuid} to={`/dni/${uuid}`} name={shortUuid(uuid)} desc={uuid} />
          ))}
        </OptionList>
        <span className="hint">
          Karta dnia każdej sesji jest osobnym ekranem. Flagi rozwiązuje się <b>osobno</b> —
          każda ma własny wpis, własny komentarz i własny ślad w audycie.
        </span>
      </Card>

      {isOpen ? (
        <Card
          title="Rozwiązanie"
          actions={
            <>
              <Pill tone="dim">open → resolved</Pill>
              {canResolve ? null : <Pill tone="amber">brak zdolności</Pill>}
            </>
          }
        >
          <div className="field">
            <label className="label" htmlFor="flag-note">
              Komentarz — wymagany
            </label>
            <TextArea
              id="flag-note"
              value={note}
              maxLength={NOTE_MAX_LENGTH}
              disabled={!canResolve || done}
              invalid={note.length > 0 && !noteCheck.ok}
              onChange={(event) => setNote(event.target.value)}
            />
            <span className="hint">
              {noteCheck.reason ?? (
                <>
                  Komentarz jest jedyną treścią, jaką panel dopisuje do flagi. Trafia do audytu
                  razem z kontem i czasem UTC i zostaje widoczny w historii rozwiązanych.
                </>
              )}
            </span>
          </div>
          <KeyValue
            label="Rozwiąże"
            value={
              pilot == null ? '—' : <small>{`${pilot.name} · ${roleLabel(pilot.role).toLowerCase()}`}</small>
            }
          />
          <KeyValue label="Chwila zapisu" value={<small>resolved_at ustala serwer</small>} />
        </Card>
      ) : (
        <Card title="Rozstrzygnięcie" actions={<Pill tone="green">resolved</Pill>}>
          <KeyValue label="Kto" value={flag.resolvedBy ?? '—'} />
          <KeyValue label="Kiedy · UTC" value={utcStamp(flag.resolvedAt)} />
          <span className="hint">
            {flag.resolutionNote == null || flag.resolutionNote === ''
              ? 'Bez komentarza — wpis powstał przed wdrożeniem endpointu rozstrzygnięcia.'
              : `„${flag.resolutionNote}"`}
          </span>
        </Card>
      )}

      {!isOpen ? null : (
        <Banner tone="ok">
          <b>Co się stanie po rozwiązaniu.</b>{' '}
          {flag.blocksExport ? (
            <>
              Bramka <code>dayExporter</code> przestaje wycinać sesje objęte flagą, a karta
              doby generuje się od razu po zatwierdzeniu transakcji — tym razem KOMPLETNA,
              i odpowiedź serwera poda numer rewizji. Eksport idzie PO commicie, żeby dokument
              klubu nigdy nie opisał stanu, który się nie zapisał.
            </>
          ) : (
            <>
              Zmieni się status flagi i przybędzie wpis w audycie. Re-eksportu <b>nie
              będzie</b> — serwer ponawia karty wyłącznie dla <code>aircraft_overlap</code>,
              bo tylko ten typ jest bramką eksportera, a odpowiedź z rewizją po akcji, która
              na kartę nie wpłynęła, uczyłaby nieufności do narzędzia.
            </>
          )}{' '}
          Ślad akcji ląduje w audycie w tej samej transakcji, co zmiana.
        </Banner>
      )}

      <Card title="Dane naprawdę są złe?" actions={<Pill tone="red">inna droga</Pill>}>
        <span className="hint">
          Zamknięcie flagi nie zmienia ani jednej liczby w rejestrze. Jeżeli odczyt jest po
          prostu błędny albo brakuje zdarzenia, dopisuje je administrator <b>nowym zdarzeniem</b>{' '}
          <code>event_correction</code> na ekranie korekty dnia — oryginały zostają, a łańcuch
          MH przelicza się od nowa. Dopiero potem wracasz tutaj i zamykasz flagę komentarzem.
        </span>
        <div>
          <LinkButton to={correction.to} disabled={correction.disabled} reason={correction.reason ?? undefined}>
            <EditIcon size={13} />
            {correction.label}
          </LinkButton>
        </div>
      </Card>

      <Card title="Kto może co" actions={<Pill tone="dim">dwie role</Pill>}>
        <KeyValue label="Rozwiązanie flagi" value="administrator · szef wyszkolenia" tone="green" />
        <KeyValue label="Korekta zdarzenia" value="tylko administrator" tone="amber" />
        <span className="hint">
          Skrzynka flag jest <b>głównym narzędziem szefa wyszkolenia</b> — komentarz i zamknięcie
          sprawy (a więc też odblokowanie karty dnia) należą do niego tak samo jak do
          administratora. Korekta dopisuje zdarzenie do rejestru, więc zostaje przy
          administratorze. Przycisku nie chowamy: szef wyszkolenia widzi go wyszarzonego
          z powodem, żeby wiedział, kogo poprosić.
        </span>
      </Card>
    </Drawer>
  );
}

/**
 * `HttpError` → komunikat. Rozpakowanie wyjątku należy do ekranu, a nie do modułu
 * czystego: `resolveFailure` przyjmuje STATUS i CIAŁO, żeby dało się je przetestować
 * bez klienta HTTP — dokładnie jak `loginMessage` przy logowaniu.
 */
function failureOf(error: unknown) {
  if (isHttpError(error)) return resolveFailure(error.status, error.body as ApiErrorDto);
  return resolveFailure(null, null);
}

/** ISO z serwera → „31 JUL 2026 14:07". Kreska, gdy pola nie ma albo jest nieczytelne. */
function utcStamp(iso: string | null): string {
  if (iso == null) return '—';
  const at = Date.parse(iso);
  return Number.isNaN(at) ? '—' : `${dateUtcShort(at)} ${timeUtc(at)}`;
}
