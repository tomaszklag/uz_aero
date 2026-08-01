/**
 * UZ Aero — panel: KARTA JEDNEGO DNIA LOTNEGO (`design/admin/A02a-dzien.html`).
 *
 * Jeden widok, dwa stany: dzień ZAMKNIĘTY (komplet liczb, `day_close` w rejestrze)
 * i dzień OTWARTY (sumy są stanem na ostatni sync). To nie są dwa ekrany — różnica
 * jest w danych, nie w układzie: sesja bez `day_close` po prostu nie ma odczytów
 * końcowych, więc panel pokazuje „—" zamiast ekstrapolować.
 *
 * Ekran jest `.tsx` BEZ arytmetyki: wszystkie liczby przychodzą z `projectSession`
 * policzonego przez serwer, a wszystkie napisy powstają w czystych modułach obok
 * (`dzienHeader`, `dzienSummary`, `dzienTimeline`, `dzienFlights`), które mają testy
 * w Node.
 *
 * Oś zdarzeń pokazuje TO, CO PRZYSZŁO: porządek chronologiczny nadał serwer, wiersze
 * unieważnione są przekreślone, a same korekty stoją na osi jako zwykłe wpisy.
 */

import { useNavigate, useParams } from 'react-router-dom';

import { useSessionState } from '../../auth/sessionContext';
import { useSessionDay } from '../../queries/useSessionDay';
import {
  Banner,
  Button,
  Card,
  Columns,
  DataTable,
  EmptyState,
  KeyValue,
  LinkButton,
  PageHead,
  Pill,
  Tile,
  TileGrid,
  Timeline,
  TimelineRow,
  type Column,
} from '../../ui/components';
import { DaysIcon, EditIcon } from '../../ui/components/icons';
import { discrepancyOf } from '../flagi/flagDetails';
import { shortUuid } from '../flagi/flagRows';
import { FLAG_TYPE_META } from '../flagi/flagTypes';
import { targetHref } from '../audyt/audytFilters';
import { KorektaDrawer } from '../korekta/KorektaDrawer';
import { flagAuditHref } from './dzienFlagAudit';
import { flightRows, type FlightRow } from './dzienFlights';
import { correctionAccess, correctionPath, dayBanner, dayHeader } from './dzienHeader';
import { dayTiles, dropRows, fuelRows, mhRows, sessionRows, utcStamp } from './dzienSummary';
import { timelineRows, timelineSummary } from './dzienTimeline';

export function DzienScreen() {
  // `targetUuid` jest obecny wyłącznie pod trasą korekty (`A02b`) — ta sama trasa,
  // ten sam ekran, szuflada NAD kartą dnia. Karta zostaje pod spodem, bo po zapisie
  // wraca się dokładnie do niej, żeby zobaczyć nowy wpis na osi zdarzeń.
  const { sessionUuid, targetUuid } = useParams();
  const navigate = useNavigate();
  const { session: panelSession } = useSessionState();
  const day = useSessionDay(sessionUuid ?? '');

  if (day.isPending) return null;

  if (day.isError) {
    return (
      <Banner tone="danger" live>
        <b>Nie udało się wczytać karty dnia.</b> Panel działa wyłącznie online. Jeżeli adres
        pochodzi z wklejonego linku, sprawdź też, czy <code>session_uuid</code> jest kompletny —
        serwer odpowiada „nie znaleziono" na sesję, której nie ma w projekcji.{' '}
        <Button variant="ghost" size="sm" onClick={() => void day.refetch()}>
          Ponów
        </Button>
      </Banner>
    );
  }

  const { session, state, timeline, flags } = day.data;
  const now = Date.now();

  const header = dayHeader(session, state);
  const banner = dayBanner(session, state, now);
  const correction = correctionAccess(state, panelSession?.capabilities);
  const rows = timelineRows(timeline);
  const flights = flightRows(state);
  const openFlags = flags.filter((flag) => flag.status === 'open');

  return (
    <>
      <PageHead
        title={header.title}
        sub={
          <>
            {header.lines.map((line) => (
              <span key={line}>
                {line}
                <br />
              </span>
            ))}
            Wszystkie liczby na tym ekranie pochodzą z <code>projectSession</code> — tej samej
            funkcji, którą telefon liczy statystyki dnia. Czasy UTC.
          </>
        }
        actions={
          <>
            {/* Prowadzi do MONITORA EKSPORTU zawężonego do tej sesji (`A05`), a nie do
                samej treści karty — i to jest wybór, nie skrót. Pytanie zadawane przy tym
                przycisku brzmi „co się stało z arkuszem tego dnia", a odpowiadają na nie
                trzy rzeczy naraz: stan karty, historia rewizji i dopiero potem jej treść.
                Monitor pokazuje wszystkie trzy w jednym miejscu i ma tam przycisk
                ponowienia; osobny podgląd samej treści byłby czwartym ślepym zaułkiem,
                z którego i tak trzeba by wrócić po kontekst.

                Adres jest AKTYWNY także dla dnia bez karty: „dlaczego karty nie ma" jest
                pytaniem, na które ten ekran odpowiada — wyszarzenie przycisku odbierałoby
                dostęp do odpowiedzi dokładnie wtedy, gdy jest potrzebna. */}
            <LinkButton to={`/eksporty/${session.sessionUuid}`} variant="ghost">
              {session.exportRevision == null
                ? 'Karta arkusza · brak'
                : `Karta arkusza · rewizja ${session.exportRevision}`}
            </LinkButton>
            {/* Korekta NIE MA tu przycisku „wejdź", bo nie ma dokąd wejść bez wskazania
                zdarzenia — wyborem jest oś zdarzeń niżej. Zostaje sama informacja:
                dostępna czy nie, a jeśli nie, to dlaczego. */}
            <LinkButton
              to=""
              variant="ghost"
              disabled
              reason={correction.reason ?? 'wybierz zdarzenie na osi zdarzeń dnia'}
            >
              <EditIcon size={13} />
              {correction.label}
            </LinkButton>
          </>
        }
      />

      <Banner tone={banner.tone}>
        <b>{banner.title}</b> {banner.body}
      </Banner>

      <TileGrid>
        {dayTiles(state, session.mhFormat).map((tile) => (
          <Tile
            key={tile.label}
            label={tile.label}
            value={tile.value}
            unit={tile.unit}
            tone={tile.tone}
            note={tile.note}
          />
        ))}
      </TileGrid>

      <Columns>
        <Card
          title="Oś zdarzeń dnia"
          actions={
            <>
              <Pill tone="blue">czasy UTC</Pill>
              <Pill tone={state.closed ? 'dim' : 'green'} live={!state.closed}>
                {timelineSummary(timeline)}
              </Pill>
            </>
          }
        >
          {rows.length === 0 ? (
            <EmptyState
              icon={<DaysIcon size={22} />}
              title="REJESTR TEJ SESJI JEST PUSTY"
              note="Wiersz projekcji istnieje, ale nie ma do niego ani jednego zdarzenia. To stan, którego nie powinno być — zgłoś go administratorowi razem z UUID-em sesji."
            />
          ) : (
            <Timeline>
              {rows.map((row) => (
                <TimelineRow
                  key={row.uuid}
                  time={row.time}
                  tone={row.dot}
                  name={row.name}
                  voided={row.voided}
                  badge={<Pill tone={row.badgeTone}>{row.badge}</Pill>}
                  // Oś JEST wyborem zdarzenia do korekty (`A02b`) — zna uuid-y i wie,
                  // które typy w ogóle jej podlegają. Przy zdarzeniu niekorygowalnym
                  // przycisku NIE MA w ogóle: wyszarzony w każdym drugim wierszu
                  // zamieniłby oś w płot z powodami, a powód jest tu zawsze ten sam
                  // i wynika z typu, nie ze stanu konta.
                  action={
                    row.audited || (correction.allowed && row.correctable) ? (
                      <>
                        {/* Zdarzenie już ruszone korektą dostaje przejście do
                            DZIENNIKA AUDYTU: `target_id` wpisu `event.correct` jest
                            uuid-em zdarzenia poprawianego, więc to jedyne miejsce,
                            w którym widać, KTO i DLACZEGO zmienił tę liczbę. Powód
                            korekty żyje wyłącznie w audycie — do rejestru nie trafia. */}
                        {row.audited ? (
                          <LinkButton to={targetHref('event', row.uuid)} variant="ghost" size="sm">
                            Audyt
                          </LinkButton>
                        ) : null}
                        {correction.allowed && row.correctable ? (
                          <LinkButton
                            to={correctionPath(session.sessionUuid, row.uuid)}
                            variant="ghost"
                            size="sm"
                          >
                            Koryguj
                          </LinkButton>
                        ) : null}
                      </>
                    ) : undefined
                  }
                  meta={row.meta.map((line) => (
                    <span key={line}>
                      {line}
                      <br />
                    </span>
                  ))}
                />
              ))}
            </Timeline>
          )}
          {correction.allowed ? null : (
            <span className="hint">
              <b>Korekta administratora jest tu niedostępna:</b> {correction.reason}. Dlatego przy
              wierszach osi nie ma przejścia do niej — nie jest ukryte, tylko nie ma czego
              proponować.
            </span>
          )}
          <span className="hint">
            Oś pokazuje <b>surowy rejestr</b>, w porządku chronologicznym nadanym przez serwer —
            panel jej nie przesortowuje. Zdarzenie unieważnione zostaje na niej{' '}
            <b>przekreślone, nie ukryte</b>: to właśnie te wiersze tłumaczą, dlaczego liczby dnia
            różnią się od tego, co zapisał telefon. Korekty stoją tu jako zwykłe wpisy, bo poprawia
            się fakt, nie poprawkę.
          </span>
        </Card>

        <div className="cols-stack">
          <Card title="Sesja">
            {sessionRows(session, state, timeline, now).map((row) => (
              <KeyValue key={row.label} label={row.label} value={row.value} tone={row.tone} />
            ))}
          </Card>

          <Card title="Paliwo" actions={<Pill tone="dim">litry</Pill>}>
            {fuelRows(state).map((row) => (
              <KeyValue key={row.label} label={row.label} value={row.value} tone={row.tone} />
            ))}
          </Card>

          <Card
            title="Motogodziny"
            actions={<Pill tone="dim">{session.mhFormat ?? 'format nieznany'}</Pill>}
          >
            {mhRows(state, session.mhFormat).map((row) => (
              <KeyValue key={row.label} label={row.label} value={row.value} tone={row.tone} />
            ))}
            <span className="hint">
              Wartości są w formacie licznika <b>tego samolotu</b> — panel nie przelicza ich na
              własną konwencję. W bazie motogodziny zawsze są liczbą dziesiętną; <code>hh:mm</code>{' '}
              to wyłącznie prezentacja, żeby zgadzała się z tym, co pilot widzi w kabinie.
            </span>
          </Card>

          {state.drops.count === 0 ? null : (
            <Card title="Zrzuty · strona przychodowa" actions={<Pill tone="blue">agregat dnia</Pill>}>
              {dropRows(state).map((row) => (
                <KeyValue
                  key={row.label}
                  label={row.label}
                  value={row.value}
                  unit={row.unit}
                  tone={row.tone}
                />
              ))}
              <span className="hint">
                Średnia wysokość liczy się wyłącznie z wyniesień, które ją mają — zrzut bez fixa
                GPS nie zaniża jej zerem, tylko wypada z próby.
              </span>
            </Card>
          )}
        </div>
      </Columns>

      {flights.length === 0 ? null : (
        <>
          <DataTable
            caption="Loty dnia — czasy UTC, po nałożeniu korekt"
            columns={FLIGHT_COLUMNS}
            rows={flights}
            rowKey={(row) => row.index}
          />
          <span className="hint">
            Loty pochodzą z projekcji, czyli ze strumienia <b>po nałożeniu korekt</b>: lot, którego
            fałszywe lądowanie unieważniono, ma tu już właściwy czas. Kolumn „Zrzut" i „Uwagi"
            z mockupu <b>nie ma</b> i to jest decyzja, nie przeoczenie — rozbicia skoczków na loty
            projekcja nie liczy, a odtworzenie go w panelu znaczyłoby wyprodukowanie liczby
            przychodowej, której serwer nigdy nie wysłał. Zrzuty widać na osi zdarzeń i w karcie
            obok; korekty — na osi, razem z powodem.
          </span>
        </>
      )}

      <Card
        title="Flagi dotyczące tego dnia"
        actions={
          <Pill tone={openFlags.length > 0 ? 'amber' : 'green'}>
            {openFlags.length > 0 ? `${openFlags.length} otwarte` : 'brak otwartych'}
          </Pill>
        }
      >
        {flags.length === 0 ? (
          <span className="hint">
            Serwer nie znalazł w tym dniu żadnej rozbieżności — ani w łańcuchu motogodzin, ani
            w paliwie, ani w zegarze, ani w nakładce sesji. Flagi zakłada wyłącznie ingest,
            przy przyjmowaniu zdarzeń; człowiek nie może ich tu dopisać.
          </span>
        ) : (
          <div className="table-wrap plain">
            <table>
              <caption className="visually-hidden">Flagi tej sesji, razem z rozwiązanymi</caption>
              <thead>
                <tr>
                  <th>Flaga</th>
                  <th>Warunek i wartości</th>
                  <th className="num">Rozbieżność</th>
                  <th className="num">Wykryta · UTC</th>
                  <th>Stan</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {flags.map((flag) => {
                  const meta = FLAG_TYPE_META[flag.type];
                  const discrepancy = discrepancyOf(flag);
                  const created = Date.parse(flag.createdAt);
                  const auditHref = flagAuditHref(flag);
                  return (
                    <tr key={flag.id}>
                      <td>
                        <Pill tone={meta.tone}>{flag.type}</Pill>
                        <span className="cell-sub">#{flag.id}</span>
                      </td>
                      <td className="dim">
                        {meta.condition}
                        <span className="cell-sub">{meta.short}</span>
                      </td>
                      <td className="num">
                        {discrepancy.main}
                        {discrepancy.sub == null ? null : (
                          <span className="cell-sub">{discrepancy.sub}</span>
                        )}
                      </td>
                      <td className="num">
                        {Number.isNaN(created) ? '—' : utcStamp(created)}
                        <span className="cell-sub">
                          {flag.sessionUuids.length > 1
                            ? `spina ${flag.sessionUuids.length} sesje`
                            : shortUuid(flag.sessionUuids[0] ?? '—')}
                        </span>
                      </td>
                      <td>
                        <Pill tone={flag.status === 'open' ? 'amber' : 'green'} dot={flag.status === 'open'}>
                          {flag.status}
                        </Pill>
                        {flag.resolvedBy == null ? null : (
                          <span className="cell-sub">{flag.resolvedBy}</span>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          {/* Wejście z kontekstem do dziennika audytu — ale TYLKO przy
                              sprawie rozstrzygniętej: wpis `flag.resolve` powstaje
                              dopiero w chwili rozstrzygnięcia, więc przy fladze otwartej
                              dziennik jest pusty z definicji (`dzienFlagAudit.ts`). */}
                          {auditHref == null ? null : (
                            <LinkButton to={auditHref} variant="ghost" size="sm">
                              Audyt
                            </LinkButton>
                          )}
                          <LinkButton to={`/flagi/${flag.id}`} variant="ghost" size="sm">
                            {flag.status === 'open' ? 'Rozwiąż' : 'Szczegóły'}
                          </LinkButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <span className="hint">
          Flaga <b>nie blokuje dnia i nie zmienia liczb</b> — opisuje rozbieżność, którą ma
          obejrzeć człowiek. Karta pokazuje też sprawy już <b>rozwiązane</b>, bo historia decyzji
          jest potrzebna dokładnie tam, gdzie widać jej powód. Rozstrzyga się je w skrzynce flag,
          osobno, każdą z własnym komentarzem i własnym śladem w audycie.
        </span>
      </Card>

      {targetUuid == null ? null : (
        <KorektaDrawer
          sessionUuid={session.sessionUuid}
          targetUuid={targetUuid}
          session={session}
          state={state}
          entry={timeline.find((item) => item.event.uuid === targetUuid) ?? null}
          pilot={panelSession?.pilot ?? null}
          // Zamknięcie zdejmuje z adresu cel korekty i zostawia kartę dnia — a nie
          // cofa w historii: po zapisie „wstecz" wróciłoby do formularza z tym samym
          // zdarzeniem, czyli zapraszało do dopisania drugiej korekty.
          onClose={() => void navigate(`/dni/${encodeURIComponent(session.sessionUuid)}`)}
        />
      )}
    </>
  );
}

/**
 * Kolumny tabeli lotów. Bez sortowania: porządek lotów w dniu jest ich numeracją,
 * a przestawianie go nie odpowiada na żadne pytanie.
 */
const FLIGHT_COLUMNS: Column<FlightRow>[] = [
  { key: 'index', header: 'Lot', align: 'num', render: (row) => row.index },
  { key: 'takeoff', header: 'Takeoff', align: 'num', render: (row) => row.takeoff },
  {
    key: 'landing',
    header: 'Landing',
    align: 'num',
    render: (row) =>
      row.open ? (
        <Pill tone="green" live>
          w powietrzu
        </Pill>
      ) : (
        row.landing
      ),
  },
  {
    key: 'duration',
    header: 'Czas lotu',
    align: 'num',
    render: (row) => row.duration,
  },
  {
    key: 'method',
    header: 'Metoda',
    render: (row) => <Pill tone={row.method.tone}>{row.method.label}</Pill>,
  },
  { key: 'cycle', header: 'Cykl silnika', align: 'num', render: (row) => row.cycle },
];
