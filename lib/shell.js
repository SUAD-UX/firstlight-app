// ============================================================================
// Firstlight — the static shell of the board page (rev4 UI).
//
// One template string with exactly the markup of the approved mock
// (ui-mocks/hero-v2.html rev4), adapted for the live product:
//   · hero callouts carry ids (costValue/costSub, tapeValue/tapeSub,
//     verdictValue/verdictSub) — /ui.js fills them from /api/board
//   · view buttons use the API names (last_night / weekend)
//   · a $1,000 / $5,000 / $25,000 size selector (each refetches the board)
//   · badge starts as "reading recorder…" — it flips to LIVE – RECORDED only
//     when numbers genuinely come from Supabase, never before
//   · the closing <script src="/ui.js" defer> wires all behaviour
//
// No demo data exists in this markup: squares, numbers and evidence are all
// rendered by /ui.js from the API response. Plain JS, no JSX.
// ============================================================================

export const SHELL = `

<!-- ══════════ METALLIC PIECE LIBRARY — gradients + silhouettes, defined once ══════════
     Every placement below is <use href="#pc-…"/>. Placements that want a floor
     reflection add a mirrored <use> (matrix(1,0,0,-1,0,364) reflects about
     y=182). Each big placement also carries an <img src="/pieces/*.png"> slot:
     if you later drop a transparent PNG render at that path it takes over
     automatically; until then the img errors out and is removed, leaving the
     SVG. Nothing external is loaded either way. -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <linearGradient id="pgBody" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#7C6148"/>
      <stop offset=".22" stop-color="#453425"/>
      <stop offset=".62" stop-color="#241C15"/>
      <stop offset="1" stop-color="#161009"/>
    </linearGradient>
    <linearGradient id="pgGold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#E8CBA0"/>
      <stop offset="1" stop-color="#B48F5F"/>
    </linearGradient>
    <linearGradient id="pgRim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="rgba(232,203,160,.8)"/>
      <stop offset=".45" stop-color="rgba(232,203,160,.14)"/>
      <stop offset="1" stop-color="rgba(232,203,160,0)"/>
    </linearGradient>
    <radialGradient id="pgBack" cx=".5" cy=".46" r=".55">
      <stop offset="0" stop-color="rgba(212,176,122,.16)"/>
      <stop offset=".7" stop-color="rgba(212,176,122,.05)"/>
      <stop offset="1" stop-color="rgba(212,176,122,0)"/>
    </radialGradient>
    <radialGradient id="pgShadow" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="rgba(0,0,0,.5)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>




    <symbol id="pc-knight" viewBox="0 0 120 170">
      <g fill="url(#pgBody)" stroke="url(#pgRim)" stroke-width="1.5">
        <path d="M40,150 L40,138 C34,108 38,80 52,62 C48,56 48,48 54,42 L58,30 L64,40 C74,42 84,52 89,66 C96,88 98,118 96,138 L96,150 Z"/>
        <path d="M40,150 C40,158 36,162 32,166 L88,166 C84,162 82,158 82,150 Z"/>
        <path d="M46,44 L50,34 L57,44 Z"/>
      </g>
      <g fill="none" stroke="rgba(212,176,122,.45)" stroke-width="1.3">
        <path d="M62,54 C70,60 76,70 79,82"/>
        <path d="M58,66 C66,72 71,80 74,92"/>
      </g>
      <circle cx="56" cy="53" r="2.6" fill="#0D0A08"/>
      <ellipse cx="50" cy="84" rx="7" ry="14" fill="rgba(255,255,255,.08)" transform="rotate(14 50 84)"/>
      <path d="M84,152 L88,166" stroke="url(#pgGold)" stroke-width="2"/>
    </symbol>

    <symbol id="pc-rook" viewBox="0 0 120 170">
      <g fill="url(#pgBody)" stroke="url(#pgRim)" stroke-width="1.5">
        <path d="M40,22 L52,22 L52,30 L56,30 L56,22 L64,22 L64,30 L68,30 L68,22 L80,22 L80,44 L40,44 Z"/>
        <path d="M44,48 L76,48 L74,112 L46,112 Z"/>
        <path d="M46,112 C46,126 42,132 38,138 L82,138 C78,132 74,126 74,112 Z"/>
        <ellipse cx="60" cy="139" rx="28" ry="4.6"/>
        <path d="M38,139 C38,150 34,156 30,160 L90,160 C86,156 82,150 82,139 Z"/>
      </g>
      <g stroke="rgba(212,176,122,.42)" stroke-width="1.3">
        <line x1="46" y1="60" x2="74" y2="60"/><line x1="47" y1="98" x2="73" y2="98"/>
      </g>
      <rect x="44" y="46" width="32" height="3" fill="url(#pgGold)" opacity=".8"/>
      <ellipse cx="52" cy="74" rx="5" ry="16" fill="rgba(255,255,255,.08)"/>
    </symbol>

    <symbol id="pc-pawn" viewBox="0 0 120 170">
      <g fill="url(#pgBody)" stroke="url(#pgRim)" stroke-width="1.5">
        <circle cx="60" cy="42" r="15"/>
        <ellipse cx="60" cy="62" rx="13" ry="4"/>
        <path d="M50,64 C54,88 48,102 46,118 C46,123 74,123 74,118 C72,102 66,88 70,64 Z"/>
        <path d="M46,118 C46,130 42,136 38,142 L82,142 C78,136 74,130 74,118 Z"/>
        <ellipse cx="60" cy="143" rx="26" ry="4.4"/>
      </g>
      <circle cx="60" cy="42" r="15" fill="none" stroke="url(#pgGold)" stroke-width="1.2" opacity=".7"/>
      <ellipse cx="54" cy="40" rx="4.5" ry="7" fill="rgba(255,255,255,.1)"/>
    </symbol>
  </defs>
</svg>

<!-- ══════════ BACKGROUND STAGE — far + mid layers, floor, the king ══════════ -->
<div class="bg" aria-hidden="true">
  <!-- photoreal strategy-room scene, fixed behind everything (never inside
       or on a card). Dark scrim on top keeps every text at 4.5:1+.
       If an image fails to load it hides itself and the walnut gradient
       underneath shows — never a broken image. -->
  <img class="bg__scene bg__scene--d" src="/bg/board-desktop.jpg" alt=""
       onerror="this.style.display='none'">
  <img class="bg__scene bg__scene--m" src="/bg/board-mobile.jpg" alt=""
       onerror="this.style.display='none'">
  <div class="bg__scrim"></div>
</div>

<!-- ══════════ NAV ══════════ -->
<nav class="nav glass glass--nav">
  <span class="nav__word">FIRST<b>LIGHT</b></span>
  <span class="nav__links">
    <a href="#board">Board</a>
    <a href="#how">How it works</a>
    <a href="#honesty">Honesty</a>
  </span>
  <button type="button" class="nav__bell" id="bellBtn" aria-expanded="false"
          aria-controls="bellPop" aria-label="Alerts">
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 2.6a4.5 4.5 0 0 0-4.5 4.5c0 3.3-1.3 4.7-2.1 5.4-.3.3-.1.8.3.8h12.6c.4 0 .6-.5.3-.8-.8-.7-2.1-2.1-2.1-5.4A4.5 4.5 0 0 0 10 2.6Z"/>
      <path d="M8.4 15.6a1.7 1.7 0 0 0 3.2 0"/>
    </svg>
  </button>
  <span class="nav__tag">AI TRADING DESK · S2</span>
</nav>
<div class="bellpop" id="bellPop" hidden>
  <p class="bellpop__t">Window alerts — scoped, not live yet</p>
  <p class="bellpop__x">Pick a ticker, a size and a channel (Telegram bot or
    email). You are alerted when your cell turns ACTIONABLE or DARK. The
    message is written by the LLM from the engine's verdict only — cost,
    venue, tape age — never a buy or sell call. No logins; test-send button;
    unsubscribe anytime.</p>
</div>

<!-- ══════════ TICKER STRIP — verdict + cost per name, no prices, no arrows ══════════ -->
<div class="tickerbar" id="tickerbar">
  <div class="tickerbar__in" id="tickerIn"><span class="tk tk--wait">state light · reading the recorder…</span></div>
</div>

<main class="wrap">

  <!-- ══════════ HERO PANE — the king, the headline, the live numbers ══════════ -->
  <section class="hero" id="hero">
    <div class="hero__grid">

      <div class="hero__pane glass pane reveal">
        <div class="pane__lens" aria-hidden="true"></div>
        <div class="pane__glare" aria-hidden="true"></div>
        <div class="pane__veil" aria-hidden="true"></div>
        <div class="kickerow">
          <p class="kicker">Firstlight · overnight execution evidence</p>
          <span class="scene__chip" id="statePill">State light · waiting for the recorder</span>
        </div>
        <h1 class="headline">The overnight desk</h1>
        <p class="lede"><span class="ln">Before you act at your size, know what the night
          actually offers — evidence, never direction.</span></p>
        <a class="cta" href="#board">See tonight's board</a>
        <hr class="hr">
        <div class="callouts">
          <div class="callout">
            <svg viewBox="0 0 18 18" aria-hidden="true">
              <line x1="4.5" y1="13.5" x2="13.5" y2="4.5"/>
              <circle cx="5" cy="5" r="1.9"/><circle cx="13" cy="13" r="1.9"/>
            </svg>
            <div>
              <div class="callout__label">All-in cost</div>
              <div class="callout__value" id="costValue">—</div>
              <div class="callout__sub" id="costSub">reading the recorder…</div>
            </div>
          </div>
          <div class="callout">
            <svg viewBox="0 0 18 18" aria-hidden="true">
              <polyline points="2,9 6,9 8,4 11,14 13,9 16,9"/>
            </svg>
            <div>
              <div class="callout__label">Tape age</div>
              <div class="callout__value" id="tapeValue">—</div>
              <div class="callout__sub" id="tapeSub">reading the recorder…</div>
            </div>
          </div>
          <div class="callout">
            <svg viewBox="0 0 18 18" aria-hidden="true">
              <circle cx="9" cy="9" r="6.5"/>
              <path d="M9 5.5 L10.4 8.2 L13.4 8.6 L11.2 10.7 L11.8 13.7 L9 12.2 L6.2 13.7 L6.8 10.7 L4.6 8.6 L7.6 8.2 Z"/>
            </svg>
            <div>
              <div class="callout__label">Verdict</div>
              <div class="callout__value" id="verdictValue">—</div>
              <div class="callout__sub" id="verdictSub">reading the recorder…</div>
            </div>
          </div>
        </div>
        <p class="published"><span class="ln"><span class="pill">published</span>
          overnight edge: lead-lag is null — k* = 0 across all five names
          <span class="callout__n">· n=16 nights</span></span></p>
      </div>

    </div>
  </section>

  <!-- ══════════ BOARD PANE ══════════ -->
  <section class="board" id="board">
    <div class="board__panel glass pane reveal" id="boardPanel">
      <div class="pane__lens" aria-hidden="true"></div>
      <div class="pane__glare" aria-hidden="true"></div>
      <div class="pane__veil" aria-hidden="true"></div>
      <div class="board__head">
        <h2 class="board__title">The overnight board</h2>
        <span class="board__session" id="sessionLine"></span>
        <span class="board__pills">
          <span class="views" role="group" aria-label="Board view">
            <button type="button" data-view="last_night" aria-pressed="true">Last night</button>
            <button type="button" data-view="weekend" aria-pressed="false">Weekend</button>
          </span>
          <span class="views sizes" role="group" aria-label="Trade size">
            <button type="button" data-size="1000" aria-pressed="true">$1,000</button>
            <button type="button" data-size="5000" aria-pressed="false">$5,000</button>
            <button type="button" data-size="25000" aria-pressed="false">$25,000</button>
          </span>
          <span class="chip" id="stamp" title="age of the freshest recorder write behind this board — e.g. 'recorded 14 h ago'">recorded · —</span>
          <span class="chip" id="badge" title="flips to LIVE – RECORDED only when the numbers come from Supabase">reading recorder…</span>
        </span>
      </div>

      <div class="legend reveal">
        <span class="chip chip--a"><span class="g">●</span> Actionable</span>
        <span class="chip"><span class="g">◐</span> Thin</span>
        <span class="chip chip--d"><span class="g">○</span> Dark</span>
        <span class="chip chip--nd"><span class="g">·</span> No data</span>
      </div>

      <div class="board__scroll">
        <div class="grid" id="grid" role="group" aria-label="Overnight board"></div>
      </div>

      <div class="evidence" id="evidence" role="status" aria-live="polite"></div>

      <p class="board__note" id="note"></p>
    </div>
  </section>

  <!-- ══════════ HOW-IT-WORKS PANE ══════════ -->
  <section class="how" id="how">
    <div class="how__panel glass pane reveal">
      <div class="pane__lens" aria-hidden="true"></div>
      <div class="pane__glare" aria-hidden="true"></div>
      <div class="pane__veil" aria-hidden="true"></div>
      <p class="seclabel">How it works</p>
      <div class="steps">
        <div class="step">
          <svg class="step__icon" viewBox="0 0 120 170" aria-hidden="true"><use href="#pc-pawn"/></svg>
          <div class="step__label">01 · RECORD</div>
          <p class="step__text"><span class="ln">A recorder watches both venues for all
            five names, every minute, all night — books, trades and tickers,
            stored raw.</span></p>
        </div>
        <div class="step">
          <svg class="step__icon" viewBox="0 0 120 170" aria-hidden="true"><use href="#pc-knight"/></svg>
          <div class="step__label">02 · MEASURE</div>
          <p class="step__text"><span class="ln">The engine walks the real recorded order
            book at your size: all-in round-trip cost per venue, depth, and
            how fresh the tape is.</span></p>
        </div>
        <div class="step">
          <svg class="step__icon" viewBox="0 0 120 170" aria-hidden="true"><use href="#pc-rook"/></svg>
          <div class="step__label">03 · VERDICT</div>
          <p class="step__text"><span class="ln">Pre-registered thresholds turn the
            evidence into ACTIONABLE, THIN, DARK — or NO DATA when coverage is
            thin. Never direction.</span></p>
        </div>
      </div>
    </div>
  </section>

  <!-- ══════════ HONESTY PANE — limits and disclaimers ══════════ -->
  <section class="honesty" id="honesty">
    <div class="honesty__panel glass pane reveal">
      <div class="pane__lens" aria-hidden="true"></div>
      <div class="pane__glare" aria-hidden="true"></div>
      <div class="pane__veil" aria-hidden="true"></div>
      <p class="seclabel">Honesty · limits &amp; disclaimers</p>
      <ul>
        <li><span class="ln">Overnight edge: lead-lag is <b>null</b> (k* = 0,
          <span class="mono">n=16</span> nights). We publish it loudly instead of
          tuning thresholds.</span></li>
        <li><span class="ln">Thresholds were pre-registered before any recorder data
          existed — never tuned, never will be.</span></li>
        <li><span class="ln">A square needs ≥ 30 snapshots per market in its hour and a
          book within ±120 s — otherwise it stays NO DATA, and nothing is
          estimated from thin coverage.</span></li>
        <li><span class="ln">Costs come from 1-minute-data order books: sub-minute moves
          inside a minute are not visible. Sample sizes ride every number.</span></li>
        <li><span class="ln">Verdicts are execution quality only — cost, depth,
          freshness. Never direction, never buy/sell language, and Firstlight
          places no orders.</span></li>
      </ul>
      <p><span class="ln">Firstlight reports execution quality only — cost, depth, and
        freshness. It never tells you to buy or sell anything, and it places no
        orders. Tokenized stocks and perpetual contracts are risky and you can
        lose your money. Every figure is labelled observed or estimated and
        carries its sample size. Past behaviour of thin markets is not a
        promise about the next hour.</span></p>
    </div>
  </section>

  <p class="cred">Bitget AI Base Camp S2 — AI Trading Desk · Firstlight</p>

</main>
<script src="/ui.js" defer></script>
`;
