/**
 * Ninerdeck - panel 2.0: karta pilota - zmiana członkostwa w klubie (`#/piloci/:id`).
 *
 * Trzy sekcje i tyle: kim jest, co mu wolno, czy ma dostęp. Panel 1.0 miał w tym miejscu
 * pięć sekcji, sześć banerów i 2 700 znaków prozy tłumaczącej budowę systemu - w tym
 * cztery wiersze o rodzajach sesji, których pilot nigdy nie zobaczy.
 *
 * == KARTA OPISUJE CZŁONKOSTWO, NIE CZŁOWIEKA (wielofirmowość, issue #101 E3) ==
 * Stąd podział na „Osobę" (imię i konto Google - wspólne dla wszystkich jej klubów)
 * i „W tym klubie" (kod, rola, dostęp - własność członkostwa). Ta sama osoba w drugim
 * klubie ma inny kod i może mieć inną rolę, więc wyłączenie tutaj odcina ją od TEGO
 * klubu i od żadnego innego.
 *
 * == ZAKLADANIA KONTA TU NIE MA (issue #100, D3) ==
 * Karta zmienia członkostwo, które już istnieje. Nowy członek wchodzi WYŁĄCZNIE kodem
 * klubu, a zatwierdza go administrator w karcie ZGŁOSZENIA (`RequestDrawer`); z panelu
 * klubu nie da się nikogo dopisać ani adresem, ani linkiem.
 *
 * == KLUB NIE NADAJE POSWIADCZEN (2.1.0, `docs/logowanie-haslem.md` §5.4) ==
 * Karta nie pokazuje hasła, nie ustawia go i nie pokazuje linku - ma jeden przycisk,
 * który WYSYŁA list. To dokładnie ten sam list, który ten człowiek wysłałby sobie sam
 * przez „Nie pamiętam hasła": inny wyzwalacz, ten sam token, ta sama strona.
 * Administrator wysyła, nie dyktuje - kodu do podyktowania nie ma w produkcie.
 *
 * Plakietki pod adresem mówią, KTÓRYMI METODAMI ta osoba wchodzi. To informacja o stanie
 * konta, nie ustawienie: klub nie włącza ani nie wyłącza metod.
 *
 * == SKUTEK MOWIMY PRZED AKCJA, NIE PO NIEJ ==
 * Wyłączenie członkostwa pyta o potwierdzenie i w pytaniu mówi trzy rzeczy, które trzeba
 * wiedzieć: co z dostępem, co z danymi i co z innymi klubami tej osoby. Po akcji zostaje
 * jedno zdanie potwierdzenia.
 * Odwrotna kolejność (baner po fakcie, tłumaczący co się właśnie stało) była w 1.0
 * i jest odwróceniem ról: człowiek dowiadywał się o skutku, gdy nie mógł już nic zrobić.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import type { PasswordLinkSentDto, PilotListItemDto } from '../../api/dto';
import {
  useDeletePilot,
  usePilotSessions,
  useRevokeAllPilotSessions,
  useRevokePilotSession,
  useSendPasswordLink,
  useSetPilotActive,
  useUpdatePilot,
} from '../../queries/usePilotCommands';
import {
  Banner,
  Button,
  Card,
  Drawer,
  Field,
  Loadable,
  OptionButton,
  Pill,
  Select,
  TextInput,
} from '../../ui/components';
import { CheckIcon } from '../../ui/components/icons';
import { conflictField, errorMessage, refusalOf } from '../common/apiMessage';
import { SessionList } from '../common/SessionList';
import { linkBlocker, linkFailureText, linkSentText, methodLabels } from './passwordAccess';
import { lastSeenText, sessionRows } from './sessionRows';
import {
  deleteBlocker,
  draftKey,
  draftOf,
  EMPTY_ACCOUNT,
  hasChanges,
  normalizeCode,
  updateBodyOf,
  verdictOf,
  type AccountDraft,
} from './accountForm';
import { accountConflictMessage, accountRefusalMessage, SELF_ACCOUNT } from './accountRefusal';
import {
  CAPABILITY_LABELS,
  CLUB_CAPABILITIES,
  CUSTOM_SCOPE,
  presetOf,
  SCOPE_PRESETS,
  scopeSummary,
  toggleCapability,
} from './scope';

interface AccountDrawerProps {
  /** Identyfikator OSOBY z listy członków klubu. */
  id: string;
  /** `null` = lista jeszcze nie przyszła; pusta tablica = przyszła i jest pusta. */
  pilots: PilotListItemDto[] | null;
  listPending: boolean;
  manages: boolean;
  selfId: string | null;
  onClose: () => void;
}

export function AccountDrawer({
  id,
  pilots,
  listPending,
  manages,
  selfId,
  onClose,
}: AccountDrawerProps) {
  const pilot = pilots?.find((item) => item.id === id) ?? null;

  const [draft, setDraft] = useState<AccountDraft>(EMPTY_ACCOUNT);
  /**
   * Które potwierdzenie jest otwarte. JEDEN stan, nie dwie flagi: dwa pytania „czy na
   * pewno" naraz w jednej karcie to dwa czerwone bloki, z których człowiek odpowiada
   * na niewłaściwy.
   */
  const [confirm, setConfirm] = useState<'disable' | 'delete' | null>(null);
  // ZAKRES JEST ZWINIĘTY DOMYŚLNIE, BEZ WYJĄTKÓW (uwaga właściciela 2026-09-23).
  // Pierwsza wersja rozwijała listę przy „własnym zakresie", bo wtedy nazwa zestawu
  // nie mówi nic - ale wyjątek kosztował więcej, niż dawał: karta miała dwie wysokości
  // zależne od danych, a szuflada skakała między członkami. Odpowiedź na „co ten
  // człowiek może" niesie PODPIS, a pełna lista jest dla tego, kto przyszedł ZMIENIAĆ.
  const [scopeOpen, setScopeOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  /**
   * Potwierdzenie OSTATNIEJ wysyłki linku (2.1.0) - stan ekranu, nie danych: mówi
   * o kliknięciu, które właśnie padło w tym oknie, więc nie ma go skąd wziąć po
   * odświeżeniu i nie ma po co trzymać w cache'u.
   */
  const [linkSent, setLinkSent] = useState<PasswordLinkSentDto | null>(null);

  // Wysyłka linku stoi PRZED efektem szkicu, bo on ją gasi przy zmianie konta.
  const sendLink = useSendPasswordLink();

  // Szkic przestawia się DOKŁADNIE wtedy, gdy zmienia się tożsamość edytowanego konta
  // - także przy jego PIERWSZYM pojawieniu się, bo przy wejściu z linku szuflada
  // montuje się przed listą (`draftKey` opisuje to szerzej). Odświeżenie listy po
  // zapisie klucza nie zmienia, więc nie kasuje wpisanych zmian.
  const synced = useRef<string | null>(null);
  useEffect(() => {
    const key = draftKey(pilot);
    // `key == null` znaczy dokładnie `pilot == null`; warunek na obiekcie stoi obok,
    // żeby kompilator widział zawężenie bez wykrzyknika.
    if (pilot == null || synced.current === key) return;
    synced.current = key;
    setDraft(draftOf(pilot));
    setConfirm(null);
    setDone(null);
    // Potwierdzenie wysyłki I JEJ ODMOWA dotyczą KONKRETNEJ osoby - przy zmianie karty
    // muszą zgasnąć, inaczej „wysłano na barbara@…" wisiałoby nad kartą kogoś innego.
    setLinkSent(null);
    sendLink.reset();
    // `sendLink` NIE jest zależnością celowo: efekt patrzy na TOŻSAMOŚĆ konta, a nie na
    // stan mutacji - dopisanie jej przestawiałoby szkic przy każdym kliknięciu „Wyślij".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pilot]);

  const update = useUpdatePilot();
  const setActive = useSetPilotActive();
  const remove = useDeletePilot();
  const revoke = useRevokePilotSession();
  const revokeAll = useRevokeAllPilotSessions();
  // Urządzenia czyta wyłącznie ten, kto może nimi zarządzać: bez `accounts.manage`
  // odpowiedź byłaby 403, czyli czerwony baner na karcie, na której nic złego się nie
  // stało (ta sama reguła, co przy kolejce zgłoszeń i kodzie klubu).
  const sessions = usePilotSessions(pilot?.id ?? null, manages);

  const pending = update.isPending || setActive.isPending || remove.isPending;
  // Nieudane wylogowanie urządzenia wchodzi do tego samego banera, co reszta zapisów:
  // bez niego kliknięcie „Wyloguj" w sesję, którą ktoś właśnie zdjął, nie robiłoby NIC
  // widocznego - a akcja bez śladu wygląda jak martwy przycisk.
  const error = update.error ?? setActive.error ?? remove.error ?? revoke.error ?? revokeAll.error;

  const verdict = verdictOf(draft);
  // `pilot == null` znaczy tu „wklejony link do konta spoza bieżącego zawężenia" -
  // nie ma czego zapisać, więc zapis jest nieczynny (karta mówi to niżej osobno).
  const changed = pilot != null && hasChanges(pilot, draft);
  const readOnly = !manages;

  const field = conflictField(error);
  const conflict = accountConflictMessage(field);
  const refusal = refusalOf(error);
  const refusalText = refusal == null ? null : accountRefusalMessage(refusal);

  // Odmowa reguły i konflikt pola mają SWOJE miejsca (baner / pole), więc zdanie
  // ogólne zostaje wyłącznie dla reszty - inaczej ekran mówiłby to samo dwa razy.
  const generalError =
    error == null || conflict != null || refusalText != null ? null : errorMessage(error);

  // Nieudana wysyłka linku ma WŁASNE zdanie, bo ma własne drogi wyjścia (brak adresu,
  // limit, niedoręczony list) - `errorMessage` nie zna żadnej z nich.
  const linkError = sendLink.error == null ? null : linkFailureText(sendLink.error);

  const save = (): void => {
    if (pilot == null) return;
    update.mutate(
      { id: pilot.id, body: updateBodyOf(pilot, draft) },
      { onSuccess: () => setDone('Zapisano.') },
    );
  };

  const title = pilot?.name ?? 'Pilot';
  const sub = pilot == null ? 'Konto spoza listy' : subtitleOf(pilot, Date.now());

  return (
    <Drawer
      title={title}
      sub={
        <>
          {sub}
          {readOnly ? <Pill tone="dim">Tylko podgląd</Pill> : null}
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
              disabled={pending || !verdict.complete || verdict.blocker != null || !changed}
              reason={verdict.blocker ?? undefined}
            >
              {pending ? 'Zapisuję…' : 'Zapisz'}
            </Button>
          </>
        )
      }
    >
      {/* Konto spoza listy: wklejony link do kogoś, kogo bieżące zawężenie nie pokazuje. */}
      {pilot == null && !listPending ? (
        <Card title="Nie ma go na liście">
          <p className="hint">
            Wyszukiwanie albo zawężenie ukrywa to konto.{' '}
            <Link to="/piloci">Pokaż wszystkich</Link>
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
      {linkError == null ? null : (
        <Banner tone="warn" live>
          {linkError}
        </Banner>
      )}
      {done == null ? null : (
        <Banner tone="ok" live>
          {done}
        </Banner>
      )}

      {/* OSOBA: to, co jest wspólne dla WSZYSTKICH klubów tego człowieka. */}
      <Card title="Osoba">
        <Field htmlFor="name" label="Imię i nazwisko">
          <TextInput
            id="name"
            value={draft.name}
            disabled={readOnly}
            invalid={verdict.invalid.includes('name')}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </Field>

        {/* E-MAIL JEST DO ODCZYTU: to adres, którym osoba się loguje - Googlem, hasłem
            albo jednym i drugim - a klub nie ma nad nim władzy. Do 2.0.0 pole było
            edytowalne, bo wpisany zawczasu adres podpinał konto; ta droga należy dziś
            do platformy (pierwszy administrator klubu), a członek wchodzi kodem.

            Etykieta brzmi „Logowanie", nie „Konto Google" (2.1.0): adres przestał być
            wyłącznie adresem Google. */}
        <Field
          htmlFor="email"
          label="Logowanie"
          hint="Adres, którym się loguje. Klub go nie zmienia."
        >
          <TextInput id="email" mono value={draft.email} disabled />
        </Field>

        {/* Rząd plakietek istnieje TYLKO z metodami: pusta ramka pod adresem wyglądałaby
            jak nieudany odczyt, a „nikt jeszcze nie wszedł" mówi już sam brak. */}
        {pilot == null || pilot.loginMethods.length === 0 ? null : (
          <div className="pill-row" aria-label="Metody logowania">
            {methodLabels(pilot.loginMethods).map((label) => (
              <Pill key={label} tone="dim">
                {label}
              </Pill>
            ))}
          </div>
        )}
      </Card>

      {/* W TYM KLUBIE: własność CZŁONKOSTWA. Kod jest jedyny w klubie, nie na serwerze. */}
      <Card title="W tym klubie">
        <Field
          htmlFor="code"
          label="Kod pilota"
          hint="Krótki skrót przy każdym locie, np. AKO. Jedyny w tym klubie - w innym klubie ta osoba może mieć inny."
        >
          <TextInput
            id="code"
            mono
            value={draft.code}
            disabled={readOnly}
            invalid={verdict.invalid.includes('code') || field === 'code'}
            onChange={(event) => setDraft({ ...draft, code: normalizeCode(event.target.value) })}
          />
        </Field>
        {field === 'code' && conflict != null ? <p className="hint danger">{conflict}</p> : null}
      </Card>

      {/* ══ ZAKRES UPRAWNIEŃ ══ (epik #197, `docs/uprawnienia.md`)
          Zestaw jest SKRÓTEM PRZY WYPEŁNIANIU, nie bytem: po wybraniu zapisuje się
          ZBIÓR, a nazwa liczy się z niego z powrotem. „Własny zakres" wskakuje SAM
          przy tknięciu którejkolwiek zdolności - pozycja, którą trzeba wybrać, ŻEBY
          MÓC coś zmienić, byłaby bramką przed samą czynnością.

          `<select>`, a nie lista kart: zawartość wyboru stoi ROZPISANA POD NIM, więc
          widoczność wszystkich opcji naraz - cały argument tamtej reguły - niczego nie
          dokłada, a dwie listy jedna nad drugą zlałyby się w jedną. */}
      <Card title="Zakres uprawnień">
        <Field htmlFor="scope" label="Zestaw uprawnień">
          <Select
            id="scope"
            value={presetOf(draft.capabilities)?.id ?? CUSTOM_SCOPE.id}
            disabled={readOnly}
            options={[...SCOPE_PRESETS, CUSTOM_SCOPE].map((preset) => ({
              value: preset.id,
              label: preset.label,
            }))}
            onChange={(id: string) => {
              const preset = SCOPE_PRESETS.find((item) => item.id === id);
              // „Własny zakres" nie jest wyborem, tylko NAZWĄ stanu - wybranie go
              // z listy nie ma czego ustawić, więc zostawia zbiór taki, jaki jest.
              if (preset == null) return;
              setDraft({ ...draft, capabilities: [...preset.capabilities] });
            }}
          />
        </Field>

        <div className="access-row">
          <span className="cell-sub">{scopeSummary(draft.capabilities)}</span>
          <Button variant="ghost" size="sm" onClick={() => setScopeOpen(!scopeOpen)}>
            {scopeOpen ? 'Ukryj zdolności' : 'Pokaż zdolności'}
          </Button>
        </div>

        {!scopeOpen ? null : (
          <div className="opt-list">
            {CLUB_CAPABILITIES.map((capability) => (
              <OptionButton
                key={capability}
                name={CAPABILITY_LABELS[capability].label}
                desc={CAPABILITY_LABELS[capability].desc}
                selected={draft.capabilities.includes(capability)}
                disabled={readOnly}
                onSelect={() =>
                  setDraft({
                    ...draft,
                    capabilities: toggleCapability(draft.capabilities, capability),
                  })
                }
              />
            ))}
          </div>
        )}
      </Card>

      {pilot == null || readOnly ? null : (
        <Card title="Dostęp">
          {/* HASŁO: JEDEN PRZYCISK, KTÓRY WYSYŁA LIST. Służy też osobie, która hasła
              jeszcze NIE MA - pilotowi z Googlem, który ma latać ze wspólnego tabletu.
              Potwierdzenie staje pod wierszem, w tej samej ramce, i mówi DOKĄD poszedł
              list oraz JAK DŁUGO jest ważny. Przy osobie bez adresu przycisk jest
              zablokowany z powodem doklejonym do etykiety, jak „Usuń z klubu" niżej. */}
          <div className="access-row">
            <span className="kv-k">Hasło</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending || sendLink.isPending || linkBlocker(pilot.email) != null}
              reason={linkBlocker(pilot.email) ?? undefined}
              onClick={() =>
                sendLink.mutate(pilot.id, { onSuccess: (result) => setLinkSent(result) })
              }
            >
              Wyślij link do ustawienia hasła
            </Button>
            {linkSent == null ? null : (
              <span className="sent-note" role="status">
                <CheckIcon size={13} />
                {linkSentText(linkSent, Date.now())}
              </span>
            )}
          </div>

          <div className="access-row">
            <span className="kv-k">Członkostwo w klubie</span>
            {pilot.active ? (
              <Button
                variant="danger"
                size="sm"
                disabled={pending || pilot.id === selfId}
                reason={pilot.id === selfId ? SELF_ACCOUNT : undefined}
                onClick={() => setConfirm('disable')}
              >
                Wyłącz członkostwo
              </Button>
            ) : (
              <Button
                variant="ok"
                size="sm"
                disabled={pending}
                onClick={() =>
                  setActive.mutate(
                    { id: pilot.id, active: true },
                    { onSuccess: () => setDone(`${pilot.name} znów jest w klubie.`) },
                  )
                }
              >
                Włącz członkostwo
              </Button>
            )}
          </div>

          {confirm === 'disable' ? (
            <div className="confirm">
              {/* DWUKROPEK, nie „konto Anny Kowal" (2026-09-07). Pytanie musi nazwać
                  konto, a polszczyzna chciałaby tu dopełniacza - odmiany dowolnego
                  nazwiska nie da się złożyć w kodzie („Kowal" → „Kowal", ale
                  „Kowalski" → „Kowalskiego"), więc szablon obiecywał brzmienie,
                  którego panel nie umie wyprodukować. Dwukropek stawia nazwisko
                  w mianowniku i jest poprawny dla KAŻDEGO. */}
              <p className="confirm-q">Wyłączyć członkostwo: {pilot.name}?</p>
              {/* Trzy rzeczy, po które sięga administrator: dostęp (od razu), dane
                  (zostają) i INNE KLUBY tej osoby (bez zmian) - trzecia jest nowa
                  w 2.0.0 i bez niej wyłączenie czytałoby się jak zablokowanie człowieka. */}
              <p className="hint">
                Przestanie się logować w tym klubie od razu - na telefonie i w panelu. Loty
                zostają w dzienniku klubu; członkostwa w innych klubach bez zmian.
              </p>
              <div className="confirm-actions">
                <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
                  Anuluj
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    setActive.mutate(
                      { id: pilot.id, active: false },
                      {
                        onSuccess: () => {
                          setConfirm(null);
                          setDone(`${pilot.name} nie jest już w klubie.`);
                        },
                      },
                    )
                  }
                >
                  Wyłącz członkostwo
                </Button>
              </div>
            </div>
          ) : null}

          <div className="access-row">
            <span className="kv-k">Usuń z klubu</span>
            {/* Powód blokady stoi W PRZYCISKU, bo widać go z listy: członkostwo ma
                plakietkę „Aktywny". Drugiego warunku (brak lotów w TYM klubie) panel nie
                zna - lista nie niesie ich liczby - więc ten wraca odmową serwera.
                Usunięcie dotyczy CZŁONKOSTWA: osoba zostaje na serwerze ze swoimi innymi
                klubami, a osobę bez żadnego członkostwa sprząta superadministrator. */}
            <Button
              variant="danger"
              size="sm"
              disabled={pending || deleteBlocker(pilot, selfId) != null}
              reason={deleteBlocker(pilot, selfId) ?? undefined}
              onClick={() => setConfirm('delete')}
            >
              Usuń z klubu
            </Button>
          </div>

          {confirm === 'delete' ? (
            <div className="confirm">
              <p className="confirm-q">Usunąć z klubu: {pilot.name}?</p>
              <p className="hint">
                Zniknie z listy klubu na zawsze - tego nie da się cofnąć. Jeśli ma tu
                zapisane loty, członkostwo zostanie tylko wyłączone.
              </p>
              <div className="confirm-actions">
                <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
                  Anuluj
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={pending}
                  // Po udanym usunięciu ZAMYKAMY kartę: członkostwa, którego dotyczyła,
                  // już nie ma, a formularz nad nieistniejącym wierszem obiecuje zapis.
                  onClick={() => remove.mutate(pilot.id, { onSuccess: onClose })}
                >
                  Usuń z klubu
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      )}

      {/* ══ SESJE (2.1.0, `docs/logowanie-haslem.md` §5.6, §6) ══
          Klub widzi WYŁĄCZNIE urządzenia tej osoby w SWOIM klubie - zawęża to serwer
          w zapytaniu. „Wyloguj" przy wierszu, bo pytanie brzmi zwykle „który tablet";
          „wszędzie" pod listą na dzień, w którym ktoś zapomniał się wylogować i nie
          wiadomo gdzie. Bez potwierdzenia w miejscu: skutek jest odwracalny ponownym
          zalogowaniem, a zdanie pod przyciskiem mówi to, co administrator musi wiedzieć -
          że zapisy na urządzeniu NIE ZNIKAJĄ. */}
      {pilot == null || readOnly ? null : (
        <Card title="Sesje">
          <Loadable
            pending={sessions.isPending}
            skeleton={<span className="skeleton" style={{ width: '100%', height: 48 }} />}
          >
            {(sessions.data ?? []).length === 0 ? (
              // Stan pusty mówi o TYM KLUBIE, a nie o człowieku: ta sama osoba może
              // w tej chwili latać z telefonu w drugim klubie, a tej sesji tu nie ma
              // i mieć nie może.
              <p className="hint">W tym klubie nie ma czynnej sesji tej osoby.</p>
            ) : (
              <SessionList
                rows={sessionRows(sessions.data ?? [], Date.now())}
                pending={revoke.isPending || revokeAll.isPending}
                onRevoke={(sessionId) => revoke.mutate({ id: pilot.id, sessionId })}
              />
            )}
          </Loadable>

          <div className="access-row">
            <span className="kv-k">Wszystkie urządzenia w tym klubie</span>
            <Button
              variant="danger"
              size="sm"
              disabled={revokeAll.isPending || (sessions.data ?? []).length === 0}
              onClick={() => revokeAll.mutate(pilot.id)}
            >
              Wyloguj wszędzie w tym klubie
            </Button>
          </div>
          <span className="hint">
            Zdalne wylogowanie zatrzymuje wysyłkę z urządzenia; zapisy zostają na nim do
            ponownego zalogowania. Sesje tej osoby w innych klubach bez zmian.
          </span>
        </Card>
      )}
    </Drawer>
  );
}

/**
 * Podtytuł karty: kod, e-mail, ostatnia aktywność i - gdy trzeba - stan konta.
 *
 * „Ostatnia aktywność" (2.1.0, issue #133 C9) liczy się z żywych sesji W TYM KLUBIE
 * i jest całym „statusem użytkownika" tego wydania - bez wskaźnika „online" i bez
 * kolumny w liście. Brak wartości NIE znaczy „nigdy nie wszedł", tylko „nie ma teraz
 * czynnej sesji", więc podtytuł wtedy o tym MILCZY: zdanie o przeszłości, której
 * rejestr nie przechowuje, byłoby zmyślone.
 *
 * Zapis jest bezosobowy („ostatnia aktywność"), nie „ostatnio aktywna": rodzaju nie da
 * się wyprowadzić z nazwiska, a szablon obiecywałby brzmienie, którego panel nie umie
 * wyprodukować - ta sama reguła, przez którą pytanie o wyłączenie ma dwukropek.
 */
function subtitleOf(pilot: PilotListItemDto, now: number): string {
  const parts = [pilot.code, pilot.email ?? 'bez adresu'];
  if (pilot.lastSeenAt != null) {
    parts.push(`ostatnia aktywność ${lastSeenText(pilot.lastSeenAt, now)}`);
  }
  if (!pilot.active) parts.push('członkostwo wyłączone');
  return parts.join(' · ');
}
