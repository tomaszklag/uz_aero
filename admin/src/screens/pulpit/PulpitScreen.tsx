/**
 * UZ Aero — panel: PULPIT (`design/admin/A01-pulpit.html` i `A01a-pulpit-cisza.html`).
 *
 * ══ CZYM TEN EKRAN JEST W SYSTEMIE ══
 * Jedyny ekran panelu z GWARANTOWANĄ PUBLICZNOŚCIĄ — każdy zalogowany ląduje tu
 * pierwszy. Odpowiada na jedno pytanie: *czy coś wymaga mojej uwagi teraz*. Niczego nie
 * rozstrzyga; kieruje w miejsce, gdzie się to robi. Dlatego każdy kafel i każdy wiersz
 * ma dokąd prowadzić, a adresy z zawężeniem powstają w `pulpitLinks.ts`.
 *
 * ══ WARIANT „CISZA" JEST RÓWNIE WAŻNY JAK WARIANT Z RUCHEM ══
 * `A01a` nie jest stanem pustym na doczepkę. Pulpit, który zawsze coś krzyczy,
 * przestaje być czytany — a wtedy przestaje działać także wtedy, gdy naprawdę krzyczy.
 * Gdy nic nie lata, ekran wygląda jak POTWIERDZENIE, że jest dobrze: zielony baner
 * zamiast czerwonego, karta rozstrzygająca jedyne pytanie, jakie zostaje na pustym
 * pulpicie („czy to »dziś nikt nie lata«, czy »nic do nas nie dociera«"), i podsumowanie
 * ostatniego dnia lotnego zamiast dzisiejszych zer. Werdykt liczy `pulpitCisza.ts`.
 *
 * ══ EKRAN NIE LICZY I NIE DECYDUJE O TREŚCI ══
 * `.tsx` bez arytmetyki: kafle, wiersze floty, kolejka uwagi, słupki wykresu, oś
 * ostatnio przyjętych, werdykt ciszy i sumy doby pochodzą z czystych modułów obok,
 * każdy z testem w Node. Wieki („sync 2 min temu") liczymy względem `data.at`, czyli
 * ZEGARA SERWERA — nie `Date.now()` przeglądarki, bo stemple po drugiej stronie
 * porównania nadaje baza.
 *
 * ══ CZEGO TEN EKRAN ŚWIADOMIE NIE POKAZUJE (i mówi o tym wprost) ══
 *  1. **Zrzutów i skoczków** w „Dziś w liczbach" — projekcja `sessions` nie ma takich
 *     kolumn. Komórka stoi z kreską, nie z zerem.
 *  2. **Przejścia do rejestru zdarzeń** (`A04`) — ekran nie powstał, więc przycisk jest
 *     zablokowany z powodem, a wiersze prowadzą na kartę DNIA, do którego zdarzenie
 *     należy. Martwego linku nie zostawiamy.
 */

import type { ReactNode } from 'react';

import { useDashboard } from '../../queries/useDashboard';
import {
  Banner,
  Button,
  Card,
  Columns,
  EmptyState,
  FleetRow,
  KeyValue,
  LinkButton,
  PageHead,
  Pill,
  Sparkline,
  TaskRow,
  Tile,
  TileGrid,
  Timeline,
  TimelineRow,
} from '../../ui/components';
import {
  ClockIcon,
  ExportIcon,
  PlaneIcon,
  SuccessIcon,
  WarningIcon,
} from '../../ui/components/icons';
import { ciszaView, isQuiet } from './pulpitCisza';
import { FLEET_EMPTY, fleetNowRows } from './pulpitFleet';
import { MISSING_SCREENS, dniOtwarteHref, flagiHref } from './pulpitLinks';
import { RECENT_EMPTY, recentRows } from './pulpitRecent';
import { sparkNote, sparkView } from './pulpitSpark';
import { pulpitTiles } from './pulpitTiles';
import { TODO_EMPTY, todoTasks, type TaskKind } from './pulpitTodo';
import { dayView } from './pulpitToday';

/** Ikona wiersza kolejki wg rodzaju sprawy — mapa, nie `if` w JSX-ie. */
const TASK_ICON: Record<TaskKind, ReactNode> = {
  flag: <WarningIcon size={14} />,
  export: <ExportIcon size={14} />,
  open_day: <ClockIcon size={14} />,
};

export function PulpitScreen() {
  const dashboard = useDashboard();
  const data = dashboard.data ?? null;

  // Wieki liczymy względem zegara SERWERA. Przy braku odpowiedzi nie ma czego liczyć,
  // a `Date.now()` byłby trzecim zegarem w równaniu, którego nikt nie sprawdza.
  const nowMs = data == null ? 0 : Date.parse(data.at);
  const quiet = data != null && isQuiet(data);
  const cisza = data == null ? null : ciszaView(data);

  const tiles = pulpitTiles(data);
  const fleet = data == null ? [] : fleetNowRows(data.fleet, nowMs);
  const tasks =
    data == null ? [] : todoTasks(data.attention, nowMs, data.correctionWindowMs);
  const spark = data == null ? null : sparkView(data.inflow);
  const recent = data == null ? [] : recentRows(data.recent);
  // W ciszy pokazujemy OSTATNI dzień lotny, bo dzisiejsze zera nie odpowiadają na
  // żadne pytanie. Poza ciszą — dziś, bo o to właśnie się wtedy pyta.
  const day =
    data == null ? null : dayView(quiet ? (data.lastFlyingDay ?? data.today) : data.today);

  return (
    <>
      <PageHead
        title="PULPIT"
        sub={
          quiet
            ? 'Dziś nikt nie lata. Pulpit nie ma wtedy nic do pokazania — ma za to jedno pytanie do rozstrzygnięcia: czy ta pustka bierze się stąd, że nic się nie dzieje, czy stąd, że nic do nas nie dociera.'
            : 'Stan floty i kolejka rzeczy do wyjaśnienia. Pulpit niczego nie rozstrzyga — kieruje w miejsce, gdzie się to robi. Czasy UTC.'
        }
        actions={
          <>
            <Button
              variant="ghost"
              onClick={() => void dashboard.refetch()}
              disabled={dashboard.isFetching}
              reason={dashboard.isFetching ? 'trwa pobieranie' : undefined}
            >
              Odśwież
            </Button>
            {data != null && data.counts.openFlags > 0 ? (
              <LinkButton to={flagiHref()} variant="primary">
                {`${data.counts.openFlags} flag do wyjaśnienia`}
              </LinkButton>
            ) : (
              <LinkButton to={dniOtwarteHref()} variant="ghost">
                Dni bez zamknięcia
              </LinkButton>
            )}
          </>
        }
      />

      {dashboard.isError ? (
        <Banner tone="danger" live>
          <b>Nie udało się pobrać pulpitu.</b> Panel działa wyłącznie online — to jedyne
          miejsce w systemie, w którym brak sieci wolno pokazać jako blokadę. Kafle poniżej
          pokazują <b>„—", a nie zero</b>: „0 otwartych flag" przy awarii pobrania byłoby
          najgorszym możliwym komunikatem, bo wygląda jak dobra wiadomość.{' '}
          <Button variant="ghost" size="sm" onClick={() => void dashboard.refetch()}>
            Ponów
          </Button>
        </Banner>
      ) : cisza != null && quiet ? (
        <Banner tone={cisza.verdict === 'expected' ? 'ok' : 'warn'}>
          <b>{`${cisza.label}.`}</b> {cisza.headline}
        </Banner>
      ) : (
        <Banner tone="status">
          <b>To nie jest podgląd lotu na żywo.</b> Panel pokazuje ostatnie zdarzenia, które
          dotarły z telefonów. Pilot pracuje offline-first — brak zasięgu nie zatrzymuje
          jego pracy, tylko opóźnia jej widoczność tutaj. Przy każdym samolocie stoi wiek
          ostatniej synchronizacji.
        </Banner>
      )}

      <TileGrid>
        {tiles.map((tile) => (
          <Tile
            key={tile.key}
            label={tile.label}
            value={tile.value}
            note={tile.note}
            to={tile.to}
            {...(tile.unit == null ? {} : { unit: tile.unit })}
            {...(tile.tone == null ? {} : { tone: tile.tone })}
          />
        ))}
      </TileGrid>

      {cisza == null || !quiet ? null : (
        <Card
          title="Cisza spodziewana czy podejrzana"
          actions={
            <>
              <Pill tone={cisza.verdict === 'expected' ? 'green' : 'amber'} dot>
                {cisza.verdict === 'expected' ? 'spodziewana' : 'do sprawdzenia'}
              </Pill>
              <Pill tone="dim">czasy UTC</Pill>
            </>
          }
        >
          <Columns even>
            <div>
              {cisza.facts.map((fact) => (
                <KeyValue
                  key={fact.key}
                  label={fact.label}
                  value={fact.value}
                  {...(fact.tone == null ? {} : { tone: fact.tone })}
                />
              ))}
            </div>
            <div className="cols-stack">
              {cisza.reasons.length === 0 ? (
                <Banner tone="ok">
                  <b>Wszystkie cztery warunki spełnione.</b> Żaden samolot nie ma otwartego
                  claimu, żaden dzień nie stoi bez <code>day_close</code> dłużej niż dobę,
                  ostatnie zdarzenie jest świeższe niż próg podejrzenia, a każda karta dnia
                  jest w arkuszu. <b>Pustka jest zgodna z projektem</b> — telefony nie mają
                  czego wysłać i nie meldują się „na wszelki wypadek".
                </Banner>
              ) : (
                <Banner tone="warn">
                  <b>Ta sama pustka znaczy tu „cisza podejrzana".</b> Pękł co najmniej jeden
                  z czterech warunków, które panel sprawdza:
                  <ul className="reason-list">
                    {cisza.reasons.map((reason) => (
                      <li key={reason.key}>{reason.text}</li>
                    ))}
                  </ul>
                </Banner>
              )}
              <span className="hint">
                <b>Sam brak wierszy nie rozstrzyga niczego.</b> „Dziś nikt nie lata"
                i „wszystkie telefony milczą od doby" zapisują się w bazie identycznie —
                jako nic. Dlatego pulpit nie liczy zdarzeń, tylko patrzy,{' '}
                <b>czym skończył się ostatni strumień</b>: domknięty dzień to cisza, urwany
                claim to alarm, nawet jeśli licznik w obu przypadkach pokazuje zero.
              </span>
            </div>
          </Columns>
        </Card>
      )}

      <Columns wide>
        <div className="cols-stack">
          <Card title="Flota teraz" actions={<Pill tone="dim">czasy UTC</Pill>}>
            {fleet.length === 0 ? (
              <EmptyState
                icon={<PlaneIcon size={22} />}
                title={FLEET_EMPTY.title}
                note={FLEET_EMPTY.note}
              />
            ) : (
              <div className="fleet">
                {fleet.map((row) => (
                  <FleetRow
                    key={row.id}
                    to={row.to}
                    className={row.rowClass}
                    reg={row.reg}
                    type={row.type}
                    who={row.who}
                    since={row.since}
                    mh={row.mh}
                    fuel={row.fuel}
                    badge={row.badge}
                    freshClass={row.freshClass}
                    freshText={row.freshText}
                    freshNote={row.freshNote}
                  />
                ))}
              </div>
            )}
            <span className="hint">
              <b>Liczniki fizyczne wygrywają.</b> MH i FOB w tej tabeli są podpowiedzią dla
              pilota na preflight, nie prawdą — pilot patrzy na licznik i to jego odczyt
              trafia do rejestru. Brak odczytu to <b>„—"</b>, nigdy zero.{' '}
              <b>„W locie" liczy serwer</b> z projekcji strumienia otwartej sesji; wiek
              synchronizacji obok mówi, ile ta wiedza jest warta.
            </span>
          </Card>

          <Card
            title="Wymaga uwagi"
            actions={
              <LinkButton to={flagiHref()} variant="ghost" size="sm">
                Wszystkie flagi
              </LinkButton>
            }
          >
            {tasks.length === 0 ? (
              <EmptyState
                icon={<SuccessIcon size={22} />}
                title={TODO_EMPTY.title}
                note={TODO_EMPTY.note}
              />
            ) : (
              <div className="todo">
                {tasks.map((task) => (
                  <TaskRow
                    key={task.key}
                    to={task.to}
                    tone={task.tone}
                    icon={TASK_ICON[task.kind]}
                    name={task.name}
                    meta={task.meta}
                    age={task.age}
                    old={task.old}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="cols-stack">
          <Card title="Napływ zdarzeń" actions={<Pill tone="dim">12 h</Pill>}>
            {spark == null ? (
              <span className="hint">Brak danych — pulpit się nie pobrał.</span>
            ) : (
              <>
                <Sparkline
                  bars={spark.bars}
                  axis={spark.axis}
                  label={`Napływ zdarzeń w ostatnich 12 godzinach: ${spark.total} przyjętych`}
                />
                <span className="hint">{sparkNote(spark)}</span>
              </>
            )}
          </Card>

          <Card
            title="Ostatnio przyjęte"
            actions={
              // Mockup prowadzi stąd do rejestru zdarzeń (`A04`). Tego ekranu nie ma,
              // więc przycisk jest ZABLOKOWANY Z POWODEM, a nie linkiem do strony
              // „w budowie". Wiersze prowadzą na kartę dnia — miejsce, które istnieje
              // i pokazuje zdarzenie w pełnym kontekście.
              <Button variant="ghost" size="sm" disabled reason={MISSING_SCREENS.zdarzenia}>
                Rejestr
              </Button>
            }
          >
            {recent.length === 0 ? (
              <EmptyState
                icon={<ClockIcon size={22} />}
                title={RECENT_EMPTY.title}
                note={RECENT_EMPTY.note}
              />
            ) : (
              <Timeline compact>
                {recent.map((row) => (
                  <TimelineRow
                    key={row.key}
                    time={row.time}
                    tone={row.dot}
                    name={row.name}
                    meta={row.meta}
                  />
                ))}
              </Timeline>
            )}
            <span className="hint">
              Kolumna czasu to <b>czas zdarzenia</b>, a porządek listy — <b>czas przyjęcia</b>{' '}
              przez serwer. Przy pilocie pracującym offline te dwie wielkości potrafią
              dzielić godziny; różnicę wypisujemy przy wierszu, gdy przekroczy pięć minut.
            </span>
          </Card>

          {day == null ? null : (
            <Card
              title={quiet ? 'Ostatni dzień lotny' : 'Dziś w liczbach'}
              actions={
                <LinkButton to={day.to} variant="ghost" size="sm">
                  {day.day}
                </LinkButton>
              }
            >
              <div className="day-grid">
                {day.cells.map((cell) => (
                  <span key={cell.key}>
                    <span className="tile-key">{cell.label}</span>
                    <span className={cell.tone == null ? 'tile-val sm' : `tile-val sm ${cell.tone}`}>
                      {cell.value}
                      {cell.unit == null ? null : <small> {cell.unit}</small>}
                    </span>
                  </span>
                ))}
              </div>
              <span className="hint">{day.note}</span>
            </Card>
          )}
        </div>
      </Columns>
    </>
  );
}
