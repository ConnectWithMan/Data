#!/usr/bin/env python3
"""
Build script for Famral Database:
- Normalizes JoSAA (2023-2026) and CSAB (2024-2026) JSON datasets
- Generates /assets/data/institutes.json
- Generates /institutes/index.html and /institutes/<slug>.html with pre-rendered
  branch-wise cutoffs and historical comparisons
- Regenerates the 7 cutoff year pages with pre-rendered SEO table rows,
  round comparison controls, CSV/Excel/JSON downloads, and transparency info
- Updates sitemap.xml
"""

import html
import json
import os
import re
from collections import defaultdict

BASE_URL = "https://database.famral.com"
LAST_UPDATED = "2026-11-25"

TYPE_LABELS = {
    "IIT": "IIT",
    "NIT": "NIT",
    "3IT": "IIIT",
    "CFI": "Other GFTI",
}

QUOTA_LABELS = {
    "AI": "All India",
    "HS": "Home State",
    "OS": "Other State",
    "GO": "Goa",
    "JK": "Jammu and Kashmir",
    "LA": "Ladakh",
    "DC": "DASA-CIWG",
    "AD": "DASA-Non CIWG",
}

DATASETS = [
    ("josaa", 2026, "josaa/cutoff/2026.json", "josaa/cutoff/2026.html", [1, 5], True),
    ("josaa", 2025, "josaa/cutoff/2025.json", "josaa/cutoff/2025.html", [1, 6], False),
    ("josaa", 2024, "josaa/cutoff/2024.json", "josaa/cutoff/2024.html", [1, 5], False),
    ("josaa", 2023, "josaa/cutoff/2023.json", "josaa/cutoff/2023.html", [1, 6], False),
    ("csab", 2026, "csab/cutoff/2026.json", "csab/cutoff/2026.html", [1, 2], False),
    ("csab", 2025, "csab/cutoff/2025.json", "csab/cutoff/2025.html", [1, 2, 3], False),
    ("csab", 2024, "csab/cutoff/2024.json", "csab/cutoff/2024.html", [1, 2], False),
]

COUNSELLING_META = {
    "josaa": {
        "name": "JoSAA Counselling",
        "short": "JoSAA",
        "official_name": "Joint Seat Allocation Authority (JoSAA)",
        "official_url": "https://josaa.nic.in/",
        "methodology": (
            "JoSAA uses JEE (Advanced) ranks for IITs (and IISc Bangalore) and JEE (Main) ranks for NITs, IIITs, and other GFTIs. "
            "OPEN seats use Common Rank List (CRL) ranks, while reserved categories (EWS, OBC-NCL, SC, ST, and PwD) use category ranks."
        ),
    },
    "csab": {
        "name": "CSAB Special Counselling",
        "short": "CSAB",
        "official_name": "Central Seat Allocation Board (CSAB)",
        "official_url": "https://csab.nic.in/",
        "methodology": (
            "CSAB Special rounds use All India CRL (Common Rank List) ranks of JEE (Main) for all categories across NITs, IIITs, and other GFTIs. "
            "IITs do not participate in CSAB Special counselling."
        ),
    },
}

FAVICON = (
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E"
    "%3Crect width='32' height='32' rx='6' fill='%230f6cbd'/%3E"
    "%3Ctext x='16' y='23' font-family='Segoe UI,Arial' font-size='20' font-weight='700' "
    "text-anchor='middle' fill='white'%3EF%3C/text%3E%3C/svg%3E"
)


def slugify(name: str) -> str:
    s = name.lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def esc(s) -> str:
    return html.escape(str(s), quote=True)


def fmt_num(v) -> str:
    if v is None or v < 0:
        return "—"
    return f"{int(v):,}"


def gen_label(g: str) -> str:
    return "Gender-neutral" if g == "Gender-Neutral" else g


def load_normalized(path: str, rounds: list[int], has_prep: bool):
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    if "seats" in raw:
        inst, prog, quota, cat, gen = [], [], [], [], []
        im, pm, qm, cm, gm = {}, {}, {}, {}, {}
        rows = []
        for s in raw["seats"]:
            ik = (s["institute"], s.get("type", "CFI"))
            if ik not in im:
                im[ik] = len(inst)
                inst.append(list(ik))
            pk = (s["program"], "")
            if pk not in pm:
                pm[pk] = len(prog)
                prog.append(list(pk))
            q = s["quota"]
            if q not in qm:
                qm[q] = len(quota)
                quota.append(q)
            c = s["category"]
            if c not in cm:
                cm[c] = len(cat)
                cat.append(c)
            g = s["gender"]
            if g not in gm:
                gm[g] = len(gen)
                gen.append(g)
            r1 = s.get("round1") or {}
            rf = s.get(f"round{rounds[-1]}") or {}
            rows.append([
                im[ik], pm[pk], qm[q], cm[c], gm[g],
                r1.get("opening") if r1.get("opening") is not None else -1,
                r1.get("closing") if r1.get("closing") is not None else -1,
                rf.get("opening") if rf.get("opening") is not None else -1,
                rf.get("closing") if rf.get("closing") is not None else -1,
            ])
        return {"inst": inst, "prog": prog, "quota": quota, "cat": cat, "gen": gen, "rows": rows, "rounds": rounds, "has_prep": False}

    raw["rounds"] = rounds
    raw["has_prep"] = has_prep
    return raw


def render_preview_rows(ds: dict, limit: int = 25) -> str:
    inst, prog, quota, cat, gen, rows = ds["inst"], ds["prog"], ds["quota"], ds["cat"], ds["gen"], ds["rows"]
    n_rounds = len(ds["rounds"])
    out = []
    for r in rows[:limit]:
        iname, itype = inst[r[0]][0], inst[r[0]][1]
        pname, pdeg = prog[r[1]][0], prog[r[1]][1]
        q = quota[r[2]]
        c = cat[r[3]]
        g = gen_label(gen[r[4]])
        o1, c1 = r[5], r[6]
        o_last, c_last = r[5 + (n_rounds - 1) * 2], r[6 + (n_rounds - 1) * 2]
        shift_html = '<span class="dash">—</span>'
        if o1 >= 0 and c1 >= 0 and c_last >= 0:
            sh = c_last - c1
            if sh > 0:
                shift_html = f'<span class="pos">+{fmt_num(sh)}</span>'
            elif sh < 0:
                shift_html = f'<span class="neg">−{fmt_num(-sh)}</span>'
            else:
                shift_html = "0"
        deg_html = f'<span class="sub">{esc(pdeg)}</span>' if pdeg else ""
        r1_lbl = f"R{ds['rounds'][0]}"
        rf_lbl = f"R{ds['rounds'][-1]}"
        out.append(
            f'<tr>'
            f'<td class="inst"><span class="name">{esc(iname)}</span><span class="sub">{esc(TYPE_LABELS.get(itype, itype))}</span></td>'
            f'<td class="prog"><span class="name">{esc(pname)}</span>{deg_html}</td>'
            f'<td class="nowrap" data-label="Quota">{esc(q)}</td>'
            f'<td class="nowrap" data-label="Category">{esc(c)}</td>'
            f'<td class="nowrap" data-label="Gender">{esc(g)}</td>'
            f'<td class="num sep" data-label="{r1_lbl} Opening">{fmt_num(o1)}</td>'
            f'<td class="num" data-label="{r1_lbl} Closing">{fmt_num(c1)}</td>'
            f'<td class="num sep" data-label="{rf_lbl} Opening">{fmt_num(o_last)}</td>'
            f'<td class="num" data-label="{rf_lbl} Closing">{fmt_num(c_last)}</td>'
            f'<td class="num sep" data-label="Closing Shift">{shift_html}</td>'
            f'<td class="nowrap sep" data-label="Compare"><span class="dash">—</span></td>'
            f'</tr>'
        )
    return "\n        ".join(out)


def build_cutoff_page(counselling: str, year: int, ds: dict, html_path: str, json_path: str):
    cmeta = COUNSELLING_META[counselling]
    rounds = ds["rounds"]
    round_str = " and ".join(f"Round {r}" for r in rounds) if len(rounds) == 2 else ", ".join(f"Round {r}" for r in rounds[:-1]) + f" and Round {rounds[-1]}"
    inst_scope = "IIT, NIT, IIIT and other GFTI" if counselling == "josaa" else "NIT, IIIT and other GFTI"
    title = f"{cmeta['short']} {year} Cutoff: Opening & Closing Ranks | Famral Database"
    desc = f"Search and filter {cmeta['short']} {year} opening and closing ranks ({round_str}) for {inst_scope} seats. Compare rounds, view historical trends and download CSV, Excel or JSON."
    canonical = f"{BASE_URL}/{counselling}/cutoff/{year}"
    json_url = f"{BASE_URL}/{json_path}"

    schema = [
        {
            "@context": "https://schema.org",
            "@type": "Dataset",
            "name": f"{cmeta['short']} {year} cutoffs: opening and closing ranks",
            "description": desc,
            "url": canonical,
            "license": "https://creativecommons.org/licenses/by/4.0/",
            "creator": {"@type": "Organization", "name": "Famral", "url": "https://www.famral.com/"},
            "temporalCoverage": str(year),
            "keywords": [cmeta["short"], f"{cmeta['short']} {year} cutoff", "opening rank", "closing rank", str(year)],
            "distribution": [{"@type": "DataDownload", "encodingFormat": "application/json", "contentUrl": json_url}],
        },
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Famral Database", "item": f"{BASE_URL}/"},
                {"@type": "ListItem", "position": 2, "name": cmeta["short"], "item": f"{BASE_URL}/{counselling}/"},
                {"@type": "ListItem", "position": 3, "name": "Cutoff", "item": f"{BASE_URL}/{counselling}/cutoff/"},
                {"@type": "ListItem", "position": 4, "name": str(year), "item": canonical},
            ],
        },
    ]

    preview_rows = render_preview_rows(ds, limit=25)
    year_links = []
    for c, y, _, _, _, _ in DATASETS:
        if c == counselling:
            cls = ' class="btn sm primary"' if y == year else ' class="btn sm ghost"'
            year_links.append(f'<a{cls} href="/{c}/cutoff/{y}">{y}</a>')

    page_html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta name="theme-color" content="#0f6cbd">
<link rel="canonical" href="{esc(canonical)}">
<link rel="icon" href="{FAVICON}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Famral Database">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{esc(canonical)}">
<meta property="og:locale" content="en_IN">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(desc)}">
<script type="application/ld+json">
{json.dumps(schema, indent=2)}
</script>
<link rel="stylesheet" href="/assets/css/site.css">
</head>
<body>

<header id="site-header" class="top" data-active="{counselling}"></header>

<section class="hero">
  <div>
    <nav class="crumb" aria-label="Breadcrumb"><a href="/">Famral Database</a> / <a href="/{counselling}/">{cmeta['short']}</a> / <a href="/{counselling}/cutoff/">Cutoff</a> / <span>{year}</span></nav>
    <h1>{cmeta['short']} {year} opening and closing ranks</h1>
    <p>{round_str} cutoffs for every {inst_scope} seat. Search by college or branch, compare rounds or historical years, and export to CSV, Excel or JSON.</p>
  </div>
  <div class="hero-actions">
    <div class="dropdown">
      <button class="btn primary" id="dl-toggle" type="button" aria-haspopup="true" aria-expanded="false">Download ▾</button>
      <div class="dropdown-menu" id="dl-menu" role="menu" hidden>
        <button class="dropdown-item" id="dl-pdf" type="button" role="menuitem"><span>Download PDF</span><small>.pdf</small></button>
        <button class="dropdown-item" id="dl-xls" type="button" role="menuitem"><span>Download Excel</span><small>.xlsx</small></button>
        <button class="dropdown-item" id="dl-csv" type="button" role="menuitem"><span>Download CSV</span><small>.csv</small></button>
        <a class="dropdown-item" href="{year}.json" download role="menuitem"><span>Download JSON</span><small>.json</small></a>
      </div>
    </div>
    <button class="btn" id="share-btn" type="button">Share link</button>
  </div>
</section>

<main>
  <section class="card info-strip" aria-label="Dataset transparency">
    <div class="info-items">
      <span><strong>Counselling:</strong> {esc(cmeta['name'])}</span>
      <span><strong>Year:</strong> {year}</span>
      <span><strong>Rounds:</strong> {esc(', '.join(f'Round {r}' for r in rounds))}</span>
      <span><strong>Seats:</strong> {fmt_num(len(ds['rows']))}</span>
      <span><strong>Updated:</strong> {LAST_UPDATED}</span>
      <span><strong>Source:</strong> <a href="{esc(cmeta['official_url'])}" target="_blank" rel="noopener noreferrer">{esc(cmeta['official_name'])}</a></span>
    </div>
    <div class="actions" style="margin-top:0">
      {' '.join(year_links)}
    </div>
  </section>

  <section class="card filters" aria-label="Filters">
    <div class="field">
      <label for="q">Search institute or academic branch</label>
      <input id="q" type="search" placeholder="For example: NIT Trichy CSE, IITB, or Computer Science" autocomplete="off">
    </div>
    <div class="row-selects">
      <div class="field"><label for="f-type">Institute type</label><select id="f-type"></select></div>
      <div class="field"><label for="f-quota">Quota</label><select id="f-quota"></select></div>
      <div class="field"><label for="f-cat">Seat type / Category</label><select id="f-cat"></select></div>
      <div class="field"><label for="f-gen">Gender</label><select id="f-gen"></select></div>
      <div class="field"><label for="f-ra">Compare from</label><select id="f-ra"></select></div>
      <div class="field"><label for="f-rb">Compare to</label><select id="f-rb"></select></div>
      <div class="field"><button class="btn" id="clear" type="button">Clear filters</button></div>
    </div>
  </section>

  <div class="meta" aria-live="polite">
    <span id="count">Showing 1–25 of {fmt_num(len(ds['rows']))} seats (preview)</span>
    <div class="meta-right">
      <label for="f-pagesize">Rows per page</label>
      <select id="f-pagesize">
        <option value="50" selected>50</option>
        <option value="100">100</option>
        <option value="200">200</option>
      </select>
    </div>
  </div>

  <div class="card scroller" id="tablewrap">
    <table>
      <thead>
        <tr class="groups">
          <th class="seat" colspan="5" scope="colgroup">Seat</th>
          <th class="sep" colspan="2" scope="colgroup" id="grp-ra">Round {rounds[0]}</th>
          <th class="sep" colspan="2" scope="colgroup" id="grp-rb">Round {rounds[-1]}</th>
          <th class="sep" colspan="2" scope="colgroup">Compare</th>
        </tr>
        <tr class="cols" id="cols">
          <th scope="col">Institute</th>
          <th scope="col">Program</th>
          <th scope="col">Quota</th>
          <th scope="col">Category</th>
          <th scope="col">Gender</th>
          <th scope="col" class="num sep">Opening</th>
          <th scope="col" class="num">Closing</th>
          <th scope="col" class="num sep">Opening</th>
          <th scope="col" class="num">Closing</th>
          <th scope="col" class="num sep">Closing shift</th>
          <th scope="col" class="sep">Years</th>
        </tr>
      </thead>
      <tbody id="body">
        {preview_rows}
      </tbody>
    </table>
    <div class="empty" id="empty" hidden></div>
  </div>

  <div class="pager">
    <button class="btn" id="prev" type="button" disabled>Previous</button>
    <span id="pageinfo">Page 1</span>
    <button class="btn" id="next" type="button" disabled>Next</button>
  </div>

  <section class="card methodology" aria-label="Rank methodology">
    <h2>Rank methodology &amp; data notes</h2>
    <p>{esc(cmeta['methodology'])}</p>
    <p>Lower rank indicates higher merit. “Closing shift” is the compared target round closing rank minus the starting round closing rank: a positive number means the seat closed at a higher rank (easier to get) in the later round. Official source: <a href="{esc(cmeta['official_url'])}" target="_blank" rel="noopener noreferrer">{esc(cmeta['official_url'])}</a>.</p>
  </section>
</main>

<dialog class="cmp-dialog" id="cmp-dialog" aria-labelledby="cmp-title">
  <div class="cmp-head">
    <div>
      <h3 id="cmp-title">Historical Cutoff Comparison</h3>
      <p id="cmp-sub"></p>
    </div>
    <button class="btn sm ghost" id="cmp-close" type="button">Close</button>
  </div>
  <div class="cmp-body" id="cmp-body"></div>
</dialog>

<footer id="site-footer" data-counselling="{counselling}"></footer>

<script>
window.CUTOFF_PAGE = {{ counselling: "{counselling}", year: {year} }};
</script>
<script src="/assets/js/layout.js"></script>
<script src="/assets/js/counselling-config.js"></script>
<script src="/assets/js/pdf-export.js"></script>
<script src="/assets/js/cutoff-app.js"></script>
</body>
</html>
"""
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(page_html)


def build_institute_pages(all_data: dict):
    os.makedirs("institutes", exist_ok=True)
    os.makedirs("assets/data", exist_ok=True)

    # Aggregate by institute slug
    inst_map = {}
    for (counselling, year), ds in all_data.items():
        inst, prog, quota, cat, gen, rows = ds["inst"], ds["prog"], ds["quota"], ds["cat"], ds["gen"], ds["rows"]
        n_rounds = len(ds["rounds"])
        for r in rows:
            iname, itype = inst[r[0]][0], inst[r[0]][1]
            slug = slugify(iname)
            if slug not in inst_map:
                inst_map[slug] = {
                    "name": iname,
                    "slug": slug,
                    "type": itype,
                    "typeLabel": TYPE_LABELS.get(itype, itype),
                    "josaaYears": set(),
                    "csabYears": set(),
                    "branches": set(),
                    "records": [],
                }
            entry = inst_map[slug]
            if counselling == "josaa":
                entry["josaaYears"].add(year)
            else:
                entry["csabYears"].add(year)
            pname = prog[r[1]][0]
            entry["branches"].add(pname)
            entry["records"].append({
                "c": counselling,
                "y": year,
                "p": pname,
                "deg": prog[r[1]][1],
                "q": quota[r[2]],
                "cat": cat[r[3]],
                "g": gen[r[4]],
                "o1": r[5],
                "c1": r[6],
                "oF": r[5 + (n_rounds - 1) * 2],
                "cF": r[6 + (n_rounds - 1) * 2],
                "rf": ds["rounds"][-1],
            })

    inst_list = sorted(inst_map.values(), key=lambda x: x["name"])

    # Write lightweight institutes.json for homepage & directory search
    index_payload = {
        "updated": LAST_UPDATED,
        "count": len(inst_list),
        "institutes": [
            {
                "name": x["name"],
                "slug": x["slug"],
                "type": x["type"],
                "typeLabel": x["typeLabel"],
                "josaa": sorted(x["josaaYears"], reverse=True),
                "csab": sorted(x["csabYears"], reverse=True),
                "branches": len(x["branches"]),
            }
            for x in inst_list
        ],
    }
    with open("assets/data/institutes.json", "w", encoding="utf-8") as f:
        json.dump(index_payload, f, separators=(",", ":"))

    # Build individual institute pages
    for inst_obj in inst_list:
        slug = inst_obj["slug"]
        iname = inst_obj["name"]
        itype_label = inst_obj["typeLabel"]
        j_years = sorted(inst_obj["josaaYears"], reverse=True)
        c_years = sorted(inst_obj["csabYears"], reverse=True)
        records = inst_obj["records"]

        # Historical summary for OPEN + Gender-Neutral across years (preferring JoSAA, fallback CSAB)
        hist_counselling = "josaa" if j_years else "csab"
        hist_years = j_years if j_years else c_years
        hist_by_branch = defaultdict(dict)
        for rec in records:
            if rec["c"] == hist_counselling and rec["cat"] == "OPEN" and rec["g"] == "Gender-Neutral":
                # Keep AI or OS (most representative) if multiple quotas exist
                prev = hist_by_branch[(rec["p"], rec["q"])].get(rec["y"])
                if prev is None:
                    hist_by_branch[(rec["p"], rec["q"])][rec["y"]] = rec["cF"]

        hist_rows_html = []
        for (bname, qcode) in sorted(hist_by_branch.keys())[:40]:
            cells = "".join(
                f'<td class="num">{fmt_num(hist_by_branch[(bname, qcode)].get(y))}</td>'
                for y in hist_years
            )
            hist_rows_html.append(
                f'<tr><td><span class="name">{esc(bname)}</span></td><td class="nowrap">{esc(qcode)}</td>{cells}</tr>'
            )

        # Latest dataset rows for pre-rendered table
        latest_c = "josaa" if j_years else "csab"
        latest_y = j_years[0] if j_years else c_years[0]
        latest_recs = [r for r in records if r["c"] == latest_c and r["y"] == latest_y]
        latest_preview = []
        for r in latest_recs[:60]:
            latest_preview.append(
                f'<tr>'
                f'<td class="prog"><span class="name">{esc(r["p"])}</span></td>'
                f'<td class="nowrap">{esc(r["q"])}</td>'
                f'<td class="nowrap">{esc(r["cat"])}</td>'
                f'<td class="nowrap">{esc(gen_label(r["g"]))}</td>'
                f'<td class="num sep">{fmt_num(r["o1"])}</td>'
                f'<td class="num">{fmt_num(r["c1"])}</td>'
                f'<td class="num sep">{fmt_num(r["oF"])}</td>'
                f'<td class="num">{fmt_num(r["cF"])}</td>'
                f'</tr>'
            )

        title = f"{iname} Cutoff {latest_y}: Branch-wise & Category Ranks | Famral Database"
        desc = (
            f"Check {iname} ({itype_label}) JoSAA & CSAB opening and closing ranks across {len(inst_obj['branches'])} branches "
            f"and all categories with historical year-wise comparisons."
        )
        canonical = f"{BASE_URL}/institutes/{slug}"
        schema = [
            {
                "@context": "https://schema.org",
                "@type": "EducationalOrganization",
                "name": iname,
                "url": canonical,
            },
            {
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Famral Database", "item": f"{BASE_URL}/"},
                    {"@type": "ListItem", "position": 2, "name": "Institutes", "item": f"{BASE_URL}/institutes/"},
                    {"@type": "ListItem", "position": 3, "name": iname, "item": canonical},
                ],
            },
        ]

        # Embed compact records for interactive filtering on this institute page
        compact_recs = [
            [r["c"], r["y"], r["p"], r["q"], r["cat"], r["g"], r["o1"], r["c1"], r["oF"], r["cF"], r["rf"]]
            for r in records
        ]

        inst_html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta name="theme-color" content="#0f6cbd">
<link rel="canonical" href="{esc(canonical)}">
<link rel="icon" href="{FAVICON}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Famral Database">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{esc(canonical)}">
<script type="application/ld+json">
{json.dumps(schema, indent=2)}
</script>
<link rel="stylesheet" href="/assets/css/site.css">
</head>
<body>

<header class="top">
  <div class="bar">
    <a class="brand" href="/">Famral <span>Database</span></a>
    <nav aria-label="Primary navigation">
      <a href="/josaa/">JoSAA</a>
      <a href="/csab/">CSAB</a>
      <a href="/institutes/" aria-current="page">Institutes</a>
      <a href="https://www.famral.com/">famral.com</a>
      <a href="https://tools.famral.com/">Tools</a>
    </nav>
  </div>
</header>

<section class="hero">
  <div>
    <nav class="crumb" aria-label="Breadcrumb"><a href="/">Famral Database</a> / <a href="/institutes/">Institutes</a> / <span>{esc(iname)}</span></nav>
    <h1>{esc(iname)}</h1>
    <p>{esc(itype_label)} · {len(inst_obj['branches'])} academic branches · Branch-wise JoSAA &amp; CSAB opening and closing ranks with historical comparisons.</p>
  </div>
  <div class="hero-actions">
    <button class="btn primary" id="inst-csv" type="button">Download CSV</button>
    {f'<a class="btn ghost" href="/josaa/cutoff/{j_years[0]}?q={esc(iname.split("(")[0].strip())}">Open in JoSAA {j_years[0]}</a>' if j_years else ''}
    {f'<a class="btn ghost" href="/csab/cutoff/{c_years[0]}?q={esc(iname.split("(")[0].strip())}">Open in CSAB {c_years[0]}</a>' if c_years else ''}
  </div>
</section>

<main>
  <section class="card info-strip" aria-label="Institute metadata">
    <div class="info-items">
      <span><strong>Institute Type:</strong> {esc(itype_label)}</span>
      <span><strong>JoSAA Years:</strong> {esc(', '.join(map(str, j_years)) if j_years else 'None')}</span>
      <span><strong>CSAB Special Years:</strong> {esc(', '.join(map(str, c_years)) if c_years else 'Not applicable')}</span>
      <span><strong>Updated:</strong> {LAST_UPDATED}</span>
    </div>
  </section>

  <h2>Historical Closing Rank Comparison ({COUNSELLING_META[hist_counselling]['short']} · OPEN · Gender-Neutral)</h2>
  <div class="card scroller" style="margin-bottom:24px">
    <table>
      <thead>
        <tr>
          <th>Branch</th>
          <th>Quota</th>
          {''.join(f'<th class="num">{y} Closing</th>' for y in hist_years)}
        </tr>
      </thead>
      <tbody>
        {''.join(hist_rows_html) if hist_rows_html else '<tr><td colspan="4" class="dash">No OPEN Gender-Neutral records available.</td></tr>'}
      </tbody>
    </table>
  </div>

  <h2>All Branch &amp; Category Cutoffs</h2>
  <section class="card filters" aria-label="Institute cutoff filters">
    <div class="row-selects">
      <div class="field"><label for="i-c">Counselling</label><select id="i-c"></select></div>
      <div class="field"><label for="i-y">Year</label><select id="i-y"></select></div>
      <div class="field"><label for="i-q">Search branch</label><input id="i-q" type="search" placeholder="e.g. Computer Science" autocomplete="off"></div>
      <div class="field"><label for="i-quota">Quota</label><select id="i-quota"></select></div>
      <div class="field"><label for="i-cat">Category</label><select id="i-cat"></select></div>
      <div class="field"><label for="i-gen">Gender</label><select id="i-gen"></select></div>
    </div>
  </section>

  <div class="meta" aria-live="polite"><span id="i-count">Showing {min(60, len(latest_recs))} of {len(latest_recs)} seats ({COUNSELLING_META[latest_c]['short']} {latest_y})</span></div>

  <div class="card scroller">
    <table>
      <thead>
        <tr class="groups">
          <th class="seat" colspan="4">Seat</th>
          <th class="sep" colspan="2">Round 1</th>
          <th class="sep" colspan="2">Final Round</th>
        </tr>
        <tr>
          <th>Program</th>
          <th>Quota</th>
          <th>Category</th>
          <th>Gender</th>
          <th class="num sep">Opening</th>
          <th class="num">Closing</th>
          <th class="num sep">Opening</th>
          <th class="num">Closing</th>
        </tr>
      </thead>
      <tbody id="i-body">
        {''.join(latest_preview)}
      </tbody>
    </table>
    <div class="empty" id="i-empty" hidden>No matching seats for the selected filters.</div>
  </div>

  <section class="card methodology">
    <h2>Rank Methodology</h2>
    <p>{esc(COUNSELLING_META['josaa']['methodology'])}</p>
    <p>{esc(COUNSELLING_META['csab']['methodology'])}</p>
  </section>
</main>

<footer>
  <div class="foot">
    <span>Data compiled from official JoSAA and CSAB releases.</span>
    <span><a href="/">Home</a> · <a href="/institutes/">All Institutes</a></span>
  </div>
</footer>

<script>
(function() {{
  var DATA = {json.dumps(compact_recs, separators=(',', ':'))};
  var fmt = new Intl.NumberFormat('en-IN');
  function esc(s) {{ return String(s).replace(/[&<>"]/g, function(c) {{ return {{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}}[c]; }}); }}
  function fnum(v) {{ return v == null || v < 0 ? '<span class="dash">—</span>' : fmt.format(v); }}
  var cEl = document.getElementById('i-c'), yEl = document.getElementById('i-y'), qEl = document.getElementById('i-q'),
      qoEl = document.getElementById('i-quota'), caEl = document.getElementById('i-cat'), geEl = document.getElementById('i-gen');

  var cs = [...new Set(DATA.map(r => r[0]))];
  cEl.innerHTML = cs.map(c => '<option value="' + c + '">' + (c === 'josaa' ? 'JoSAA' : 'CSAB Special') + '</option>').join('');
  cEl.value = {json.dumps(latest_c)};

  function syncOptions() {{
    var c = cEl.value;
    var ys = [...new Set(DATA.filter(r => r[0] === c).map(r => r[1]))].sort((a, b) => b - a);
    yEl.innerHTML = ys.map(y => '<option value="' + y + '">' + y + '</option>').join('');
    var sub = DATA.filter(r => r[0] === c && r[1] === Number(yEl.value));
    var qos = [...new Set(sub.map(r => r[3]))].sort();
    var cas = [...new Set(sub.map(r => r[4]))].sort();
    var ges = [...new Set(sub.map(r => r[5]))].sort();
    qoEl.innerHTML = '<option value="">All quotas</option>' + qos.map(x => '<option value="' + esc(x) + '">' + esc(x) + '</option>').join('');
    caEl.innerHTML = '<option value="">All categories</option>' + cas.map(x => '<option value="' + esc(x) + '">' + esc(x) + '</option>').join('');
    geEl.innerHTML = '<option value="">All genders</option>' + ges.map(x => '<option value="' + esc(x) + '">' + esc(x) + '</option>').join('');
  }}

  function getFiltered() {{
    var c = cEl.value, y = Number(yEl.value), term = qEl.value.trim().toLowerCase(),
        qo = qoEl.value, ca = caEl.value, ge = geEl.value;
    return DATA.filter(r => r[0] === c && r[1] === y && (!qo || r[3] === qo) && (!ca || r[4] === ca) && (!ge || r[5] === ge) && (!term || r[2].toLowerCase().includes(term)));
  }}

  function render() {{
    var rows = getFiltered();
    document.getElementById('i-count').textContent = 'Showing ' + rows.length + ' seats (' + (cEl.value === 'josaa' ? 'JoSAA ' : 'CSAB ') + yEl.value + ')';
    document.getElementById('i-empty').hidden = rows.length > 0;
    document.getElementById('i-body').innerHTML = rows.slice(0, 300).map(r =>
      '<tr><td class="prog"><span class="name">' + esc(r[2]) + '</span></td>' +
      '<td class="nowrap">' + esc(r[3]) + '</td><td class="nowrap">' + esc(r[4]) + '</td><td class="nowrap">' + esc(r[5] === 'Gender-Neutral' ? 'Gender-neutral' : r[5]) + '</td>' +
      '<td class="num sep">' + fnum(r[6]) + '</td><td class="num">' + fnum(r[7]) + '</td>' +
      '<td class="num sep">' + fnum(r[8]) + '</td><td class="num">' + fnum(r[9]) + '</td></tr>'
    ).join('');
  }}

  cEl.addEventListener('change', function() {{ syncOptions(); render(); }});
  [yEl, qoEl, caEl, geEl].forEach(el => el.addEventListener('change', render));
  qEl.addEventListener('input', render);

  document.getElementById('inst-csv').addEventListener('click', function() {{
    var rows = getFiltered();
    var lines = ['Counselling,Year,Program,Quota,Category,Gender,R1 Opening,R1 Closing,Final Opening,Final Closing'];
    rows.forEach(r => lines.push([r[0].toUpperCase(), r[1], '"' + r[2].replace(/"/g, '""') + '"', r[3], r[4], r[5], r[6] < 0 ? '' : r[6], r[7] < 0 ? '' : r[7], r[8] < 0 ? '' : r[8], r[9] < 0 ? '' : r[9]].join(',')));
    var blob = new Blob(['\\uFEFF' + lines.join('\\r\\n')], {{ type: 'text/csv;charset=utf-8;' }});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '{slug}-cutoffs.csv';
    a.click();
  }});

  syncOptions();
  render();
}})();
</script>
</body>
</html>
"""
        with open(f"institutes/{slug}.html", "w", encoding="utf-8") as f:
            f.write(inst_html)

    # Build /institutes/index.html
    cards_html = []
    for x in inst_list:
        j_str = f"JoSAA: {', '.join(map(str, sorted(x['josaaYears'], reverse=True)))}" if x["josaaYears"] else ""
        c_str = f"CSAB: {', '.join(map(str, sorted(x['csabYears'], reverse=True)))}" if x["csabYears"] else ""
        search_txt = f"{x['name']} {x['typeLabel']} {j_str} {c_str}".lower()
        cards_html.append(
            f'<article class="card dataset-card inst-card" data-type="{esc(x["type"])}" data-search="{esc(search_txt)}">'
            f'<h3><a href="/institutes/{x["slug"]}">{esc(x["name"])}</a></h3>'
            f'<ul class="tags"><li class="tag">{esc(x["typeLabel"])}</li><li class="tag neutral">{len(x["branches"])} branches</li></ul>'
            f'<p class="card-meta">{esc(" · ".join(p for p in [j_str, c_str] if p))}</p>'
            f'<div class="actions"><a class="btn sm primary" href="/institutes/{x["slug"]}">View cutoffs</a></div>'
            f'</article>'
        )

    dir_html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>IIT, NIT, IIIT &amp; GFTI Institute Cutoffs Directory | Famral Database</title>
<meta name="description" content="Browse {len(inst_list)} IITs, NITs, IIITs and GFTIs with branch-wise JoSAA and CSAB opening and closing ranks and historical comparisons.">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta name="theme-color" content="#0f6cbd">
<link rel="canonical" href="{BASE_URL}/institutes/">
<link rel="icon" href="{FAVICON}">
<link rel="stylesheet" href="/assets/css/site.css">
</head>
<body>
<header class="top">
  <div class="bar">
    <a class="brand" href="/">Famral <span>Database</span></a>
    <nav aria-label="Primary navigation">
      <a href="/josaa/">JoSAA</a>
      <a href="/csab/">CSAB</a>
      <a href="/institutes/" aria-current="page">Institutes</a>
      <a href="https://www.famral.com/">famral.com</a>
      <a href="https://tools.famral.com/">Tools</a>
    </nav>
  </div>
</header>

<section class="hero">
  <div>
    <nav class="crumb" aria-label="Breadcrumb"><a href="/">Famral Database</a> / <span>Institutes</span></nav>
    <h1>Institute-wise JoSAA &amp; CSAB cutoffs</h1>
    <p>Browse all {len(inst_list)} participating IITs, NITs, IIITs and GFTIs. Open any institute page for branch-wise cutoffs and historical comparisons.</p>
  </div>
</section>

<main>
  <section class="card filters" aria-label="Filter institutes">
    <div class="row-selects">
      <div class="field"><label for="d-q">Search institute name</label><input id="d-q" type="search" placeholder="e.g. NIT Trichy, IIT Bombay, IIIT Hyderabad" autocomplete="off"></div>
      <div class="field"><label for="d-t">Institute type</label>
        <select id="d-t">
          <option value="">All types</option>
          <option value="IIT">IIT</option>
          <option value="NIT">NIT</option>
          <option value="3IT">IIIT</option>
          <option value="CFI">Other GFTI</option>
        </select>
      </div>
    </div>
  </section>
  <div class="meta"><span id="d-count">Showing {len(inst_list)} institutes</span></div>
  <div class="grid" id="d-grid">
    {''.join(cards_html)}
  </div>
  <div class="empty-box" id="d-empty">No institute matches your search.</div>
</main>

<footer>
  <div class="foot">
    <span>Data compiled from official JoSAA and CSAB releases.</span>
    <span><a href="/">Home</a> · <a href="/josaa/">JoSAA</a> · <a href="/csab/">CSAB</a></span>
  </div>
</footer>

<script>
(function() {{
  var q = document.getElementById('d-q'), t = document.getElementById('d-t'),
      cards = [...document.querySelectorAll('.inst-card')], empty = document.getElementById('d-empty'),
      count = document.getElementById('d-count');
  function filter() {{
    var term = q.value.trim().toLowerCase(), tv = t.value, shown = 0;
    cards.forEach(c => {{
      var hit = (!tv || c.dataset.type === tv) && (!term || c.dataset.search.includes(term));
      c.hidden = !hit;
      if (hit) shown++;
    }});
    count.textContent = 'Showing ' + shown + ' institutes';
    empty.style.display = shown ? 'none' : 'block';
  }}
  q.addEventListener('input', filter);
  t.addEventListener('change', filter);
}})();
</script>
</body>
</html>
"""
    with open("institutes/index.html", "w", encoding="utf-8") as f:
        f.write(dir_html)

    return inst_list


def build_sitemap():
    urls = [
        (f"{BASE_URL}/", LAST_UPDATED),
        (f"{BASE_URL}/josaa/", LAST_UPDATED),
        (f"{BASE_URL}/josaa/cutoff/", LAST_UPDATED),
        (f"{BASE_URL}/csab/", LAST_UPDATED),
        (f"{BASE_URL}/csab/cutoff/", LAST_UPDATED),
    ]
    for c, y, _, _, _, _ in DATASETS:
        urls.append((f"{BASE_URL}/{c}/cutoff/{y}", LAST_UPDATED))

    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, mod in urls:
        lines.append(f"  <url><loc>{esc(loc)}</loc><lastmod>{mod}</lastmod></url>")
    lines.append("</urlset>")
    with open("sitemap.xml", "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return len(urls)


def main():
    for counselling, year, json_path, html_path, rounds, has_prep in DATASETS:
        ds = load_normalized(json_path, rounds, has_prep)
        build_cutoff_page(counselling, year, ds, html_path, json_path)

    sitemap_count = build_sitemap()
    print(f"Built 7 cutoff pages and sitemap.xml ({sitemap_count} URLs).")


if __name__ == "__main__":
    main()
