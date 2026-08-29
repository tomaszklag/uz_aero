/**
 * UZ Aero - panel: KONSERWACJA (`design/admin/A11-konserwacja.html`).
 *
 * Cztery operacje serwisowe na danych, które już są w bazie. Trzy z nich przeliczają
 * albo powtarzają to, co da się odtworzyć ze strumienia zdarzeń; jedna - i tylko jedna -
 * naprawdę coś kasuje, i dlatego stoi w osobnej strefie na dole.
 *
 * **Rejestr `events` jest append-only i żadna operacja na tym ekranie go nie dotyka.**
 * Przebudowa CZYTA zdarzenia i nadpisuje wyłącznie projekcję; ponowienie eksportu buduje
 * kartę od nowa z tego samego strumienia; sprzątanie tokenów działa na tabeli sesji.
 *
 * Ekran jest `.tsx` BEZ arytmetyki i bez decyzji o treści: każdy napis, plakietka
 * i bramka pochodzą z czystych modułów obok (`rebuildDiff`, `rebuildRun`, `tokenPurge`,
 * `retryQueue`, `schemaRows`), które mają testy w Node.
 *
 * ══ CZEGO TEN EKRAN ŚWIADOMIE NIE POKAZUJE ══
 *  1. **Czasu przebiegu i daty ostatniej przebudowy** („18 JUL 06:12 · 3 min 41 s"
 *     z mockupu). Serwer nie zapamiętuje przebiegu: jedyny ślad zostaje w `admin_audit`
 *     i wyłącznie dla ZAPISU, bo porównanie świadomie nie zostawia wpisu. Ekran odsyła
 *     do dziennika zamiast pokazywać liczbę wziętą znikąd.
 *  2. **Licznika prób, czasu następnej próby i treści błędu eksportu.** Nieudany eksport
 *     nie zostawia śladu w żadnej tabeli - kolejki z ponawianiem system nie ma. Mockup
 *     sam to przyznaje; widać za to SKUTEK: dzień w stanie „Brak karty".
 * Oba są opisane NA EKRANIE, nie przemilczane.
 */

import { useEffect, useState } from 'react';

import type { ApiErrorDto } from '../../api/dto';
import { isHttpError } from '../../api/httpClient';
import { can, denialReason } from '../../auth/can';
import { useSessionState } from '../../auth/sessionContext';
import { useExports } from '../../queries/useExports';
import {
  useProjectionCompare,
  useRefreshTokens,
  useSchemaState,
} from '../../queries/useMaintenance';
import {
  usePurgeRefreshTokens,
  useRebuildProjections,
} from '../../queries/useMaintenanceCommands';
import { useRetryExport } from '../../queries/useRetryExport';
import {
  Banner,
  Button,
  Card,
  CellLink,
  Columns,
  DataTable,
  EmptyState,
  Field,
  KeyValue,
  LinkButton,
  NoAccess,
  PageHead,
  Pill,
  TextArea,
  TextInput,
  type Column,
} from '../../ui/components';
import { ExportIcon, LockIcon, WrenchIcon } from '../../ui/components/icons';
import { groupHref } from '../audit/auditFilters';
import { DEFAULT_EXPORTS_FILTER, exportsHref } from '../exports/exportsFilters';
import type { ExportRow } from '../exports/exportsRows';
import { retryLabel, retryMessage } from '../exports/exportsStates';
import { diffCaption, diffNotice, diffRows, diffValueHeaders, type DiffRow } from './rebuildDiff';
import {
  compareGate,
  currentReport,
  rebuildFailure,
  rebuildVerdict,
  runFacts,
  writeGate,
} from './rebuildRun';
import { queueCounts, queueEmpty, queueLabels, queueRows, queueTruncationNotice } from './retryQueue';
import { schemaFacts, schemaRows, schemaWarning, type SchemaRow } from './schemaRows';
import { isPurgeConfirmed, purgeGate, purgeMessage, PURGE_WORD, tokenFacts } from './tokenPurge';

/**
 * Ile dni z kolejki pobieramy NA ZAWĘŻENIE. BEZPIECZNIK, nie strona: kolejka ma być
 * krótka z natury (dzień bez karty jest usterką), a lista dłuższa niż to znaczy awarię,
 * o której i tak trzeba porozmawiać poza panelem.
 *
 * **Bezpiecznik przestał udawać całość.** Plakietki i liczby biorą się z `matched`
 * odpowiedzi (serwer liczy je POZA `limit`-em), a gdy limit obetnie listę, ekran mówi
 * to wprost banerem - tak samo jak `A05`. Wcześniej liczby powstawały z wierszy PO
 * obcięciu, więc przy 137 dniach bez karty plakietka mówiła „50" i milczała o reszcie.
 */
const QUEUE_LIMIT = 50;

export function MaintenanceScreen() {
  const { session } = useSessionState();
  const allowed = can(session?.capabilities, 'panel.access');
  const mayRun = can(session?.capabilities, 'maintenance.run');
  const mayPurge = can(session?.capabilities, 'accounts.manage');
  const mayRetry = can(session?.capabilities, 'fleet.manage');

  // Porównanie NIE odpala się przy wejściu na ekran: czyta cały strumień każdej sesji
  // w rejestrze. Uruchamia je człowiek, a `armed` trzyma tę decyzję.
  const [armed, setArmed] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmWord, setConfirmWord] = useState('');

  const compare = useProjectionCompare(armed && allowed && mayRun);
  const rebuild = useRebuildProjections();
  const tokens = useRefreshTokens(allowed && mayPurge);
  const purge = usePurgeRefreshTokens();
  const schema = useSchemaState(allowed && mayRun);

  // Kolejka to DWA zawężenia serwera, nie jedno zapytanie z filtrem w panelu: skład
  // listy jest własnością serwera (`?state=`), a plakietka z liczbą jest obietnicą
  // „tyle wierszy zobaczysz".
  const failed = useExports({ state: 'missing', limit: QUEUE_LIMIT }, allowed);
  const blocked = useExports({ state: 'blocked', limit: QUEUE_LIMIT }, allowed);
  const retry = useRetryExport();

  // Który z dwóch raportów opisuje bazę TERAZ - rozstrzyga STEMPEL, nie kolejność
  // w wyrażeniu. `rebuild.data ?? compare.data` dawało raport z zapisu także po
  // kolejnym porównaniu, bo wynik mutacji żyje, dopóki go ktoś nie zresetuje.
  const current = currentReport(
    { data: compare.data, at: compare.dataUpdatedAt },
    { data: rebuild.data, at: rebuild.submittedAt },
  );
  const report = current.report;

  // Wynik ostatniego czyszczenia przestaje opisywać to, co widać, gdy tabela zostanie
  // odczytana na nowo - a odczyt następuje zaraz po mutacji.
  const purgeReset = purge.reset;
  useEffect(() => {
    if (confirmWord === '') purgeReset();
  }, [confirmWord, purgeReset]);

  if (!allowed) {
    return (
      <NoAccess
        icon={<LockIcon size={22} />}
        title="KONSERWACJA"
        reason={denialReason('panel.access')}
        note={
          <>
            Operacje serwisowe wykonuje wyłącznie administrator. Ta pozycja nawigacji zostaje{' '}
            <b>widoczna</b> właśnie po to, żebyś nie musiał zgadywać, czy funkcji nie ma
            w produkcie, czy nie ma jej Twoje konto.
          </>
        }
      />
    );
  }

  const verdict = rebuildVerdict(report);
  const write = writeGate({ report, reason, mayWrite: mayRun, pending: rebuild.isPending });
  const run = compareGate(mayRun, compare.isFetching);
  const diffs = diffRows(report);
  const diffTruncated = diffNotice(report);
  const rebuildDenial = rebuild.isError
    ? rebuildFailure(
        isHttpError(rebuild.error) ? rebuild.error.status : null,
        isHttpError(rebuild.error) ? (rebuild.error.body as ApiErrorDto) : null,
      )
    : null;

  const rows = queueRows(failed.data?.items ?? [], blocked.data?.items ?? [], Date.now());
  // Liczby z ODPOWIEDZI serwera (`matched`), nie z wierszy po obcięciu - inaczej
  // plakietka opisywałaby okno, a udawała kolejkę.
  const counts = queueCounts(failed.data, blocked.data, rows.length);
  const queueTruncated = queueTruncationNotice(counts, QUEUE_LIMIT);
  const retryingUuid = retry.isPending ? (retry.variables ?? null) : null;
  const retryResult = retry.data?.retry;
  const retryNote =
    retryResult == null
      ? null
      : retryMessage(retryResult.outcome, retryResult.revisionBefore, retryResult.failure);

  const purgeState = purgeGate({
    scan: tokens.data,
    typed: confirmWord,
    mayPurge,
    pending: purge.isPending,
  });
  const purgeNote = purgeMessage(purge.data);
  const schemaAlert = schemaWarning(schema.data);
  const facts = schemaFacts(schema.data, Date.now());

  return (
    <>
      <PageHead
        title="KONSERWACJA"
        sub={
          <>
            Cztery operacje serwisowe na danych, które <b>już są</b> w bazie. Trzy z nich
            przeliczają albo powtarzają to, co da się odtworzyć ze strumienia zdarzeń; jedna -
            i tylko jedna - naprawdę coś kasuje, i dlatego stoi w osobnej strefie na dole.
          </>
        }
        actions={
          <LinkButton to={groupHref('konserwacja')} variant="ghost">
            Ślad akcji w audycie
          </LinkButton>
        }
      />

      <Banner tone="danger">
        <b>
          Rejestr <code>events</code> jest append-only i żadna operacja na tym ekranie go nie
          dotyka.
        </b>{' '}
        Przebudowa <b>czyta</b> zdarzenia i nadpisuje wyłącznie projekcje; ponowienie eksportu
        buduje kartę od nowa z tego samego strumienia; sprzątanie tokenów działa na tabeli
        sesji. Zdarzenia nie da się z panelu zmienić ani skasować - korekta to zawsze{' '}
        <b>dopisanie</b> <code>event_correction</code> na karcie dnia, a oryginalny odczyt
        zostaje w rejestrze na zawsze.
      </Banner>

      {/* ══ 1 · PRZEBUDOWA PROJEKCJI ══ */}
      <Columns>
        <Card
          title={
            <>
              1 · Przebudowa projekcji <code>sessions</code>
            </>
          }
          actions={
            <>
              <Pill tone="green">operacja odwracalna</Pill>
              <span className="code-ref">infrastructure/pg/common/sessionsProjection.ts</span>
            </>
          }
        >
          <Banner tone="status">
            <b>Ta operacja jest bezpieczna z definicji.</b> <code>sessions</code> nie jest
            źródłem prawdy - to zrzut <code>projectSession(events)</code>, odświeżany w tej
            samej transakcji, w której przyjmujemy zdarzenia. Każdy jej wiersz da się odtworzyć
            ze strumienia, więc przebudowa nie może zniszczyć żadnej informacji. Ryzyko leży
            gdzie indziej - w tym, <b>co robimy z wynikiem porównania</b>.
          </Banner>

          {compare.isError ? (
            <Banner tone="danger" live>
              <b>Nie udało się przeliczyć projekcji.</b> Panel działa wyłącznie online - to
              jedyne miejsce w systemie, w którym brak sieci wolno pokazać jako blokadę.
            </Banner>
          ) : null}

          {verdict == null ? (
            <Banner tone="status">
              <b>Porównania jeszcze nie było.</b> Przycisk obok czyta strumień każdej sesji
              w rejestrze i liczy projekcję w pamięci - baza zostaje nietknięta, a wynik nie
              trafia do dziennika audytu, bo nic się nie wydarzyło. Operacja jest kosztowna,
              więc nie uruchamia się sama przy wejściu na ekran.
            </Banner>
          ) : (
            <Banner tone={verdict.tone} live>
              <b>{verdict.title}</b> {verdict.body}
            </Banner>
          )}

          {diffs.length === 0 ? null : (
            <DataTable
              caption={diffCaption(report)}
              columns={diffColumns(diffValueHeaders(report))}
              rows={diffs}
              rowKey={(row) => row.key}
            />
          )}

          {diffTruncated == null ? null : (
            <Banner tone="warn" live>
              <b>Ta lista jest przycięta.</b> {diffTruncated}
            </Banner>
          )}

          <span className="hint">
            <b>Hipoteza do sprawdzenia, zanim cokolwiek zapiszesz.</b> Niezerowa różnica ma
            dwa wyjaśnienia. Pierwsze: wydanie domeny zmieniło regułę liczenia - wtedy
            przebudowa jest dokładnie tym, czego trzeba, bo strumień jest nietknięty
            i przeliczy go nowy kod. Drugie: coś zadziało się <b>poza normalną pracą serwera</b>{' '}
            - ręczny <code>UPDATE</code>, import albo odtworzenie z kopii zrobionej w połowie
            strumienia. Wyścigu dwóch paczek tu nie ma: ingest szereguje sesje blokadą advisory
            i zapisuje zdarzenia razem z projekcją w jednej transakcji. Rozstrzyga{' '}
            <CellLink to="/audyt" title="Dziennik akcji administratorów">
              audyt
            </CellLink>{' '}
            i data wydania, nie sam przycisk.
          </span>

          <span className="hint">
            <b>Czego przebudowa nie zrobi.</b> Nie doda kolumn, których projekcja nie ma -
            to zmiana kodu i wydanie, nie akcja z panelu. Nie dotknie też ani jednego wiersza{' '}
            <code>events</code>: rejestr jest append-only i pilnuje tego test architektury
            serwera, nie dobra wola tej operacji.
          </span>
        </Card>

        <div className="cols-stack">
          <Card title="Uruchomienie" actions={<Pill tone="dim">dwa kroki</Pill>}>
            {runFacts(current, Date.now()).map((fact) => (
              <KeyValue
                key={fact.label}
                label={fact.label}
                value={fact.value}
                unit={fact.unit}
                tone={fact.tone}
              />
            ))}

            <Field
              htmlFor="rebuild-reason"
              label="Powód nadpisania (trafia do audytu)"
              hint="Wymagany przez SERWER, nie przez ten formularz: żądanie bez powodu odbija się o trasę, a nie o przycisk."
            >
              <TextArea
                id="rebuild-reason"
                rows={3}
                value={reason}
                placeholder="Np.: różnica wyjaśniona zmianą reguły liczenia bloku w wydaniu z 24 JUL - potwierdzone w audycie wydania."
                onChange={(changeEvent) => setReason(changeEvent.target.value)}
              />
            </Field>

            <div className="row-actions">
              <Button
                variant="ghost"
                disabled={write.disabled}
                reason={write.reason ?? undefined}
                onClick={() => rebuild.mutate(reason)}
              >
                {write.label}
              </Button>
              <Button
                variant="primary"
                disabled={run.disabled}
                reason={run.reason ?? undefined}
                onClick={() => {
                  setArmed(true);
                  if (armed) void compare.refetch();
                }}
              >
                {run.label}
              </Button>
            </div>

            {rebuildDenial == null ? null : (
              <Banner tone={rebuildDenial.tone} live>
                <b>{rebuildDenial.title}</b> {rebuildDenial.body}
              </Banner>
            )}

            <span className="hint">
              Domyślna jest ta bezpieczniejsza: porównanie niczego nie zapisuje, więc można je
              puścić w każdej chwili - także po to, żeby po prostu sprawdzić, czy projekcja
              nadal się zgadza. Nadpisanie odblokowuje się dopiero po świeżym porównaniu
              i podaniu powodu.
            </span>
          </Card>

          <Card
            title="Ślad w audycie"
            actions={
              <CellLink to={groupHref('konserwacja')} title="Dziennik akcji administratorów">
                AUDYT →
              </CellLink>
            }
          >
            <KeyValue label="Akcja" value="maintenance.rebuild_projections" />
            <KeyValue label="Zapisujemy" value="liczba sesji · liczba różnic · powód" />
            <KeyValue label="Kto" value={session?.pilot.name ?? '-'} />
            <span className="hint">
              <b>Porównanie NIE zostawia wpisu - i to jest zmiana wobec mockupu.</b> Ślad
              w dzienniku powstaje wyłącznie przy nadpisaniu. Powód: <code>admin_audit</code>{' '}
              jest jedynym dokumentem odpowiadającym na pytanie „kto co zmienił", a podgląd
              niczego nie zmienia - wpis o nim rozmywałby tę odpowiedź. Cena jest nazwana:
              informacja „ktoś sprawdził i się zgadzało" nie jest odtwarzalna z dziennika.
            </span>
          </Card>
        </div>
      </Columns>

      {/* ══ 2 · KOLEJKA PONOWIEŃ EKSPORTU ══ */}
      <Card
        title="2 · Kolejka ponowień eksportu"
        actions={
          <>
            {queueLabels(counts).map((label) => (
              <Pill key={label.text} tone={label.tone}>
                {label.text}
              </Pill>
            ))}
            <span className="code-ref">application/common/export/dayExporter.ts</span>
          </>
        }
      >
        <Banner tone="warn">
          <b>
            Historii porażek nie ma w <code>export_log</code> - nie ma jej nigdzie.
          </b>{' '}
          Dziennik dostaje wiersz DOPIERO po udanym zapisie karty; odwrotna kolejność
          pokazywałaby na ekranie 11 telefonu link do arkusza, którego nie ma. Skutek uboczny
          tej (słusznej) decyzji: nieudana próba nie zostawia w bazie żadnego wiersza, więc
          kolumn „Próba" i „Następna" z mockupu <b>nie da się wypełnić</b> - kolejka
          z ponawianiem to osobna decyzja o schemacie. Widać za to skutek: dzień zamknięty
          bez karty.
        </Banner>

        {retryNote == null ? null : (
          <Banner tone={retryNote.tone} live>
            <b>{retryNote.title}</b> {retryNote.body}
          </Banner>
        )}

        {queueTruncated == null ? null : (
          <Banner tone="warn" live>
            <b>Kolejka jest dłuższa niż ta tabela.</b> {queueTruncated}{' '}
            <CellLink
              to={exportsHref({ ...DEFAULT_EXPORTS_FILTER, scope: 'missing' })}
              title="Monitor eksportu kart dziennych"
            >
              Eksporty →
            </CellLink>
          </Banner>
        )}

        {failed.isPending || blocked.isPending ? null : rows.length === 0 ? (
          <div className="table-wrap">
            <EmptyState
              icon={<ExportIcon size={22} />}
              title={queueEmpty().title}
              note={queueEmpty().note}
            />
          </div>
        ) : (
          <DataTable
            caption="Dni lotne czekające na kartę arkusza - czasy UTC"
            columns={queueColumns(mayRetry, retryingUuid, (row) => retry.mutate(row.sessionUuid))}
            rows={rows}
            rowKey={(row) => row.sessionUuid}
            rowClass={(row) => (row.flagged ? 'flagged' : undefined)}
          />
        )}

        <span className="hint">
          <b>Dlaczego przy pozycjach z flagą „Ponów" jest wyszarzone.</b>{' '}
          <code>dayExporter</code> sprawdza otwarte flagi <b>przed</b> zapisem karty i przy{' '}
          <code>aircraft_overlap</code> wychodzi po cichu - sporny dzień nie ma prawa utrwalić
          się w dokumencie klubu. Ponowienie dostałoby dokładnie ten sam wynik. Droga wiedzie
          przez{' '}
          <CellLink to="/flagi" title="Skrzynka flag">
            skrzynkę flag
          </CellLink>
          : rozwiązanie flagi jest tu jedyną skuteczną akcją naprawczą, a eksport rusza po niej
          sam. Ręczne „Ponów teraz" jest akcją administratora i zostawia w audycie nazwę karty,
          rewizję przed i po oraz wynik próby (<code>export.retry</code>) - tą samą komendą, co
          na ekranie{' '}
          <CellLink to="/eksporty" title="Monitor eksportu kart dziennych">
            Eksporty
          </CellLink>
          .
        </span>
      </Card>

      {/* ══ 3 · WYGASŁE REFRESH TOKENY - JEDYNA OPERACJA, KTÓRA KASUJE ══ */}
      <Card
        title="3 · Wygasłe refresh tokeny - jedyna operacja, która kasuje dane"
        actions={
          <>
            <Pill tone="red">nieodwracalne</Pill>
            <span className="code-ref">infrastructure/pg/admin/maintenanceRepo.ts</span>
          </>
        }
      >
        <Banner tone="danger">
          <b>Czego dokładnie dotyczy ta operacja.</b> Kasujemy wiersze tabeli{' '}
          <code>refresh_tokens</code>, w których <code>expires_at</code> jest w przeszłości. To
          są <b>tokeny sesji</b> - nie konta pilotów, nie zdarzenia, nie sesje lotne i nie
          karty dnia. <b>Żaden pilot nie zostanie przez to wylogowany</b>: token, który wygasł,
          i tak nie odnowi dostępu. Tokenów ważnych ta akcja NIE rusza - ich skasowanie
          wymusiłoby ponowne logowanie, a to jedyna czynność w systemie, która wymaga sieci,
          więc odcięłoby pilota w terenie. Warunek siedzi w SQL-u, nie w tym zdaniu.
        </Banner>

        {mayPurge ? null : (
          <Banner tone="status">
            <b>Stan tabeli tokenów czyta konto z zarządzaniem kontami.</b> Kreski niżej znaczą
            „Twoje konto nie ma zdolności <code>accounts.manage</code>", a nie „tabela jest
            pusta". Czyszczenie jedzie na tej samej zdolności, co unieważnianie sesji przy
            deaktywacji konta - bo to ta sama tabela i ta sama władza.
          </Banner>
        )}

        <Columns>
          <div>
            {tokenFacts(tokens.data).map((fact) => (
              <KeyValue
                key={fact.label}
                label={fact.label}
                value={fact.value}
                unit={fact.unit}
                tone={fact.tone}
              />
            ))}
            <span className="hint">
              <b>Dlaczego one się zbierają.</b> Rotacja kasuje wiersz tylko wtedy, gdy ktoś
              ten token <b>przedstawi</b> (<code>DELETE … RETURNING</code> przy odświeżeniu).
              Token porzucony - reinstalacja aplikacji, zgubiony telefon, wyłączone konto -
              nie zostanie przedstawiony nigdy i leży w tabeli bez końca. Crona nie ma, przy
              logowaniu też nic się nie kasuje; dopóki nie powstanie, sprząta się stąd ręcznie.
            </span>
          </div>

          <Card title="Potwierdzenie">
            <Field
              htmlFor="purge-confirm"
              label={`Wpisz ${PURGE_WORD}, żeby odblokować`}
              hint="To jest bramka dla człowieka. Bramką dla maszyny jest osobne pole w ciele żądania - serwer odmawia bez niego, bo POST da się wysłać bez panelu."
            >
              <TextInput
                id="purge-confirm"
                mono
                value={confirmWord}
                placeholder={PURGE_WORD}
                autoComplete="off"
                onChange={(changeEvent) => setConfirmWord(changeEvent.target.value)}
              />
            </Field>

            <KeyValue
              label="Skasuje"
              value={tokens.data == null ? '-' : String(tokens.data.expired)}
              unit="wierszy"
              tone="red"
            />
            <KeyValue
              label="Nie ruszy"
              value={tokens.data == null ? '-' : String(tokens.data.valid)}
              unit="ważnych"
              tone="green"
            />
            <KeyValue label="Wpis w audycie" value="maintenance.prune_tokens" />

            <Button
              variant="danger"
              block
              disabled={purgeState.disabled}
              reason={purgeState.reason ?? undefined}
              onClick={() => purge.mutate()}
            >
              {purgeState.label}
            </Button>

            {purge.isError ? (
              <Banner tone="danger" live>
                <b>Serwer odmówił czyszczenia.</b> Żądanie bez jawnego potwierdzenia jest
                odrzucane po stronie serwera - panel nie jest tu bramką i nie udaje nią być.
              </Banner>
            ) : null}

            <span className="hint">
              Do audytu trafia liczba skasowanych wierszy i zakres dat wygaśnięcia - nigdy
              same tokeny. Nie ma czego zapisać: w bazie leżą wyłącznie skróty SHA-256,
              a wartości tokenu nie zna nawet serwer.
            </span>
          </Card>
        </Columns>

        {purgeNote == null ? null : (
          <Banner tone={purgeNote.tone} live>
            <b>{purgeNote.title}</b> {purgeNote.body}
          </Banner>
        )}

        {isPurgeConfirmed(confirmWord) && !purgeState.disabled ? (
          <Banner tone="warn">
            <b>Potwierdzenie wpisane - przycisk jest odblokowany.</b> Operacji nie da się
            cofnąć; wiersze znikają z tabeli bez śladu poza liczbą w dzienniku audytu.
          </Banner>
        ) : null}
      </Card>

      {/* ══ 4 · STAN SCHEMATU I MIGRACJI ══ */}
      <Card
        title="4 · Stan schematu i migracji"
        actions={
          <>
            <Pill tone="dim">tylko do odczytu</Pill>
            <span className="code-ref">infrastructure/pg/schema.ts</span>
          </>
        }
      >
        <Columns even>
          <div>
            {facts.slice(0, 2).map((fact) => (
              <KeyValue
                key={fact.label}
                label={fact.label}
                value={fact.value}
                unit={fact.unit}
                tone={fact.tone}
              />
            ))}
          </div>
          <div>
            {facts.slice(2).map((fact) => (
              <KeyValue
                key={fact.label}
                label={fact.label}
                value={fact.value}
                unit={fact.unit}
                tone={fact.tone}
              />
            ))}
          </div>
        </Columns>

        {mayRun ? null : (
          <Banner tone="status">
            <b>Stan schematu czyta wyłącznie administrator.</b> Tabela jest pusta dlatego, że
            Twoje konto nie ma zdolności <code>maintenance.run</code> - a nie dlatego, że baza
            nie ma migracji. To jest ta sama zasada, co przy wyszarzonych przyciskach: panel
            mówi, czego brakuje, zamiast pokazywać zera.
          </Banner>
        )}

        {schema.data == null ? null : (
          <DataTable
            caption="Migracje schematu - numer, treść i chwila zastosowania, czasy UTC"
            columns={schemaColumns()}
            rows={schemaRows(schema.data)}
            rowKey={(row) => row.key}
          />
        )}

        {schemaAlert == null ? null : (
          <Banner tone="warn" live>
            <b>Baza jest starsza niż kod.</b> {schemaAlert}
          </Banner>
        )}

        <span className="hint">
          Ten ekran <b>nie uruchamia migracji</b> i nie ma tu przycisku, który by to robił.
          Schemat wprowadza <code>migrate()</code> przy starcie serwera - wdrożenie schematu
          jest wydaniem, nie akcją administratora. Panel pokazuje wyłącznie, na czym baza stoi
          teraz, żeby przy diagnozie nie trzeba było zaglądać do SQL-a.
        </span>
      </Card>
    </>
  );
}

/**
 * Kolumny tabeli różnic - dokładnie te z `A11-konserwacja.html`.
 *
 * Nagłówki dwóch kolumn wartości przychodzą Z ZEWNĄTRZ, bo po zapisie znaczą co innego
 * („Przed zapisem" / „Zapisano" zamiast „W sessions" / „Z przeliczenia"). Decyzja
 * o napisie mieszka w module czystym (`rebuildDiff.diffValueHeaders`), a nie tutaj.
 */
function diffColumns(headers: { stored: string; computed: string }): Column<DiffRow>[] {
  return [
    {
      key: 'session',
      header: 'Sesja',
      cellClass: 'mono dim',
      render: (row) => row.sessionShort,
    },
    {
      key: 'aircraft',
      header: 'Samolot',
      render: (row) => <span className="reg">{row.aircraftId}</span>,
    },
    {
      key: 'day',
      header: 'Dzień',
      cellClass: 'mono',
      render: (row) => (
        <>
          {row.day}
          <span className="cell-sub">UTC</span>
        </>
      ),
    },
    { key: 'field', header: 'Pole', cellClass: 'mono', render: (row) => row.field },
    {
      key: 'stored',
      header: headers.stored,
      align: 'num',
      render: (row) => row.stored,
    },
    {
      key: 'computed',
      header: headers.computed,
      align: 'num',
      // Wartość z przeliczenia jest wyróżniona, bo to ona jest NOWA - czytelnik
      // porównuje ją z sąsiednią kolumną, a nie czyta obu jako równorzędnych.
      render: (row) => <span className="cell-strong">{row.computed}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="row-actions">
          <LinkButton to={row.dayHref} variant="ghost" size="sm">
            Do dnia
          </LinkButton>
        </div>
      ),
    },
  ];
}

/**
 * Kolumny kolejki ponowień. Węższe niż na `A05`: tam ekran odpowiada na pytanie „co
 * stoi w tej karcie", tutaj na „co czeka na uwagę i czy da się z tym coś zrobić".
 */
function queueColumns(
  mayRetry: boolean,
  retryingUuid: string | null,
  onRetry: (row: ExportRow) => void,
): Column<ExportRow>[] {
  return [
    {
      key: 'tab',
      header: 'Karta',
      cellClass: 'mono',
      render: (row) => (
        <>
          {row.tab.text}
          <span className="cell-sub">{row.tab.sub}</span>
        </>
      ),
    },
    {
      key: 'aircraft',
      header: 'Samolot',
      render: (row) => (
        <>
          <span className="reg">{row.aircraft.reg}</span>
          <span className="cell-sub">{row.aircraft.type ?? 'typ nieznany'}</span>
        </>
      ),
    },
    {
      key: 'state',
      header: 'Powód, dla którego karta nie powstała',
      render: (row) => (
        <>
          <Pill tone={row.state.tone} dot={row.state.dot}>
            {row.state.text}
          </Pill>
          <span className="cell-sub">{row.state.sub}</span>
        </>
      ),
    },
    {
      key: 'exportedAt',
      header: 'Ostatni eksport · UTC',
      align: 'num',
      render: (row) => (
        <>
          {row.exportedAt.text}
          {row.exportedAt.sub == null ? null : (
            <span className="cell-sub">{row.exportedAt.sub}</span>
          )}
        </>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="row-actions">
          {row.flagHref == null ? (
            <LinkButton to={row.href} variant="ghost" size="sm">
              Karta
            </LinkButton>
          ) : (
            <LinkButton to={row.flagHref} variant="ghost" size="sm">
              Do flagi
            </LinkButton>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={!mayRetry || !row.canRetry || retryingUuid === row.sessionUuid}
            reason={
              mayRetry
                ? (row.retryReason ?? undefined)
                : 'Wymaga roli: administrator - ponowienie nadpisuje dokument klubu'
            }
            onClick={() => onRetry(row)}
          >
            {retryLabel(retryingUuid === row.sessionUuid)}
          </Button>
        </div>
      ),
    },
  ];
}

/** Kolumny tabeli migracji - numer, treść, data i stan. */
function schemaColumns(): Column<SchemaRow>[] {
  return [
    { key: 'version', header: '#', align: 'num', render: (row) => row.version },
    {
      key: 'title',
      header: 'Co wprowadza',
      render: (row) => <span className="cell-strong">{row.title}</span>,
    },
    {
      key: 'appliedAt',
      header: 'Zastosowana · UTC',
      align: 'num',
      render: (row) => row.appliedAt,
    },
    {
      key: 'state',
      header: 'Stan',
      render: (row) => (
        <Pill tone={row.state.tone} dot={row.state.dot}>
          {row.state.text}
        </Pill>
      ),
    },
  ];
}
