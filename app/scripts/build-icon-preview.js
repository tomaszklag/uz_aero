/**
 * UZ Aero - PODGLĄD IKONY W LAUNCHERZE (`design/IKONA.html`).
 *
 * Ikony rysuje `build-icons.js`, ale plik PNG nie odpowiada na pytanie, które naprawdę pada:
 * jak to wygląda na ekranie telefonu, obok innych ikon, po przycięciu maską launchera.
 * Ten skrypt składa z gotowych plików stronę podglądu - ekran główny, cztery maski (koło,
 * squircle, zaokrąglony kwadrat, kwadrat), motyw ikon Androida 13+ i rozmiary rzeczywiste.
 *
 * PLIK JEST GENEROWANY (`npm run icons`) i świadomie NIE JEST specyfikacją: `design/*.html`
 * prowadzi ekrany aplikacji, a tutaj kod prowadzi obrazek - podgląd ma pokazywać to, co
 * naprawdę leży w `app/assets/`, a nie to, co ktoś kiedyś narysował obok.
 *
 * Obrazy idą DATA URI, żeby stronę dało się otworzyć i wysłać jednym plikiem - jak każdy
 * inny mockup, który nie ciągnie niczego spoza siebie.
 */
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');
const OUT = path.join(__dirname, '..', '..', 'design', 'IKONA.html');

const uri = (file) =>
  `data:image/png;base64,${fs.readFileSync(path.join(ASSETS, file)).toString('base64')}`;

const icon = uri('icon.png');
const foreground = uri('android-icon-foreground.png');
const background = uri('android-icon-background.png');
const monochrome = uri('android-icon-monochrome.png');

/*
 * Obrazy wchodzą do arkusza JAKO ZMIENNE (`--icon` i spółka), a elementy biorą je
 * tłem. Powód jest prozaiczny: `<img src="data:...">` powtórzony w siatce, docku
 * i czterech rozmiarach wkleja ten sam kilobajtowy napis sześć razy - strona rosła
 * przez to do 600 kB zamiast 120.
 */

/** Warstwy adaptive: system pokazuje środkowe 72 ze 108 dp, czyli dwie trzecie boku. */
const adaptive = (size, radius) => `
        <span class="adaptive" style="width:${size}px;height:${size}px;border-radius:${radius};">
          <span class="layer back"></span>
          <span class="layer front"></span>
        </span>`;

/** Atrapy sąsiadów w siatce - kształty bez marek, żeby ikona miała z czym sąsiadować. */
const NEIGHBOURS = [
  [
    'Aparat',
    '#2C2F36',
    '<rect x="10" y="14" width="28" height="20" rx="5" fill="none" stroke="#8A9099" stroke-width="3"/><circle cx="24" cy="24" r="6" fill="#8A9099"/>',
  ],
  ['Wiadomości', '#22303A', '<path d="M10 14h28v18H22l-8 6v-6h-4z" fill="#6FA8C7"/>'],
  [
    'Ustawienia',
    '#2B2B2B',
    '<circle cx="24" cy="24" r="7" fill="none" stroke="#9A9A9A" stroke-width="3"/><path d="M24 9v6M24 33v6M9 24h6M33 24h6" stroke="#9A9A9A" stroke-width="3" stroke-linecap="round"/>',
  ],
  [
    'Pogoda',
    '#26313D',
    '<circle cx="20" cy="19" r="7" fill="#E0B14A"/><path d="M14 32h20a6 6 0 0 0 0-12 9 9 0 0 0-17 2 5 5 0 0 0-3 10z" fill="#A9B7C4"/>',
  ],
  [
    'Notatki',
    '#332C1F',
    '<rect x="12" y="10" width="24" height="28" rx="4" fill="#D8C08A"/><path d="M17 18h14M17 24h14M17 30h9" stroke="#6B5A33" stroke-width="2.5" stroke-linecap="round"/>',
  ],
  [
    'Kalendarz',
    '#33262A',
    '<rect x="10" y="13" width="28" height="25" rx="4" fill="#E8E8E8"/><rect x="10" y="13" width="28" height="8" rx="4" fill="#C0504A"/><rect x="17" y="27" width="6" height="5" fill="#C0504A"/>',
  ],
  [
    'Mapy',
    '#1F2E28',
    '<path d="M12 16l8-4 8 4 8-4v20l-8 4-8-4-8 4z" fill="#5FA37A"/><path d="M20 12v20M28 16v20" stroke="#1F2E28" stroke-width="2"/>',
  ],
];

const tile = (label, inner) => `
          <span class="app">
            ${inner}
            <span class="app-name">${label}</span>
          </span>`;

const neighbour = ([label, bg, art]) =>
  tile(
    label,
    `<span class="app-icon" style="background:${bg};">
              <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">${art}</svg>
            </span>`,
  );

const ours = () =>
  tile('<b>UZ Aero</b>', '<span class="app-icon ours" role="img" aria-label="UZ Aero"></span>');

const html = `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>UZ Aero - IKONA aplikacji · podgląd w launcherze</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Bebas+Neue&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0D0D0D; --bg-tint: #111318; --surface: #141414; --surface-raised: #1A1A1A;
    --border: #252525; --border-strong: #333333;
    --text-primary: #E8E8E8; --text-secondary: #888888; --text-muted: #7A7A7A;
    --green: #2ECC71; --green-muted: rgba(46,204,113,0.12); --green-border: rgba(46,204,113,0.28);
    --icon: url('${icon}');
    --layer-front: url('${foreground}');
    --layer-back: url('${background}');
    --mono: url('${monochrome}');
    --font-display: 'Bebas Neue', sans-serif; --font-body: 'Archivo', system-ui, sans-serif; --font-mono: 'JetBrains Mono', monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    --phone-scale: min(1, calc((100vh - 240px) / 852px), calc((100vw - 60px) / 393px));
    font-family: var(--font-body); background: var(--bg); color: var(--text-primary);
    -webkit-font-smoothing: antialiased;
    background-image:
      radial-gradient(ellipse 80% 50% at 50% 0%, rgba(46,204,113,0.05) 0%, transparent 60%),
      linear-gradient(180deg, var(--bg-tint) 0%, var(--bg) 30%);
    background-attachment: fixed;
    min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 48px 24px 80px; gap: 28px;
  }
  .canvas-label { width:100%; max-width:900px; display:grid; grid-template-columns:auto 1fr auto; align-items:baseline; gap:20px; padding-bottom:18px; border-bottom:1px solid var(--border); }
  .film-strip { font-family:var(--font-display); font-size:34px; letter-spacing:3px; line-height:1; }
  .slug { font-family:var(--font-mono); font-size:11px; color:var(--text-muted); letter-spacing:1.5px; text-transform:uppercase; border-left:1px solid var(--border); padding-left:18px; }
  .canvas-meta { font-family:var(--font-mono); font-size:11px; color:var(--text-secondary); letter-spacing:1px; }

  .phone {
    width:393px; height:852px; border-radius:54px;
    border:10px solid #0D0E12;
    box-shadow:0 0 0 1px #1C1E24, 0 40px 120px rgba(0,0,0,0.7), 0 24px 48px rgba(0,0,0,0.45);
    overflow:hidden; position:relative; isolation:isolate; flex-shrink:0;
    transform:scale(var(--phone-scale)); transform-origin:top center;
    margin-bottom: calc((var(--phone-scale) - 1) * 852px);
    /* Tapeta ciemna, lekko zielonkawa - ikona ma się bronić na tym, co pilot ma na telefonie. */
    background:
      radial-gradient(ellipse 70% 45% at 30% 12%, rgba(46,204,113,0.10), transparent 62%),
      radial-gradient(ellipse 60% 40% at 82% 78%, rgba(52,152,219,0.10), transparent 60%),
      linear-gradient(165deg, #14181B 0%, #0A0C0D 55%, #06080A 100%);
  }
  .phone::before { content:''; position:absolute; top:12px; left:50%; transform:translateX(-50%); width:96px; height:26px; background:#000; border-radius:14px; z-index:5; }

  .status { position:absolute; top:0; left:0; right:0; height:54px; display:flex; align-items:center; justify-content:space-between; padding:0 26px; font-family:var(--font-mono); font-size:12px; color:rgba(255,255,255,0.85); letter-spacing:0.5px; }
  .clock-widget { position:absolute; top:78px; left:0; right:0; text-align:center; }
  .clock-widget .h { font-family:var(--font-display); font-size:72px; line-height:0.9; letter-spacing:2px; color:#fff; }
  .clock-widget .d { font-family:var(--font-body); font-size:13px; color:rgba(255,255,255,0.7); letter-spacing:1px; margin-top:6px; }

  .grid { position:absolute; top:240px; left:0; right:0; padding:0 22px; display:grid; grid-template-columns:repeat(4, 1fr); gap:26px 10px; }
  .app { display:flex; flex-direction:column; align-items:center; gap:8px; }
  .app-icon { width:60px; height:60px; border-radius:16px; display:flex; align-items:center; justify-content:center; overflow:hidden; }
  .app-icon.ours { background-image:var(--icon); background-size:cover; box-shadow:0 6px 18px rgba(0,0,0,0.5); }
  .app-name { font-size:11px; color:rgba(255,255,255,0.88); text-align:center; text-shadow:0 1px 3px rgba(0,0,0,0.8); }
  .app-name b { font-weight:700; }

  .dock { position:absolute; left:16px; right:16px; bottom:26px; padding:14px 12px; border-radius:28px; background:rgba(255,255,255,0.07); display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; }
  .dock .app-name { display:none; }

  .board { width:100%; max-width:900px; background:var(--surface); border:1px solid var(--border); border-radius:18px; padding:22px 24px 26px; }
  .board h2 { font-family:var(--font-display); font-size:20px; letter-spacing:2px; font-weight:400; margin-bottom:6px; }
  .board p { font-size:12.5px; color:var(--text-secondary); line-height:1.6; max-width:660px; }
  .board code { font-family:var(--font-mono); font-size:11.5px; color:var(--text-primary); }
  .row { display:flex; flex-wrap:wrap; gap:26px; margin-top:18px; }
  .cell { display:flex; flex-direction:column; align-items:center; gap:9px; }
  .cell .label { font-family:var(--font-mono); font-size:10px; color:var(--text-muted); letter-spacing:1px; text-transform:uppercase; }

  .adaptive { display:block; position:relative; overflow:hidden; background:#000; }
  /* Warstwy adaptive mają 108 dp, a launcher pokazuje środkowe 72 - stąd 150%. */
  .adaptive .layer { position:absolute; inset:0; background-position:center; background-size:150%; background-repeat:no-repeat; }
  .adaptive .back { background-image:var(--layer-back); }
  .adaptive .front { background-image:var(--layer-front); }

  .mono { display:flex; align-items:center; justify-content:center; width:96px; height:96px; border-radius:50%; overflow:hidden; }
  .mono-mark { width:96px; height:96px; background-image:var(--mono); background-size:contain; background-position:center; background-repeat:no-repeat; }
  .mono.tint-green { background:#123A22; }
  .mono.tint-sand { background:#3A3324; }
  .mono.tint-light { background:#E6E2DA; }
  .mono.tint-light .mono-mark { filter:invert(1) brightness(0.35); }

  .sizes { display:flex; align-items:flex-end; gap:26px; margin-top:18px; }
  .sizes .shot { background-image:var(--icon); background-size:cover; border-radius:22%; box-shadow:0 6px 18px rgba(0,0,0,0.5); }

  .note { margin-top:16px; font-size:12px; color:var(--text-muted); border-left:2px solid var(--green-border); padding-left:12px; line-height:1.6; }
  .nav-strip { width:100%; max-width:900px; display:flex; flex-wrap:wrap; gap:10px; font-family:var(--font-mono); font-size:11px; }
  .nav-strip a { color:var(--text-secondary); text-decoration:none; border:1px solid var(--border); border-radius:8px; padding:7px 11px; letter-spacing:1px; }
  .nav-strip a:hover { color:var(--green); border-color:var(--green-border); }
</style>
</head>
<body>

<div class="canvas-label">
  <span class="film-strip">IKONA</span>
  <span class="slug">app/assets · znak z ekranu logowania panelu</span>
  <span class="canvas-meta">PLIK GENEROWANY · npm run icons</span>
</div>

<div class="phone">
  <div class="status"><span>9:41</span><span>UTC+2 · 87%</span></div>
  <div class="clock-widget">
    <div class="h">9:41</div>
    <div class="d">czwartek, 4 września</div>
  </div>

  <div class="grid">
    ${ours()}
    ${NEIGHBOURS.slice(0, 3).map(neighbour).join('')}
    ${NEIGHBOURS.slice(3).map(neighbour).join('')}
  </div>

  <div class="dock">
    ${NEIGHBOURS.slice(0, 2).map(neighbour).join('')}
    ${ours()}
    ${neighbour(NEIGHBOURS[6])}
  </div>
</div>

<div class="board">
  <h2>MASKI LAUNCHERÓW</h2>
  <p>Android przycina ikonę maską producenta i o zdanie nas nie pyta. Warstwy adaptive mają 108 dp, a widoczne jest środkowe 72 dp - dlatego znak stoi na 40% boku, z zapasem po każdej stronie. Poniżej to samo <code>foreground</code> nad <code>background</code>, w czterech maskach.</p>
  <div class="row">
    <div class="cell">${adaptive(96, '50%')}<span class="label">Koło · Pixel</span></div>
    <div class="cell">${adaptive(96, '42%')}<span class="label">Squircle</span></div>
    <div class="cell">${adaptive(96, '26px')}<span class="label">Zaokrąglony</span></div>
    <div class="cell">${adaptive(96, '8px')}<span class="label">Kwadrat</span></div>
  </div>
  <div class="note">Znak jest wyśrodkowany i symetryczny, więc żadna maska nie ucina mu skrzydła ani statecznika - nawet najciaśniejsze koło zostawia margines.</div>
</div>

<div class="board">
  <h2>MOTYW IKON · ANDROID 13+</h2>
  <p>Przy włączonym motywie system bierze warstwę <code>monochrome</code> i barwi ją kolorami tapety. Sylwetka jest biała, więc kształt zostaje rozpoznawalny niezależnie od tego, co launcher pod nią podstawi.</p>
  <div class="row">
    <div class="cell"><span class="mono tint-green"><span class="mono-mark"></span></span><span class="label">Tapeta zielona</span></div>
    <div class="cell"><span class="mono tint-sand"><span class="mono-mark"></span></span><span class="label">Tapeta ciepła</span></div>
    <div class="cell"><span class="mono tint-light"><span class="mono-mark"></span></span><span class="label">Motyw jasny</span></div>
  </div>
</div>

<div class="board">
  <h2>ROZMIARY RZECZYWISTE</h2>
  <p>Ikona żyje w launcherze przy 48-64 dp, a nie przy 1024 px. Znak jest jednym kształtem bez detali, więc przy 48 dp dalej czyta się jako samolot.</p>
  <div class="sizes">
    <div class="cell"><span class="shot" style="width:48px;height:48px;"></span><span class="label">48 dp</span></div>
    <div class="cell"><span class="shot" style="width:64px;height:64px;"></span><span class="label">64 dp</span></div>
    <div class="cell"><span class="shot" style="width:96px;height:96px;"></span><span class="label">96 dp</span></div>
    <div class="cell"><span class="shot" style="width:144px;height:144px;"></span><span class="label">144 dp</span></div>
  </div>
  <div class="note">Podmiana wchodzi dopiero z nowym buildem EAS - w Expo Go ikona nie zmieni się wcale.</div>
</div>

<div class="nav-strip">
  <a href="index.html">← INDEX</a>
  <a href="00-login.html">00 LOGOWANIE</a>
  <a href="01-moj-dzien.html">01 MÓJ DZIEŃ</a>
  <a href="LOADERY.html">LOADERY</a>
</div>

</body>
</html>
`;

fs.writeFileSync(OUT, html.replace(/\r?\n/g, '\r\n'));
console.log(`podgląd: ${path.relative(process.cwd(), OUT)}`);
