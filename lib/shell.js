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

    <symbol id="pc-king" viewBox="0 0 120 170">
      <g fill="url(#pgBody)" stroke="url(#pgRim)" stroke-width="1.5">
        <circle cx="60" cy="30" r="7"/>
        <path d="M40,62 C40,44 50,38 60,38 C70,38 80,44 80,62 L76,76 L44,76 Z"/>
        <ellipse cx="60" cy="78" rx="19" ry="5"/>
        <path d="M48,80 C52,104 47,118 45,134 C45,139 75,139 75,134 C73,118 68,104 72,80 Z"/>
        <path d="M45,134 C45,144 41,150 36,156 L84,156 C79,150 75,144 75,134 Z"/>
        <ellipse cx="60" cy="157" rx="30" ry="5"/>
      </g>
      <g fill="url(#pgGold)">
        <rect x="58" y="6" width="4" height="16" rx="2"/>
        <rect x="52" y="11" width="16" height="4" rx="2"/>
      </g>
      <ellipse cx="52" cy="60" rx="6" ry="13" fill="rgba(255,255,255,.09)" transform="rotate(-8 52 60)"/>
      <ellipse cx="60" cy="96" rx="15" ry="3" fill="none" stroke="rgba(212,176,122,.4)" stroke-width="1.3"/>
      <ellipse cx="60" cy="118" rx="18" ry="3.4" fill="none" stroke="rgba(212,176,122,.4)" stroke-width="1.3"/>
    </symbol>

    <symbol id="pc-queen" viewBox="0 0 120 170">
      <g fill="url(#pgBody)" stroke="url(#pgRim)" stroke-width="1.5">
        <path d="M42,64 L46,38 L54,56 L60,32 L66,56 L74,38 L78,64 Z"/>
        <ellipse cx="60" cy="68" rx="17" ry="5"/>
        <path d="M48,70 C54,98 46,114 44,132 C44,137 76,137 76,132 C74,114 66,98 72,70 Z"/>
        <path d="M44,132 C44,143 40,149 35,155 L85,155 C80,149 76,143 76,132 Z"/>
        <ellipse cx="60" cy="156" rx="29" ry="5"/>
      </g>
      <g fill="url(#pgGold)">
        <circle cx="46" cy="36" r="3.4"/><circle cx="60" cy="30" r="3.4"/><circle cx="74" cy="36" r="3.4"/>
      </g>
      <ellipse cx="53" cy="62" rx="6" ry="9" fill="rgba(255,255,255,.09)"/>
      <ellipse cx="60" cy="102" rx="16" ry="3" fill="none" stroke="rgba(212,176,122,.4)" stroke-width="1.3"/>
    </symbol>

    <symbol id="pc-bishop" viewBox="0 0 120 170">
      <g fill="url(#pgBody)" stroke="url(#pgRim)" stroke-width="1.5">
        <circle cx="60" cy="22" r="7"/>
        <path d="M60,30 C46,40 42,58 48,76 C52,86 55,90 57,96 L63,96 C65,90 68,86 72,76 C78,58 74,40 60,30 Z"/>
        <ellipse cx="60" cy="99" rx="16" ry="4.6"/>
        <path d="M50,101 C54,120 48,132 46,144 C46,149 74,149 74,144 C72,132 66,120 70,101 Z"/>
        <path d="M46,144 C46,154 42,159 38,164 L82,164 C78,159 74,154 74,144 Z"/>
        <ellipse cx="60" cy="165" rx="26" ry="4.4"/>
      </g>
      <path d="M60,44 L69,64" stroke="rgba(10,8,6,.8)" stroke-width="3" stroke-linecap="round"/>
      <circle cx="60" cy="22" r="7" fill="none" stroke="url(#pgGold)" stroke-width="1.4"/>
      <ellipse cx="54" cy="52" rx="5" ry="10" fill="rgba(255,255,255,.09)"/>
    </symbol>

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
  <div class="bg__glow"></div>
  <!-- the crisp chessboard — drawn by buildBoardPlane() in the script -->
  <div class="boardplane" id="boardplane" aria-hidden="true">
    <svg id="boardsvg" preserveAspectRatio="none"></svg>
  </div>

  <!-- FAR layer: small, dim, soft -->
  <div class="layer layer--far" id="layerFar">
    <div class="piece p-far-pawn1">
      <img src="/pieces/far-pawn1.png" alt="" onerror="this.remove()">
      <svg viewBox="0 0 120 170"><use href="#pc-pawn"/></svg>
    </div>
    <div class="piece p-far-pawn2">
      <img src="/pieces/far-pawn2.png" alt="" onerror="this.remove()">
      <svg viewBox="0 0 120 170"><use href="#pc-pawn"/></svg>
    </div>
    <div class="piece p-far-bishop">
      <img src="/pieces/far-bishop.png" alt="" onerror="this.remove()">
      <svg viewBox="0 0 120 170"><use href="#pc-bishop"/></svg>
    </div>
    <div class="piece p-far-rook">
      <img src="/pieces/far-rook.png" alt="" onerror="this.remove()">
      <svg viewBox="0 0 120 170"><use href="#pc-rook"/></svg>
    </div>
  </div>

  <!-- MID layer: sharp -->
  <div class="layer layer--mid" id="layerMid">
    <div class="piece p-mid-queen">
      <img src="/pieces/mid-queen.png" alt="" onerror="this.remove()">
      <svg viewBox="0 0 120 230">
        <ellipse cx="60" cy="108" rx="58" ry="112" fill="url(#pgBack)"/>
        <ellipse cx="60" cy="168" rx="44" ry="7" fill="url(#pgShadow)"/>
        <use href="#pc-queen"/>
        <use href="#pc-queen" transform="matrix(1,0,0,-1,0,364)" opacity=".08"/></svg>
    </div>
    <div class="piece p-mid-bishop" id="mv-bishop">
      <img src="/pieces/mid-bishop.png" alt="" onerror="this.remove()">
      <svg viewBox="0 0 120 230">
        <ellipse cx="60" cy="108" rx="58" ry="112" fill="url(#pgBack)"/>
        <ellipse cx="60" cy="168" rx="44" ry="7" fill="url(#pgShadow)"/>
        <use href="#pc-bishop"/>
        <use href="#pc-bishop" transform="matrix(1,0,0,-1,0,364)" opacity=".08"/></svg>
    </div>
    <div class="piece p-mid-knight">
      <img src="/pieces/mid-knight.png" alt="" onerror="this.remove()">
      <svg viewBox="0 0 120 230">
        <ellipse cx="60" cy="108" rx="58" ry="112" fill="url(#pgBack)"/>
        <ellipse cx="60" cy="168" rx="44" ry="7" fill="url(#pgShadow)"/>
        <use href="#pc-knight"/>
        <use href="#pc-knight" transform="matrix(1,0,0,-1,0,364)" opacity=".08"/></svg>
    </div>
    <div class="piece p-mid-rook">
      <img src="/pieces/mid-rook.png" alt="" onerror="this.remove()">
      <svg viewBox="0 0 120 230">
        <ellipse cx="60" cy="108" rx="58" ry="112" fill="url(#pgBack)"/>
        <ellipse cx="60" cy="168" rx="44" ry="7" fill="url(#pgShadow)"/>
        <use href="#pc-rook"/>
        <use href="#pc-rook" transform="matrix(1,0,0,-1,0,364)" opacity=".08"/></svg>
    </div>
    <div class="piece p-mid-pawn" id="mv-pawn">
      <img src="/pieces/mid-pawn.png" alt="" onerror="this.remove()">
      <svg viewBox="0 0 120 230">
        <ellipse cx="60" cy="108" rx="58" ry="112" fill="url(#pgBack)"/>
        <ellipse cx="60" cy="168" rx="44" ry="7" fill="url(#pgShadow)"/>
        <use href="#pc-pawn"/>
        <use href="#pc-pawn" transform="matrix(1,0,0,-1,0,364)" opacity=".08"/></svg>
    </div>
  </div>

  <!-- THE KING — hero of the first screen: plinth, halo, spotlight -->
  <div class="stage" id="stage">
    <div class="stage__float">
      <svg class="stage__beam" viewBox="0 0 400 700" preserveAspectRatio="none">
        <defs>
          <linearGradient id="beamG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="rgba(242,239,232,0.16)"/>
            <stop offset="1" stop-color="rgba(242,239,232,0)"/>
          </linearGradient>
        </defs>
        <polygon points="182,0 218,0 400,700 0,700" fill="url(#beamG)"/>
      </svg>
      <div class="stage__halo"></div>
      <img class="stage__img" src="/pieces/hero-king.png" alt="" onerror="this.remove()">
      <svg class="stage__king" viewBox="0 0 220 300">
        <defs>
          <linearGradient id="kgBody" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#9A7A5C"/>
            <stop offset=".28" stop-color="#6B5342"/>
            <stop offset=".75" stop-color="#46362A"/>
            <stop offset="1" stop-color="#362A20"/>
          </linearGradient>
          <linearGradient id="kgGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#E8CBA0"/>
            <stop offset="1" stop-color="#B48F5F"/>
          </linearGradient>
          <radialGradient id="kgGlow" cx=".5" cy=".42" r=".5">
            <stop offset="0" stop-color="rgba(212,176,122,0.55)"/>
            <stop offset="1" stop-color="rgba(212,176,122,0)"/>
          </radialGradient>
        </defs>
        <ellipse cx="110" cy="145" rx="106" ry="152" fill="url(#kgGlow)"/>
        <g fill="url(#kgGold)">
          <rect x="106" y="10" width="8" height="30" rx="4"/>
          <rect x="95" y="20" width="30" height="8" rx="4"/>
        </g>
        <circle cx="110" cy="48" r="7" fill="url(#kgBody)" stroke="rgba(212,176,122,.55)" stroke-width="1.2"/>
        <path d="M74,84 C74,60 92,50 110,50 C128,50 146,60 146,84 L139,100 L81,100 Z"
              fill="url(#kgBody)" stroke="rgba(255,255,255,.10)"/>
        <path d="M74,84 C74,60 92,50 110,50" fill="none" stroke="rgba(212,176,122,.68)" stroke-width="1.6"/>
        <ellipse cx="110" cy="102" rx="30" ry="7" fill="#4A382C" stroke="rgba(255,255,255,.10)"/>
        <path d="M84,104 C90,142 82,162 78,192 C78,199 142,199 142,192 C138,162 130,142 136,104 Z"
              fill="url(#kgBody)"/>
        <ellipse cx="110" cy="140" rx="24" ry="5" fill="none" stroke="rgba(212,176,122,.6)" stroke-width="1.4"/>
        <ellipse cx="110" cy="172" rx="29" ry="6" fill="none" stroke="rgba(212,176,122,.6)" stroke-width="1.4"/>
        <path d="M84,104 C90,142 82,162 78,192" fill="none" stroke="rgba(212,176,122,.6)" stroke-width="1.6"/>
        <path d="M76,192 C76,203 144,203 144,192 L152,224 C152,234 68,234 68,224 Z" fill="url(#kgBody)"/>
        <ellipse cx="110" cy="230" rx="47" ry="9" fill="#362A20" stroke="rgba(212,176,122,.5)" stroke-width="1.2"/>
        <ellipse cx="96" cy="86" rx="10" ry="22" fill="rgba(255,255,255,.10)" transform="rotate(-8 96 86)"/>
      </svg>
      <svg class="stage__plinth" viewBox="0 0 340 150">
        <defs>
          <radialGradient id="marble" cx=".5" cy=".4" r=".75">
            <stop offset="0" stop-color="#EDE7DB"/>
            <stop offset=".7" stop-color="#CFC5B4"/>
            <stop offset="1" stop-color="#A79C8A"/>
          </radialGradient>
          <linearGradient id="plSide" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#B4A996"/>
            <stop offset="1" stop-color="#4A4238"/>
          </linearGradient>
          <radialGradient id="pool" cx=".5" cy=".5" r=".5">
            <stop offset="0" stop-color="rgba(212,176,122,0.36)"/>
            <stop offset="1" stop-color="rgba(212,176,122,0)"/>
          </radialGradient>
        </defs>
        <ellipse cx="170" cy="118" rx="168" ry="27" fill="url(#pool)"/>
        <path d="M28,52 L28,96 A142,36 0 0 0 312,96 L312,52" fill="url(#plSide)"/>
        <ellipse cx="170" cy="52" rx="142" ry="36" fill="url(#marble)"/>
        <path d="M60,44 C110,30 200,62 290,48" fill="none" stroke="rgba(64,49,42,.16)" stroke-width="1.4"/>
        <path d="M75,58 C130,70 210,40 300,58" fill="none" stroke="rgba(64,49,42,.12)" stroke-width="1.1"/>
        <path d="M48,50 C120,64 190,30 268,44" fill="none" stroke="rgba(64,49,42,.10)" stroke-width="1"/>
        <ellipse cx="170" cy="52" rx="142" ry="36" fill="none" stroke="rgba(255,255,255,.22)"/>
      </svg>
    </div>
  </div>

  <div class="bg__vignette"></div>
</div>

<!-- ══════════ NEAR layer — above the glass, so panes sit BETWEEN the layers ══════════ -->
<div class="near" id="layerNear" aria-hidden="true">
  <div class="piece p-near-knight" id="mv-knight">
    <img src="/pieces/near-knight.png" alt="" onerror="this.remove()">
    <svg viewBox="0 0 120 230"><use href="#pc-knight"/>
      <use href="#pc-knight" transform="matrix(1,0,0,-1,0,364)" opacity=".06"/></svg>
  </div>
  <div class="piece p-near-rook" id="mv-rook">
    <img src="/pieces/near-rook.png" alt="" onerror="this.remove()">
    <svg viewBox="0 0 120 230"><use href="#pc-rook"/>
      <use href="#pc-rook" transform="matrix(1,0,0,-1,0,364)" opacity=".06"/></svg>
  </div>
</div>

<!-- ══════════ NAV ══════════ -->
<nav class="nav glass glass--nav">
  <span class="nav__word">FIRST<b>LIGHT</b></span>
  <span class="nav__links">
    <a href="#board">Board</a>
    <a href="#how">How it works</a>
    <a href="#honesty">Honesty</a>
  </span>
  <span class="nav__tag">AI TRADING DESK · S2</span>
</nav>

<main class="wrap">

  <!-- ══════════ HERO PANE — the king, the headline, the live numbers ══════════ -->
  <section class="hero" id="hero">
    <div class="hero__grid">

      <div class="hero__pane glass pane reveal">
        <div class="pane__lens" aria-hidden="true"></div>
        <div class="pane__glare" aria-hidden="true"></div>
        <div class="pane__veil" aria-hidden="true"></div>
        <p class="kicker">Firstlight · overnight execution evidence</p>
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

      <div class="hero__scene" aria-hidden="true">
        <span class="scene__chip">State light · waiting for the recorder</span>
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
          <svg class="step__icon" viewBox="0 0 120 170" aria-hidden="true"><use href="#pc-king"/></svg>
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
