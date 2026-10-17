#!/usr/bin/env python3
"""Generate the animated CodeSpectra marketing illustrations.

Writes SVG files to public/illustrations/codespectra/. Each illustration is
written twice, <name>-light.svg and <name>-dark.svg, matching the site's
light theme and obsidian dark theme; ThemeIllustration swaps them with the
theme toggle. Files are self-contained (CSS keyframes inside <style>) and
respect prefers-reduced-motion.

Run:  python3 scripts/build-landing-svgs.py
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "illustrations" / "codespectra"
OUT.mkdir(parents=True, exist_ok=True)

MINT, MINT2, TEAL, CYAN = "#00c573", "#3ecf8e", "#14b8a6", "#06b6d4"
LINE, SOFT, RED, AMBER = "#64748b", "#94a3b8", "#ef4444", "#f59e0b"

BASE_CSS = """
  .surf{fill:@SURF@;stroke:@LINE@;stroke-opacity:.7}
  .ln{stroke:#64748b;stroke-opacity:.6;fill:none}
  .txt{fill:#64748b;opacity:.75}
  @media (prefers-reduced-motion: reduce){
    *{animation:none!important}
    .tag,.num,.row,.ev,.pass,.f{opacity:1!important}
    .ck,.ok{stroke-dashoffset:0!important}
    .gauge{stroke-dashoffset:36!important}
    .pkt{offset-distance:50%}
  }
"""


THEMES = {
    # LINE: strokes/labels  SOFT: muted fills  SURF: card surface  PAPER: paper inserts  INK: text on surfaces
    "light": {"@LINE@": "#64748b", "@SOFT@": "#94a3b8", "@SURF@": "#f8fafc", "@PAPER@": "#ffffff"},
    "dark": {"@LINE@": "#94a3b8", "@SOFT@": "#475569", "@SURF@": "#0d131f", "@PAPER@": "#1e293b"},
}


def svg(name, w, h, body, css="", title=""):
    t = f"<title>{title}</title>" if title else ""
    doc = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" fill="none" role="img">{t}'
        f"<defs><linearGradient id=\"mint\" x1=\"0\" y1=\"1\" x2=\"0\" y2=\"0\">"
        f'<stop offset="0" stop-color="{TEAL}"/><stop offset="1" stop-color="{MINT2}"/></linearGradient>'
        f'<linearGradient id="spec" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2dd4bf"/>'
        f'<stop offset=".5" stop-color="{MINT}"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs>'
        f"<style>{BASE_CSS}{css}</style>{body}</svg>"
    )
    # neutral literals → theme placeholders, then one file per theme
    doc = doc.replace("#64748b", "@LINE@").replace("#94a3b8", "@SOFT@").replace("#ffffff", "@PAPER@")
    for theme, pal in THEMES.items():
        out = doc
        for k, v in pal.items():
            out = out.replace(k, v)
        (OUT / f"{name}-{theme}.svg").write_text(out)


# ── 1. Hero: 100 applicants → assessment funnel → ranked shortlist ──────────
def hero():
    dots = []
    cols, rows = 14, 5
    for r in range(rows):
        for c in range(cols):
            i = r * cols + c
            x = 62 + c * 26
            y = 34 + r * 22
            d = (i * 37 % 70) / 10  # pseudo-random stagger 0–7s
            dots.append(f'<circle class="ap" cx="{x}" cy="{y}" r="5" style="animation-delay:-{d:.1f}s"/>')
    bars = []
    heights = [118, 104, 96, 88, 80]
    for i, hgt in enumerate(heights):
        x = 150 + i * 38
        bars.append(
            f'<g class="bar" style="animation-delay:{0.25*i:.2f}s">'
            f'<rect x="{x}" y="{392-hgt}" width="26" height="{hgt}" rx="4" fill="url(#mint)"/></g>'
            f'<text x="{x+13}" y="410" text-anchor="middle" class="txt" font-family="ui-monospace,monospace" font-size="11">{i+1}</text>'
        )
    css = f"""
  .ap{{fill:{SOFT};fill-opacity:.55;animation:fall 7s linear infinite}}
  @keyframes fall{{0%{{transform:translateY(0);opacity:.9}}70%{{transform:translateY(118px);opacity:.9}}82%{{transform:translateY(150px);opacity:0}}100%{{transform:translateY(150px);opacity:0}}}}
  .scan{{animation:scan 2.4s ease-in-out infinite alternate}}
  @keyframes scan{{from{{transform:translateX(-96px)}}to{{transform:translateX(96px)}}}}
  .bar{{transform-box:fill-box;transform-origin:50% 100%;animation:grow 7s cubic-bezier(.2,.7,.2,1) infinite}}
  @keyframes grow{{0%,8%{{transform:scaleY(.08)}}30%,88%{{transform:scaleY(1)}}100%{{transform:scaleY(.08)}}}}
  .cut{{stroke:{MINT};stroke-width:2;stroke-dasharray:6 6;animation:dash 1.2s linear infinite}}
  @keyframes dash{{to{{stroke-dashoffset:-12}}}}
  .pulse{{animation:pulse 2s ease-in-out infinite}}
  @keyframes pulse{{50%{{opacity:.35}}}}
"""
    body = (
        '<text x="62" y="16" class="txt" font-family="ui-sans-serif,system-ui" font-size="12">100 applicants</text>'
        + "".join(dots)
        # funnel
        + '<path d="M40 160 H440 L300 236 V262 H180 V236 Z" class="surf" stroke-width="1.5"/>'
        + f'<g clip-path="url(#fc)"><rect class="scan" x="216" y="160" width="48" height="102" fill="{MINT}" opacity=".18"/></g>'
        + '<clipPath id="fc"><path d="M40 160 H440 L300 236 V262 H180 V236 Z"/></clipPath>'
        + f'<text x="240" y="204" text-anchor="middle" font-family="ui-sans-serif,system-ui" font-size="13" font-weight="600" fill="{MINT}">Proctored assessment</text>'
        + '<text x="240" y="222" text-anchor="middle" class="txt" font-family="ui-sans-serif,system-ui" font-size="11">auto-scored · ranked</text>'
        # rejected stream
        + f'<path d="M300 250 C360 250 390 290 420 300" class="ln" stroke-dasharray="3 5"/>'
        + f'<circle cx="424" cy="302" r="4" fill="{SOFT}" fill-opacity=".5" class="pulse"/>'
        + '<text x="470" y="324" text-anchor="end" class="txt" font-family="ui-sans-serif,system-ui" font-size="11">80 not shortlisted</text>'
        # shortlist bars
        + '<line x1="130" y1="392" x2="350" y2="392" class="ln"/>'
        + "".join(bars)
        + '<line class="cut" x1="130" y1="300" x2="350" y2="300"/>'
        + f'<text x="356" y="304" font-family="ui-sans-serif,system-ui" font-size="11" font-weight="600" fill="{MINT}">top 20</text>'
    )
    svg("hero-funnel", 480, 420, body, css, "100 applicants pass through a proctored assessment; the top 20 come out ranked")


# ── 2. Step icons (160×120) ────────────────────────────────────────────────
def step_build():
    css = """
  .card{animation:stack 4s ease-in-out infinite}
  .c2{animation-delay:.25s}.c3{animation-delay:.5s}
  @keyframes stack{0%,10%{transform:translateY(-14px);opacity:0}30%,85%{transform:none;opacity:1}100%{transform:translateY(-14px);opacity:0}}
"""
    tags = [("Easy", "3", MINT2, 18), ("Medium", "4", TEAL, 48), ("Hard", "5", CYAN, 78)]
    g = []
    for i, (lab, pts, col, y) in enumerate(tags):
        g.append(
            f'<g class="card c{i+1}"><rect x="24" y="{y}" width="112" height="24" rx="5" class="surf"/>'
            f'<rect x="32" y="{y+9}" width="44" height="6" rx="3" fill="#64748b" opacity=".45"/>'
            f'<rect x="100" y="{y+5}" width="28" height="14" rx="7" fill="{col}" opacity=".9"/>'
            f'<text x="114" y="{y+15.5}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="10" font-weight="700" fill="#020617">{pts}</text></g>'
        )
    svg("step-build", 160, 120, "".join(g), css, "Questions stacked by difficulty, worth 3, 4 and 5 points")


def step_invite():
    css = f"""
  .letter{{animation:slide 3.6s ease-in-out infinite}}
  @keyframes slide{{0%,15%{{transform:translateY(16px)}}45%,100%{{transform:translateY(0)}}}}
  .p{{fill:{SOFT};fill-opacity:.25;stroke:#64748b;stroke-opacity:.6;animation:ping 3.6s ease-out infinite}}
  .p2{{animation-delay:.3s}}.p3{{animation-delay:.6s}}
  @keyframes ping{{0%,40%{{fill:{SOFT};fill-opacity:.25}}55%,90%{{fill:{MINT};fill-opacity:.9}}100%{{fill:{SOFT};fill-opacity:.25}}}}
  .trail{{stroke:{MINT};stroke-dasharray:3 5;animation:dash 1s linear infinite}}
  @keyframes dash{{to{{stroke-dashoffset:-8}}}}
"""
    body = (
        '<g class="letter"><rect x="34" y="30" width="44" height="36" rx="3" fill="#ffffff" fill-opacity=".9" stroke="#64748b" stroke-opacity=".5"/>'
        f'<rect x="41" y="38" width="22" height="4" rx="2" fill="{MINT}"/><rect x="41" y="46" width="30" height="3" rx="1.5" fill="#94a3b8"/><rect x="41" y="52" width="26" height="3" rx="1.5" fill="#94a3b8"/></g>'
        '<path d="M24 54 V96 H88 V54 L56 76 Z" class="surf" stroke-width="1.5"/>'
        '<path d="M24 96 L50 74 M88 96 L62 74" class="ln"/>'
        '<path class="trail" d="M92 72 C110 72 112 40 128 40 M92 76 H128 M92 80 C110 80 112 108 128 108"/>'
        '<circle class="p" cx="136" cy="40" r="8"/><circle class="p p2" cx="136" cy="76" r="8"/><circle class="p p3" cx="136" cy="108" r="8"/>'
    )
    svg("step-invite", 160, 124, body, css, "Invites sent to candidates")


def step_proctor():
    css = f"""
  .scan{{animation:scan 2.6s ease-in-out infinite alternate}}
  @keyframes scan{{from{{transform:translateY(0)}}to{{transform:translateY(58px)}}}}
  .rec{{animation:blink 1.4s steps(2,start) infinite}}
  @keyframes blink{{to{{visibility:hidden}}}}
  .ok{{stroke:{MINT};stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:30;stroke-dashoffset:30;animation:tick 2.6s ease-out infinite}}
  @keyframes tick{{0%,55%{{stroke-dashoffset:30}}75%,100%{{stroke-dashoffset:0}}}}
"""
    body = (
        '<rect x="22" y="14" width="116" height="80" rx="8" class="surf" stroke-width="1.5"/>'
        '<path d="M40 22h-10v10M120 22h10v10M40 86h-10v-10M120 86h10v-10" stroke="#00c573" stroke-width="2.5" stroke-linecap="round"/>'
        '<circle cx="80" cy="46" r="13" class="ln" stroke-width="2"/>'
        '<path d="M58 84c3-13 12-19 22-19s19 6 22 19" class="ln" stroke-width="2"/>'
        '<clipPath id="pv"><rect x="22" y="14" width="116" height="80" rx="8"/></clipPath>'
        f'<g clip-path="url(#pv)"><rect class="scan" x="22" y="20" width="116" height="3" fill="{MINT}" opacity=".7"/></g>'
        f'<circle class="rec" cx="34" cy="104" r="4" fill="{RED}"/>'
        '<text x="44" y="108" class="txt" font-family="ui-sans-serif,system-ui" font-size="10">Proctoring</text>'
        '<path class="ok" d="M110 104l6 6 12-12"/>'
    )
    svg("step-proctor", 160, 120, body, css, "Webcam proctoring with face check")


def step_review():
    # bars reshuffle into rank order
    css = """
  .b{transform-box:fill-box;transform-origin:0 50%;animation:len 5s cubic-bezier(.3,.7,.2,1) infinite}
  .b1{--a:.45}.b2{--a:1}.b3{--a:.7}.b4{--a:.85}
  @keyframes len{0%,10%{transform:scaleX(var(--a))}40%,85%{transform:scaleX(1)}100%{transform:scaleX(var(--a))}}
  .tag{opacity:0;animation:fade 5s ease infinite}
  @keyframes fade{0%,40%{opacity:0}55%,85%{opacity:1}100%{opacity:0}}
"""
    widths = [96, 84, 72, 60]
    g = []
    for i, w in enumerate(widths):
        y = 18 + i * 24
        col = "url(#mint)" if i < 3 else SOFT
        g.append(
            f'<text x="18" y="{y+12}" class="txt" font-family="ui-monospace,monospace" font-size="10">{i+1}</text>'
            f'<rect class="b b{i+1}" x="32" y="{y+2}" width="{w}" height="14" rx="4" fill="{col}" opacity="{1 if i<3 else .45}"/>'
        )
    body = (
        "".join(g)
        + '<line x1="30" y1="88" x2="140" y2="88" stroke="#00c573" stroke-width="1.5" stroke-dasharray="4 4"/>'
        + f'<g class="tag"><rect x="98" y="96" width="46" height="16" rx="8" fill="{MINT}"/><text x="121" y="107.5" text-anchor="middle" font-family="ui-sans-serif,system-ui" font-size="9" font-weight="700" fill="#020617">CSV</text></g>'
    )
    svg("step-review", 160, 120, body, css, "Candidates sorted into a ranked shortlist")


# ── 3. Domain icons (96×96) ────────────────────────────────────────────────
def domain_code():
    css = f"""
  .caret{{animation:blink 1s steps(2,start) infinite}}@keyframes blink{{to{{visibility:hidden}}}}
  .l{{transform-box:fill-box;transform-origin:0 50%;animation:type 4s steps(10) infinite}}
  .l2{{animation-delay:.5s}}.l3{{animation-delay:1s}}
  @keyframes type{{0%{{transform:scaleX(0)}}40%,90%{{transform:scaleX(1)}}100%{{transform:scaleX(0)}}}}
  .pass{{fill:{MINT};opacity:0;animation:pass 4s ease infinite}}@keyframes pass{{0%,55%{{opacity:0}}65%,90%{{opacity:1}}100%{{opacity:0}}}}
"""
    body = (
        '<rect x="8" y="12" width="80" height="62" rx="7" class="surf" stroke-width="1.5"/>'
        f'<circle cx="18" cy="21" r="2.5" fill="{RED}" opacity=".7"/><circle cx="26" cy="21" r="2.5" fill="{AMBER}" opacity=".7"/><circle cx="34" cy="21" r="2.5" fill="{MINT}" opacity=".7"/>'
        f'<rect class="l" x="16" y="33" width="44" height="5" rx="2.5" fill="{CYAN}" opacity=".8"/>'
        f'<rect class="l l2" x="24" y="44" width="38" height="5" rx="2.5" fill="{TEAL}" opacity=".8"/>'
        f'<rect class="l l3" x="24" y="55" width="26" height="5" rx="2.5" fill="#94a3b8"/>'
        f'<rect class="caret" x="53" y="54" width="2" height="7" fill="{MINT}"/>'
        '<g class="pass"><rect x="46" y="68" width="42" height="18" rx="9"/><text x="67" y="80.5" text-anchor="middle" font-family="ui-monospace,monospace" font-size="9" font-weight="700" fill="#020617">8/8 ✓</text></g>'
    )
    svg("domain-code", 96, 96, body, css, "Code editor running test cases")


def domain_cad():
    # isometric valve body with rotating handwheel
    css = """
  .wheel{transform-origin:48px 26px;animation:spin 6s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .dim{stroke-dasharray:3 3;animation:dash 1.5s linear infinite}@keyframes dash{to{stroke-dashoffset:-6}}
"""
    body = (
        # pipe + body (isometric-ish)
        '<path d="M10 58 l18-10 v16 l-18 10z" class="surf"/><path d="M68 48 l18 10 v16 l-18-10z" class="surf"/>'
        f'<path d="M28 44 l20-11 20 11 v24 l-20 11 -20-11z" fill="url(#mint)" fill-opacity=".85" stroke="{TEAL}"/>'
        '<path d="M28 44 l20 11 20-11 M48 55 v24" stroke="#020617" stroke-opacity=".25"/>'
        f'<line x1="48" y1="33" x2="48" y2="26" stroke="{LINE}" stroke-width="2.5"/>'
        f'<g class="wheel"><circle cx="48" cy="26" r="11" stroke="{CYAN}" stroke-width="2.5"/>'
        f'<path d="M48 15v22M37 26h22M40 18l16 16M56 18L40 34" stroke="{CYAN}" stroke-width="1.5" opacity=".8"/></g>'
        f'<path class="dim" d="M10 84 H86" stroke="{LINE}"/><path d="M10 80v8M86 80v8" stroke="{LINE}"/>'
    )
    svg("domain-cad", 96, 96, body, css, "CAD model of a valve with a turning handwheel")


def domain_qa():
    css = f"""
  .ck{{stroke:{MINT};stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:14;stroke-dashoffset:14;animation:ck 4.5s ease infinite}}
  .k2{{animation-delay:.5s}}.k3{{animation-delay:1s}}
  @keyframes ck{{0%,10%{{stroke-dashoffset:14}}25%,85%{{stroke-dashoffset:0}}100%{{stroke-dashoffset:14}}}}
  .bug{{animation:bug 4.5s ease infinite;transform-origin:72px 70px}}
  @keyframes bug{{0%,45%{{transform:scale(1);opacity:1}}60%,100%{{transform:scale(0);opacity:0}}}}
"""
    rows = []
    for i in range(3):
        y = 20 + i * 18
        rows.append(f'<rect x="16" y="{y}" width="11" height="11" rx="2.5" class="ln" stroke-width="1.5"/>'
                    f'<path class="ck k{i+1}" d="M18.5 {y+5.5}l3 3 5-6"/>'
                    f'<rect x="33" y="{y+3}" width="{40-i*6}" height="5" rx="2.5" fill="#94a3b8" opacity=".6"/>')
    body = (
        '<rect x="8" y="10" width="62" height="76" rx="6" class="surf" stroke-width="1.5"/>'
        + "".join(rows)
        + f'<g class="bug"><ellipse cx="72" cy="70" rx="8" ry="10" fill="{RED}" opacity=".85"/>'
        f'<path d="M64 64l-5-3M64 72h-6M80 64l5-3M80 72h6M68 61l-2-5M76 61l2-5" stroke="{RED}" stroke-width="1.5"/></g>'
    )
    svg("domain-qa", 96, 96, body, css, "Test checklist catching a bug")


def domain_aptitude():
    # OMR bubble sheet filling in
    css = """
  .f{fill:#00c573;opacity:0;animation:fill 5s ease infinite}
  @keyframes fill{0%,8%{opacity:0}18%,88%{opacity:1}100%{opacity:0}}
"""
    g = []
    picks = [1, 3, 0, 2, 1]
    for r in range(5):
        y = 20 + r * 13
        g.append(f'<text x="14" y="{y+3.5}" class="txt" font-family="ui-monospace,monospace" font-size="8">{r+1}</text>')
        for c in range(4):
            x = 30 + c * 14
            g.append(f'<circle cx="{x}" cy="{y}" r="4.5" class="ln" stroke-width="1.2"/>')
            if c == picks[r]:
                g.append(f'<circle class="f" cx="{x}" cy="{y}" r="3.2" style="animation-delay:{r*0.45:.2f}s"/>')
    body = '<rect x="6" y="8" width="84" height="80" rx="6" class="surf" stroke-width="1.5"/>' + "".join(g)
    svg("domain-aptitude", 96, 96, body, css, "Answer sheet being filled in")


# ── 4. Integrity shield ─────────────────────────────────────────────────────
def integrity():
    css = f"""
  .sweep{{transform-origin:150px 112px;animation:spin 4s linear infinite}}
  @keyframes spin{{to{{transform:rotate(360deg)}}}}
  .ev{{opacity:0;animation:ev 6s ease-out infinite}}
  .e2{{animation-delay:2s}}.e3{{animation-delay:4s}}
  @keyframes ev{{0%{{opacity:0}}6%{{opacity:1}}30%{{opacity:1}}40%,100%{{opacity:0}}}}
  .ring{{fill:none;stroke:{MINT};stroke-opacity:.35}}
  @media (prefers-reduced-motion: reduce){{.e2,.e3{{opacity:0!important}}}}
"""
    def ev(cls, label, col):
        w = len(label) * 7.4 + 30
        x = 150 - w / 2
        return (f'<g class="ev {cls}"><rect x="{x}" y="186" width="{w}" height="26" rx="13" fill="@SURF@" stroke="{col}" stroke-width="1.5"/>'
                f'<circle cx="{x+14}" cy="199" r="5" fill="{col}"/>'
                f'<text x="{x+25}" y="203.5" font-family="ui-sans-serif,system-ui" font-size="13" fill="#64748b">{label}</text></g>')
    body = (
        '<circle class="ring" cx="150" cy="96" r="84"/><circle class="ring" cx="150" cy="96" r="56"/><circle class="ring" cx="150" cy="96" r="28"/>'
        '<clipPath id="rad"><circle cx="150" cy="96" r="84"/></clipPath>'
        f'<g clip-path="url(#rad)"><path class="sweep" style="transform-origin:150px 96px" d="M150 96 L150 12 A84 84 0 0 1 223 54 Z" fill="{MINT}" opacity=".16"/></g>'
        f'<path d="M150 64 l28 10 v20 c0 18-12 30-28 36 c-16-6-28-18-28-36 v-20z" fill="url(#mint)" stroke="{TEAL}" stroke-width="1.5"/>'
        '<path d="M138 96l8 8 16-16" stroke="#020617" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'
        + ev("e1", "Tab switch at 14:22", AMBER)
        + ev("e2", "Paste blocked", RED)
        + ev("e3", "Face matched to ID", MINT)
    )
    svg("integrity-shield", 300, 220, body, css, "Proctoring radar logging integrity events with timestamps")


def scoring_mix():
    css = """
  .seg{transform-box:fill-box;transform-origin:0 50%;animation:grow 6s cubic-bezier(.2,.7,.2,1) infinite}
  @keyframes grow{0%,6%{transform:scaleX(0)}28%,90%{transform:scaleX(1)}100%{transform:scaleX(0)}}
"""
    mixes = [("Fresher, 0–1 years", [50, 35, 15]), ("Senior, 4–6 years", [15, 35, 50])]
    cols = [MINT2, TEAL, CYAN]
    g = []
    for r, (lab, parts) in enumerate(mixes):
        y = 40 + r * 70
        g.append(f'<text x="0" y="{y-10}" font-family="ui-sans-serif,system-ui" font-size="13" fill="#64748b">{lab}</text>')
        x = 0
        for i, pct in enumerate(parts):
            w = 3.2 * pct
            g.append(f'<rect class="seg" style="animation-delay:{r*0.4+i*0.25:.2f}s" x="{x}" y="{y}" width="{w-3}" height="28" rx="4" fill="{cols[i]}"/>')
            g.append(f'<text x="{x+10}" y="{y+18.5}" font-family="ui-monospace,monospace" font-size="11" font-weight="700" fill="#020617">{pct}%</text>')
            x += w
    legend = []
    for i, (lab, pts) in enumerate([("Easy", 3), ("Medium", 4), ("Hard", 5)]):
        lx = [0, 96, 220][i]
        legend.append(f'<rect x="{lx}" y="166" width="12" height="12" rx="3" fill="{cols[i]}"/>'
                      f'<text x="{lx+18}" y="176" font-family="ui-sans-serif,system-ui" font-size="12" fill="#64748b">{lab} · {pts} pts</text>')
    body = "".join(g) + "".join(legend)
    svg("scoring-mix", 320, 184, body, css, "Example question mix: a fresher gets mostly easy questions, a senior mostly hard")


# ── 5. Hackathon team → repo → judged ──────────────────────────────────────
def hackathon():
    css = f"""
  .link{{stroke:{MINT};stroke-width:1.5;stroke-dasharray:4 5;animation:dash 1.2s linear infinite}}
  @keyframes dash{{to{{stroke-dashoffset:-9}}}}
  .pkt{{fill:{MINT};offset-path:path('M204 110 H300');animation:move 2.4s ease-in-out infinite}}
  @keyframes move{{from{{offset-distance:0%}}to{{offset-distance:100%}}}}
  .mem{{animation:bob 3s ease-in-out infinite}}
  .m2{{animation-delay:.3s}}.m3{{animation-delay:.6s}}.m4{{animation-delay:.9s}}
  @keyframes bob{{50%{{transform:translateY(-4px)}}}}
  .score{{transform-box:fill-box;transform-origin:0 50%;animation:sc 4.8s ease infinite}}
  @keyframes sc{{0%,30%{{transform:scaleX(0)}}60%,90%{{transform:scaleX(1)}}100%{{transform:scaleX(0)}}}}
"""
    members = [(60, 50, "m1"), (124, 50, "m2"), (40, 160, "m3"), (144, 160, "m4")]
    g = []
    for x, y, cls in members:
        g.append(f'<path class="link" d="M{x} {y} L92 110"/>')
    for x, y, cls in members:
        g.append(f'<g class="mem {cls}"><circle cx="{x}" cy="{y}" r="15" class="surf" stroke-width="1.5"/>'
                 f'<circle cx="{x}" cy="{y-4}" r="4.5" fill="#64748b" opacity=".7"/><path d="M{x-8} {y+9}c2-6 5-8 8-8s6 2 8 8" fill="#64748b" opacity=".7"/></g>')
    body = (
        "".join(g)
        # captain
        + f'<circle cx="92" cy="110" r="22" fill="url(#mint)" stroke="{TEAL}" stroke-width="1.5"/>'
        + '<circle cx="92" cy="104" r="6" fill="#020617" opacity=".75"/><path d="M80 122c3-8 7-10 12-10s9 2 12 10" fill="#020617" opacity=".75"/>'
        + f'<path d="M84 84 l4 5 4-7 4 7 4-5 -2 9 h-12z" fill="{AMBER}"/>'
        + '<path d="M114 110 H204" class="ln" stroke-width="1.5"/>'
        # repo card
        + '<rect x="204" y="86" width="96" height="48" rx="7" class="surf" stroke-width="1.5"/>'
        + f'<path d="M218 100a5 5 0 1 0 0.1 0M218 105v12M218 117a5 5 0 1 0 0.1 0M232 100a5 5 0 1 0 0.1 0M232 105c0 6-14 6-14 12" stroke="{CYAN}" stroke-width="1.5" fill="none"/>'
        + '<rect x="244" y="101" width="44" height="5" rx="2.5" fill="#94a3b8" opacity=".6"/><rect x="244" y="112" width="30" height="5" rx="2.5" fill="#94a3b8" opacity=".4"/>'
        + '<circle class="pkt" r="4"/>'
        # judge score
        + '<path d="M300 110 H326" class="ln" stroke-width="1.5"/>'
        + '<rect x="326" y="78" width="80" height="64" rx="7" class="surf" stroke-width="1.5"/>'
        + '<text x="336" y="96" class="txt" font-family="ui-sans-serif,system-ui" font-size="10">Judge score</text>'
        + f'<rect x="336" y="104" width="60" height="8" rx="4" fill="#94a3b8" opacity=".25"/><rect class="score" x="336" y="104" width="52" height="8" rx="4" fill="url(#mint)"/>'
        + f'<text x="336" y="132" font-family="ui-monospace,monospace" font-size="15" font-weight="700" fill="{MINT}">87/100</text>'
    )
    svg("hackathon-team", 420, 210, body, css, "A team of five submits a repository that judges score out of 100")


# ── 6. Auth asides ──────────────────────────────────────────────────────────
def auth_login():
    css = f"""
  .l{{transform-box:fill-box;transform-origin:0 50%;animation:type 6s steps(14) infinite}}
  .l2{{animation-delay:.6s}}.l3{{animation-delay:1.2s}}.l4{{animation-delay:1.8s}}
  @keyframes type{{0%{{transform:scaleX(0)}}35%,90%{{transform:scaleX(1)}}100%{{transform:scaleX(0)}}}}
  .gauge{{stroke-dasharray:226;stroke-dashoffset:226;animation:g 6s cubic-bezier(.2,.7,.2,1) infinite}}
  @keyframes g{{0%,40%{{stroke-dashoffset:226}}65%,90%{{stroke-dashoffset:36}}100%{{stroke-dashoffset:226}}}}
  .num{{opacity:0;animation:n 6s ease infinite}}@keyframes n{{0%,58%{{opacity:0}}68%,90%{{opacity:1}}100%{{opacity:0}}}}
  .timer{{transform-origin:290px 52px;animation:spin 6s linear infinite}}@keyframes spin{{to{{transform:rotate(360deg)}}}}
"""
    body = (
        '<rect x="10" y="20" width="230" height="170" rx="10" class="surf" stroke-width="1.5"/>'
        '<rect x="10" y="20" width="230" height="26" rx="10" fill="#94a3b8" fill-opacity=".10"/>'
        f'<circle cx="26" cy="33" r="3.5" fill="{RED}" opacity=".7"/><circle cx="38" cy="33" r="3.5" fill="{AMBER}" opacity=".7"/><circle cx="50" cy="33" r="3.5" fill="{MINT}" opacity=".7"/>'
        '<text x="70" y="37" class="txt" font-family="ui-monospace,monospace" font-size="10">assessment.java</text>'
        f'<rect class="l" x="28" y="64" width="120" height="7" rx="3.5" fill="{CYAN}" opacity=".85"/>'
        f'<rect class="l l2" x="44" y="84" width="150" height="7" rx="3.5" fill="{TEAL}" opacity=".85"/>'
        f'<rect class="l l3" x="44" y="104" width="96" height="7" rx="3.5" fill="#94a3b8"/>'
        f'<rect class="l l4" x="28" y="124" width="60" height="7" rx="3.5" fill="{MINT2}" opacity=".85"/>'
        '<rect x="28" y="150" width="194" height="24" rx="6" fill="#94a3b8" fill-opacity=".1"/>'
        f'<text x="40" y="166" font-family="ui-monospace,monospace" font-size="10" fill="{MINT}">✓ 12 / 12 test cases passed</text>'
        # timer
        '<circle cx="290" cy="52" r="22" class="surf" stroke-width="1.5"/>'
        f'<line class="timer" x1="290" y1="52" x2="290" y2="36" stroke="{MINT}" stroke-width="2.5" stroke-linecap="round"/>'
        '<text x="290" y="92" text-anchor="middle" class="txt" font-family="ui-monospace,monospace" font-size="10">42:10 left</text>'
        # score gauge
        '<circle cx="290" cy="150" r="36" stroke="#94a3b8" stroke-opacity=".2" stroke-width="8"/>'
        '<circle class="gauge" cx="290" cy="150" r="36" stroke="url(#spec)" stroke-width="8" stroke-linecap="round" transform="rotate(-90 290 150)"/>'
        f'<text class="num" x="290" y="156" text-anchor="middle" font-family="ui-monospace,monospace" font-size="17" font-weight="700" fill="{MINT}">94</text>'
    )
    svg("auth-login", 340, 210, body, css, "A timed coding assessment passing its test cases")


def auth_signup():
    css = f"""
  .row{{opacity:0;animation:in 6s ease infinite}}
  .r2{{animation-delay:.5s}}.r3{{animation-delay:1s}}.r4{{animation-delay:1.5s}}
  @keyframes in{{0%,5%{{opacity:0;transform:translateX(-8px)}}20%,90%{{opacity:1;transform:none}}100%{{opacity:0}}}}
  .badge{{transform-origin:270px 70px;animation:pop 6s cubic-bezier(.3,1.6,.5,1) infinite}}
  @keyframes pop{{0%,45%{{transform:scale(0)}}60%,90%{{transform:scale(1)}}100%{{transform:scale(0)}}}}
  .shine{{animation:sh 3s linear infinite}}@keyframes sh{{from{{transform:translateX(-60px)}}to{{transform:translateX(90px)}}}}
"""
    rows = [("Profile", 100), ("Practice: 24 problems", 78), ("Mock test: 82%", 60), ("Assessment invite", 90)]
    g = []
    for i, (lab, w) in enumerate(rows):
        y = 70 + i * 28
        g.append(f'<g class="row r{i+1}"><circle cx="40" cy="{y}" r="7" fill="url(#mint)"/>'
                 f'<path d="M36.5 {y}l2.5 2.5 4.5-5" stroke="#020617" stroke-width="1.8" fill="none" stroke-linecap="round"/>'
                 f'<text x="56" y="{y+4}" font-family="ui-sans-serif,system-ui" font-size="11" fill="#64748b">{lab}</text></g>')
    body = (
        '<rect x="14" y="14" width="200" height="182" rx="10" class="surf" stroke-width="1.5"/>'
        '<circle cx="42" cy="38" r="12" fill="#94a3b8" fill-opacity=".3"/>'
        '<rect x="62" y="30" width="80" height="6" rx="3" fill="#94a3b8" opacity=".6"/><rect x="62" y="41" width="52" height="5" rx="2.5" fill="#94a3b8" opacity=".35"/>'
        + "".join(g)
        # certificate badge
        + f'<g class="badge"><path d="M270 32 l10 7 12-1 4 11 10 7-4 11 4 11-10 7-4 11-12-1-10 7-10-7-12 1-4-11-10-7 4-11-4-11 10-7 4-11 12 1z" fill="url(#spec)"/>'
        + '<circle cx="270" cy="70" r="20" fill="#020617" fill-opacity=".25"/>'
        + '<path d="M261 70l6 6 12-12" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
        + f'<path d="M258 104 l-8 26 12-6 6 12 6-30z M282 104 l8 26-12-6-6 12-6-30z" fill="{TEAL}" opacity=".85"/></g>'
        + '<text x="270" y="160" text-anchor="middle" class="txt" font-family="ui-sans-serif,system-ui" font-size="11">Certified</text>'
    )
    svg("auth-signup", 330, 210, body, css, "Profile, practice and a certificate building up")


for fn in [scoring_mix, hero, step_build, step_invite, step_proctor, step_review, domain_code, domain_cad, domain_qa, domain_aptitude, integrity, hackathon, auth_login, auth_signup]:
    fn()
print("wrote", sorted(p.name for p in OUT.glob("*.svg")))
