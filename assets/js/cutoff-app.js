(function () {
  'use strict';

  var pageCfg = window.CUTOFF_PAGE;
  if (!pageCfg || !window.FAMRAL_CONFIG) return;

  var cCfg = window.FAMRAL_CONFIG[pageCfg.counselling];
  var dsCfg = cCfg.datasets[pageCfg.year];
  var fmt = new Intl.NumberFormat('en-IN');
  var cache = {};

  function slugify(name) {
    return String(name)
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function genLabel(g) {
    return g === 'Gender-Neutral' ? 'Gender-neutral' : g;
  }

  function normalizeDataset(raw, dsMeta) {
    if (raw && Array.isArray(raw.seats)) {
      var D = { inst: [], prog: [], quota: [], cat: [], gen: [], rows: [], rounds: dsMeta.rounds.slice() };
      var maps = { inst: new Map(), prog: new Map(), quota: new Map(), cat: new Map(), gen: new Map() };
      function ix(key, val) {
        var m = maps[key];
        var k = Array.isArray(val) ? val.join('\u0000') : val;
        if (m.has(k)) return m.get(k);
        var idx = D[key].length;
        D[key].push(val);
        m.set(k, idx);
        return idx;
      }
      for (var i = 0; i < raw.seats.length; i++) {
        var s = raw.seats[i];
        var r1 = s.round1 || {};
        var r2 = s['round' + dsMeta.rounds[1]] || s.round6 || {};
        D.rows.push([
          ix('inst', [s.institute, s.type || 'CFI']),
          ix('prog', [s.program, '']),
          ix('quota', s.quota),
          ix('cat', s.category),
          ix('gen', s.gender),
          r1.opening == null ? -1 : r1.opening,
          r1.closing == null ? -1 : r1.closing,
          r2.opening == null ? -1 : r2.opening,
          r2.closing == null ? -1 : r2.closing
        ]);
      }
      return D;
    }

    return {
      inst: raw.inst,
      prog: raw.prog,
      quota: raw.quota,
      cat: raw.cat,
      gen: raw.gen,
      rows: raw.rows,
      rounds: dsMeta.rounds.slice(),
      hasPrepFlag: !!dsMeta.hasPrepFlag
    };
  }

  function fetchDataset(year) {
    var key = pageCfg.counselling + ':' + year;
    if (cache[key]) return Promise.resolve(cache[key]);
    var meta = cCfg.datasets[year];
    return fetch(meta.jsonUrl)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (raw) {
        var norm = normalizeDataset(raw, meta);
        cache[key] = norm;
        return norm;
      });
  }

  function init(D) {
    var INST = D.inst, PROG = D.prog, QUOTA = D.quota, CAT = D.cat, GEN = D.gen, ROWS = D.rows;
    var rounds = D.rounds;
    var numRounds = rounds.length;
    var instL = INST.map(function (x) { return x[0].toLowerCase(); });
    var progL = PROG.map(function (x) { return (x[0] + ' ' + x[1]).toLowerCase(); });

    var SEARCH_ALIASES = {
      cse: ['computer science'],
      cs: ['computer science'],
      ece: ['electronics and communication'],
      eee: ['electrical and electronics'],
      ee: ['electrical engineering'],
      me: ['mechanical engineering'],
      mech: ['mechanical engineering'],
      ce: ['civil engineering'],
      che: ['chemical engineering'],
      it: ['information technology'],
      ai: ['artificial intelligence'],
      ds: ['data science'],
      ml: ['machine learning'],
      iitb: ['bombay'],
      iitd: ['delhi'],
      iitm: ['madras'],
      iitk: ['kanpur'],
      iitkgp: ['kharagpur'],
      iitr: ['roorkee'],
      iitg: ['guwahati'],
      iith: ['hyderabad'],
      nitt: ['tiruchirappalli'],
      nitk: ['surathkal', 'karnataka'],
      nitw: ['warangal'],
      nitr: ['rourkela'],
      mnnit: ['allahabad'],
      mnit: ['jaipur'],
      vnit: ['nagpur'],
      svnit: ['surat']
    };

    function expandSearchTokens(rawQuery) {
      return rawQuery.toLowerCase().split(/\s+/).filter(Boolean).map(function (tok) {
        return SEARCH_ALIASES[tok] ? [tok].concat(SEARCH_ALIASES[tok]) : [tok];
      });
    }

    var S = {
      q: '',
      type: '',
      quota: '',
      cat: '',
      gen: '',
      rA: 0,
      rB: numRounds - 1,
      key: null,
      dir: 1,
      page: 0,
      pageSize: 50
    };

    // Hydrate filters from URL query string
    var params = new URLSearchParams(window.location.search);
    if (params.get('q')) S.q = params.get('q');
    if (params.get('type')) S.type = params.get('type');
    if (params.get('quota')) S.quota = params.get('quota');
    if (params.get('cat')) S.cat = params.get('cat');
    if (params.get('gen')) S.gen = params.get('gen');
    if (params.get('ra') !== null) {
      var raIdx = Number(params.get('ra'));
      if (!isNaN(raIdx) && raIdx >= 0 && raIdx < numRounds) S.rA = raIdx;
    }
    if (params.get('rb') !== null) {
      var rbIdx = Number(params.get('rb'));
      if (!isNaN(rbIdx) && rbIdx >= 0 && rbIdx < numRounds) S.rB = rbIdx;
    }

    var view = [];

    function fillSelect(id, allLabel, opts) {
      var el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = (allLabel ? '<option value="">' + esc(allLabel) + '</option>' : '') +
        opts.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>'; }).join('');
    }

    var typesPresent = [];
    INST.forEach(function (x) { if (typesPresent.indexOf(x[1]) < 0) typesPresent.push(x[1]); });
    fillSelect('f-type', 'All types', typesPresent.map(function (t) { return [t, cCfg.typeLabels[t] || t]; }));
    fillSelect('f-quota', 'All quotas', QUOTA.map(function (q) { return [q, cCfg.quotaLabels[q] ? cCfg.quotaLabels[q] + ' (' + q + ')' : q]; }));
    fillSelect('f-cat', 'All categories', CAT.map(function (c) { return [c, c]; }));
    fillSelect('f-gen', 'All genders', GEN.map(function (g) { return [g, genLabel(g)]; }));

    // Round comparison selectors
    var rAEl = document.getElementById('f-ra');
    var rBEl = document.getElementById('f-rb');
    if (rAEl && rBEl) {
      var rOpts = rounds.map(function (r, idx) { return [String(idx), 'Round ' + r]; });
      fillSelect('f-ra', null, rOpts);
      fillSelect('f-rb', null, rOpts);
      rAEl.value = String(S.rA);
      rBEl.value = String(S.rB);
    }

    // Apply hydrated state to inputs
    document.getElementById('q').value = S.q;
    document.getElementById('f-type').value = S.type;
    document.getElementById('f-quota').value = S.quota;
    document.getElementById('f-cat').value = S.cat;
    document.getElementById('f-gen').value = S.gen;

    function getRoundPair(r, roundIdx) {
      var oIdx = 5 + roundIdx * 2;
      var cIdx = 6 + roundIdx * 2;
      var prepMask = D.hasPrepFlag ? (r[5 + numRounds * 2] || 0) : 0;
      return {
        o: r[oIdx],
        c: r[cIdx],
        oPrep: !!(prepMask & (1 << (roundIdx * 2))),
        cPrep: !!(prepMask & (1 << (roundIdx * 2 + 1)))
      };
    }

    function shiftOf(r) {
      var a = getRoundPair(r, S.rA);
      var b = getRoundPair(r, S.rB);
      if (a.c < 0 || b.c < 0) return null;
      if (D.hasPrepFlag && a.cPrep !== b.cPrep) return null;
      return b.c - a.c;
    }

    var COLS = [
      { k: 'inst', label: 'Institute' },
      { k: 'prog', label: 'Program' },
      { k: 'quota', label: 'Quota' },
      { k: 'cat', label: 'Category' },
      { k: 'gen', label: 'Gender' },
      { k: 'oA', label: 'Opening', num: 1, sep: 1 },
      { k: 'cA', label: 'Closing', num: 1 },
      { k: 'oB', label: 'Opening', num: 1, sep: 1 },
      { k: 'cB', label: 'Closing', num: 1 },
      { k: 'shift', label: 'Closing shift', num: 1, sep: 1 }
    ];

    var KEY = {
      inst: function (r) { return INST[r[0]][0]; },
      prog: function (r) { return PROG[r[1]][0] + ' ' + PROG[r[1]][1]; },
      quota: function (r) { return QUOTA[r[2]]; },
      cat: function (r) { return CAT[r[3]]; },
      gen: function (r) { return GEN[r[4]]; },
      oA: function (r) { var v = getRoundPair(r, S.rA).o; return v < 0 ? null : v; },
      cA: function (r) { var v = getRoundPair(r, S.rA).c; return v < 0 ? null : v; },
      oB: function (r) { var v = getRoundPair(r, S.rB).o; return v < 0 ? null : v; },
      cB: function (r) { var v = getRoundPair(r, S.rB).c; return v < 0 ? null : v; },
      shift: function (r) { return shiftOf(r); }
    };

    var colsEl = document.getElementById('cols');
    var grpA = document.getElementById('grp-ra');
    var grpB = document.getElementById('grp-rb');

    function renderHead() {
      if (grpA) grpA.textContent = 'Round ' + rounds[S.rA];
      if (grpB) grpB.textContent = 'Round ' + rounds[S.rB];
      colsEl.innerHTML = COLS.map(function (c) {
        if (c.nosort) {
          return '<th scope="col" class="' + (c.sep ? 'sep' : '') + '">' + esc(c.label) + '</th>';
        }
        var active = S.key === c.k;
        var arrow = active ? (S.dir > 0 ? '▲' : '▼') : '';
        var aria = active ? (S.dir > 0 ? 'ascending' : 'descending') : 'none';
        return '<th scope="col" class="' + (c.num ? 'num ' : '') + (c.sep ? 'sep' : '') + '" aria-sort="' + aria + '">' +
          '<button type="button" class="sort" data-k="' + c.k + '">' + esc(c.label) + '<span class="arrow" aria-hidden="true">' + arrow + '</span></button></th>';
      }).join('');
    }

    colsEl.addEventListener('click', function (e) {
      var b = e.target.closest('.sort');
      if (!b) return;
      var k = b.getAttribute('data-k');
      if (S.key !== k) { S.key = k; S.dir = 1; }
      else if (S.dir === 1) { S.dir = -1; }
      else { S.key = null; S.dir = 1; }
      S.page = 0;
      renderHead();
      update();
    });

    function syncUrl() {
      var p = new URLSearchParams();
      if (S.q) p.set('q', S.q);
      if (S.type) p.set('type', S.type);
      if (S.quota) p.set('quota', S.quota);
      if (S.cat) p.set('cat', S.cat);
      if (S.gen) p.set('gen', S.gen);
      if (S.rA !== 0) p.set('ra', String(S.rA));
      if (S.rB !== numRounds - 1) p.set('rb', String(S.rB));
      var qs = p.toString();
      var nextUrl = window.location.pathname + (qs ? '?' + qs : '');
      window.history.replaceState(null, '', nextUrl);
    }

    function applyFilters() {
      var tokenGroups = expandSearchTokens(S.q);
      var out = [];
      for (var n = 0; n < ROWS.length; n++) {
        var r = ROWS[n];
        if (S.type && INST[r[0]][1] !== S.type) continue;
        if (S.quota && QUOTA[r[2]] !== S.quota) continue;
        if (S.cat && CAT[r[3]] !== S.cat) continue;
        if (S.gen && GEN[r[4]] !== S.gen) continue;
        if (tokenGroups.length) {
          var hay = instL[r[0]] + ' ' + progL[r[1]] + ' ' +
            (cCfg.typeLabels[INST[r[0]][1]] || '').toLowerCase() + ' ' +
            QUOTA[r[2]].toLowerCase() + ' ' + CAT[r[3]].toLowerCase();
          var ok = true;
          for (var t = 0; t < tokenGroups.length; t++) {
            var alts = tokenGroups[t];
            var matched = false;
            for (var a = 0; a < alts.length; a++) {
              if (hay.indexOf(alts[a]) >= 0) { matched = true; break; }
            }
            if (!matched) { ok = false; break; }
          }
          if (!ok) continue;
        }
        out.push(n);
      }
      if (S.key && KEY[S.key]) {
        var f = KEY[S.key], d = S.dir;
        out.sort(function (a, b) {
          var x = f(ROWS[a]), y = f(ROWS[b]);
          if (x === null && y === null) return a - b;
          if (x === null) return 1;
          if (y === null) return -1;
          var c = typeof x === 'string' ? x.localeCompare(y) : x - y;
          return c ? c * d : a - b;
        });
      }
      return out;
    }

    function shiftHtml(v) {
      if (v === null) return '<span class="dash">—</span>';
      if (v > 0) return '<span class="pos">+' + fmt.format(v) + '</span>';
      if (v < 0) return '<span class="neg">−' + fmt.format(-v) + '</span>';
      return '0';
    }

    function rankHtml(v, p) {
      return v < 0 ? '<span class="dash">—</span>' : fmt.format(v) + (p ? '<span class="prep" title="Preparatory-course rank">P</span>' : '');
    }

    function render() {
      var total = view.length;
      var pages = Math.max(1, Math.ceil(total / S.pageSize));
      if (S.page >= pages) S.page = pages - 1;
      var start = S.page * S.pageSize, end = Math.min(total, start + S.pageSize);
      var html = '';
      for (var i = start; i < end; i++) {
        var rowIdx = view[i];
        var r = ROWS[rowIdx];
        var inst = INST[r[0]], prog = PROG[r[1]], q = QUOTA[r[2]];
        var a = getRoundPair(r, S.rA);
        var b = getRoundPair(r, S.rB);
        var sh = shiftOf(r);
        var rALabel = 'R' + rounds[S.rA];
        var rBLabel = 'R' + rounds[S.rB];
        html += '<tr>' +
          '<td class="inst"><span class="name">' + esc(inst[0]) + '</span><span class="sub">' + esc(cCfg.typeLabels[inst[1]] || inst[1]) + '</span></td>' +
          '<td class="prog"><span class="name">' + esc(prog[0]) + '</span>' + (prog[1] ? '<span class="sub">' + esc(prog[1]) + '</span>' : '') + '</td>' +
          '<td class="nowrap" data-label="Quota" title="' + esc(cCfg.quotaLabels[q] || q) + '">' + esc(q) + '</td>' +
          '<td class="nowrap" data-label="Category">' + esc(CAT[r[3]]) + '</td>' +
          '<td class="nowrap" data-label="Gender">' + esc(genLabel(GEN[r[4]])) + '</td>' +
          '<td class="num sep" data-label="' + rALabel + ' Opening">' + rankHtml(a.o, a.oPrep) + '</td>' +
          '<td class="num" data-label="' + rALabel + ' Closing">' + rankHtml(a.c, a.cPrep) + '</td>' +
          '<td class="num sep" data-label="' + rBLabel + ' Opening">' + rankHtml(b.o, b.oPrep) + '</td>' +
          '<td class="num" data-label="' + rBLabel + ' Closing">' + rankHtml(b.c, b.cPrep) + '</td>' +
          '<td class="num sep" data-label="Closing Shift">' + shiftHtml(sh) + '</td>' +
          '</tr>';
      }
      document.getElementById('body').innerHTML = html;
      var empty = document.getElementById('empty');
      if (total === 0) {
        empty.hidden = false;
        empty.textContent = 'No seats match these filters. Clear a filter or shorten the search to see more.';
        document.getElementById('count').textContent = '0 of ' + fmt.format(ROWS.length) + ' seats';
      } else {
        empty.hidden = true;
        document.getElementById('count').textContent = 'Showing ' + fmt.format(start + 1) + '–' + fmt.format(end) + ' of ' + fmt.format(total) + ' seats';
      }
      document.getElementById('pageinfo').textContent = 'Page ' + (S.page + 1) + ' of ' + pages;
      document.getElementById('prev').disabled = S.page === 0;
      document.getElementById('next').disabled = S.page >= pages - 1;
    }

    function update() {
      syncUrl();
      view = applyFilters();
      render();
    }

    // Download dropdown & Share button
    var dlToggle = document.getElementById('dl-toggle');
    var dlMenu = document.getElementById('dl-menu');
    if (dlToggle && dlMenu) {
      dlToggle.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = dlMenu.hidden;
        dlMenu.hidden = !open;
        dlToggle.setAttribute('aria-expanded', String(open));
      });
      document.addEventListener('click', function (e) {
        if (!dlMenu.hidden && !dlMenu.contains(e.target) && e.target !== dlToggle) {
          dlMenu.hidden = true;
          dlToggle.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !dlMenu.hidden) {
          dlMenu.hidden = true;
          dlToggle.setAttribute('aria-expanded', 'false');
        }
      });
    }

    var shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        syncUrl();
        var url = window.location.href;
        var done = function () {
          var orig = shareBtn.textContent;
          shareBtn.textContent = 'Link copied!';
          setTimeout(function () { shareBtn.textContent = orig; }, 2000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done).catch(function () {
            window.prompt('Copy link:', url);
          });
        } else {
          window.prompt('Copy link:', url);
        }
      });
    }

    // CSV & real XLSX exports
    function downloadBlob(content, mime, filename) {
      var blob = content instanceof Blob ? content : new Blob([content], { type: mime });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function csvCell(v) {
      var s = String(v == null ? '' : v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    var csvBtn = document.getElementById('dl-csv');
    if (csvBtn) {
      csvBtn.addEventListener('click', function () {
        if (dlMenu) { dlMenu.hidden = true; dlToggle.setAttribute('aria-expanded', 'false'); }
        var rAName = 'Round ' + rounds[S.rA];
        var rBName = 'Round ' + rounds[S.rB];
        var lines = [[
          'Institute', 'Type', 'Program', 'Duration/Degree', 'Quota', 'Category', 'Gender',
          rAName + ' Opening', rAName + ' Closing', rBName + ' Opening', rBName + ' Closing', 'Closing Shift'
        ].map(csvCell).join(',')];

        for (var i = 0; i < view.length; i++) {
          var r = ROWS[view[i]];
          var a = getRoundPair(r, S.rA);
          var b = getRoundPair(r, S.rB);
          var sh = shiftOf(r);
          lines.push([
            INST[r[0]][0], cCfg.typeLabels[INST[r[0]][1]] || INST[r[0]][1],
            PROG[r[1]][0], PROG[r[1]][1],
            QUOTA[r[2]], CAT[r[3]], genLabel(GEN[r[4]]),
            a.o < 0 ? '' : a.o, a.c < 0 ? '' : a.c,
            b.o < 0 ? '' : b.o, b.c < 0 ? '' : b.c,
            sh === null ? '' : sh
          ].map(csvCell).join(','));
        }
        downloadBlob('\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8;', pageCfg.counselling + '-' + pageCfg.year + '-cutoffs.csv');
      });
    }

    // Minimal uncompressed ZIP + OOXML (.xlsx) builder so Excel/Numbers/Sheets open cleanly
    function buildXlsxBlob(headers, dataRows) {
      var crcTable = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        crcTable[n] = c >>> 0;
      }
      function crc32(bytes) {
        var crc = 0xffffffff;
        for (var i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
        return (crc ^ 0xffffffff) >>> 0;
      }
      function colName(idx) {
        var s = '';
        idx += 1;
        while (idx > 0) {
          var m = (idx - 1) % 26;
          s = String.fromCharCode(65 + m) + s;
          idx = Math.floor((idx - 1) / 26);
        }
        return s;
      }
      function xmlEsc(s) {
        return String(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/[&<>"]/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
      }

      var sheetParts = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
      ];
      sheetParts.push('<row r="1">' + headers.map(function (h, ci) {
        return '<c r="' + colName(ci) + '1" t="inlineStr"><is><t>' + xmlEsc(h) + '</t></is></c>';
      }).join('') + '</row>');

      for (var ri = 0; ri < dataRows.length; ri++) {
        var rowNum = ri + 2;
        var vals = dataRows[ri];
        var cells = '';
        for (var ci = 0; ci < vals.length; ci++) {
          var v = vals[ci];
          if (v === '' || v === null || v === undefined) continue;
          var ref = colName(ci) + rowNum;
          if (typeof v === 'number') {
            cells += '<c r="' + ref + '" t="n"><v>' + v + '</v></c>';
          } else {
            cells += '<c r="' + ref + '" t="inlineStr"><is><t>' + xmlEsc(v) + '</t></is></c>';
          }
        }
        sheetParts.push('<row r="' + rowNum + '">' + cells + '</row>');
      }
      sheetParts.push('</sheetData></worksheet>');

      var files = [
        {
          name: '[Content_Types].xml',
          data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
        },
        {
          name: '_rels/.rels',
          data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
        },
        {
          name: 'xl/workbook.xml',
          data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Cutoffs" sheetId="1" r:id="rId1"/></sheets></workbook>'
        },
        {
          name: 'xl/_rels/workbook.xml.rels',
          data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
        },
        {
          name: 'xl/worksheets/sheet1.xml',
          data: sheetParts.join('')
        }
      ];

      var enc = new TextEncoder();
      var localChunks = [];
      var centralChunks = [];
      var offset = 0;

      files.forEach(function (f) {
        var nameBytes = enc.encode(f.name);
        var dataBytes = enc.encode(f.data);
        var crc = crc32(dataBytes);
        var lh = new Uint8Array(30 + nameBytes.length);
        var lv = new DataView(lh.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);
        lv.setUint16(6, 0x0800, true);
        lv.setUint16(8, 0, true);
        lv.setUint16(10, 0, true);
        lv.setUint16(12, 0, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, dataBytes.length, true);
        lv.setUint32(22, dataBytes.length, true);
        lv.setUint16(26, nameBytes.length, true);
        lv.setUint16(28, 0, true);
        lh.set(nameBytes, 30);

        localChunks.push(lh, dataBytes);

        var ch = new Uint8Array(46 + nameBytes.length);
        var cv = new DataView(ch.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint16(8, 0x0800, true);
        cv.setUint16(10, 0, true);
        cv.setUint16(12, 0, true);
        cv.setUint16(14, 0, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, dataBytes.length, true);
        cv.setUint32(24, dataBytes.length, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint16(30, 0, true);
        cv.setUint16(32, 0, true);
        cv.setUint16(34, 0, true);
        cv.setUint16(36, 0, true);
        cv.setUint32(38, 0, true);
        cv.setUint32(42, offset, true);
        ch.set(nameBytes, 46);

        centralChunks.push(ch);
        offset += lh.length + dataBytes.length;
      });

      var cdSize = centralChunks.reduce(function (s, b) { return s + b.length; }, 0);
      var eocd = new Uint8Array(22);
      var ev = new DataView(eocd.buffer);
      ev.setUint32(0, 0x06054b50, true);
      ev.setUint16(4, 0, true);
      ev.setUint16(6, 0, true);
      ev.setUint16(8, files.length, true);
      ev.setUint16(10, files.length, true);
      ev.setUint32(12, cdSize, true);
      ev.setUint32(16, offset, true);
      ev.setUint16(20, 0, true);

      return new Blob(localChunks.concat(centralChunks, [eocd]), {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
    }

    var xlsBtn = document.getElementById('dl-xls');
    if (xlsBtn) {
      xlsBtn.addEventListener('click', function () {
        if (dlMenu) { dlMenu.hidden = true; dlToggle.setAttribute('aria-expanded', 'false'); }
        var rAName = 'Round ' + rounds[S.rA];
        var rBName = 'Round ' + rounds[S.rB];
        var headers = [
          'Institute', 'Type', 'Program', 'Degree', 'Quota', 'Category', 'Gender',
          rAName + ' Opening', rAName + ' Closing', rBName + ' Opening', rBName + ' Closing', 'Closing Shift'
        ];
        var dataRows = [];
        for (var i = 0; i < view.length; i++) {
          var r = ROWS[view[i]];
          var a = getRoundPair(r, S.rA);
          var b = getRoundPair(r, S.rB);
          var sh = shiftOf(r);
          dataRows.push([
            INST[r[0]][0], cCfg.typeLabels[INST[r[0]][1]] || INST[r[0]][1],
            PROG[r[1]][0], PROG[r[1]][1],
            QUOTA[r[2]], CAT[r[3]], genLabel(GEN[r[4]]),
            a.o < 0 ? '' : a.o, a.c < 0 ? '' : a.c,
            b.o < 0 ? '' : b.o, b.c < 0 ? '' : b.c,
            sh === null ? '' : sh
          ]);
        }
        var blob = buildXlsxBlob(headers, dataRows);
        downloadBlob(blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pageCfg.counselling + '-' + pageCfg.year + '-cutoffs.xlsx');
      });
    }

    var pdfBtn = document.getElementById('dl-pdf');
    if (pdfBtn && window.FAMRAL_PDF) {
      pdfBtn.addEventListener('click', function () {
        if (dlMenu) { dlMenu.hidden = true; dlToggle.setAttribute('aria-expanded', 'false'); }
        var rALabel = 'R' + rounds[S.rA];
        var rBLabel = 'R' + rounds[S.rB];
        var headers = ['Institute', 'Program', 'Quota', 'Category', 'Gender', rALabel + ' Open', rALabel + ' Close', rBLabel + ' Open', rBLabel + ' Close'];
        var dataRows = [];
        var limit = Math.min(view.length, 1500);
        for (var i = 0; i < limit; i++) {
          var r = ROWS[view[i]];
          var a = getRoundPair(r, S.rA);
          var b = getRoundPair(r, S.rB);
          dataRows.push([
            INST[r[0]][0],
            PROG[r[1]][0],
            QUOTA[r[2]],
            CAT[r[3]],
            genLabel(GEN[r[4]]),
            a.o < 0 ? '-' : fmt.format(a.o),
            a.c < 0 ? '-' : fmt.format(a.c),
            b.o < 0 ? '-' : fmt.format(b.o),
            b.c < 0 ? '-' : fmt.format(b.c)
          ]);
        }
        var title = cCfg.shortName + ' ' + pageCfg.year + ' Opening & Closing Ranks';
        var subtitle = 'Exported ' + dataRows.length + ' of ' + view.length + ' matching seats · Source: database.famral.com';
        var blob = window.FAMRAL_PDF.buildPdfBlob(title, subtitle, headers, dataRows);
        downloadBlob(blob, 'application/pdf', pageCfg.counselling + '-' + pageCfg.year + '-cutoffs.pdf');
      });
    }

    // Event listeners
    var timer;
    document.getElementById('q').addEventListener('input', function (e) {
      clearTimeout(timer);
      var v = e.target.value;
      timer = setTimeout(function () { S.q = v; S.page = 0; update(); }, 150);
    });
    [['f-type', 'type'], ['f-quota', 'quota'], ['f-cat', 'cat'], ['f-gen', 'gen']].forEach(function (p) {
      document.getElementById(p[0]).addEventListener('change', function (e) { S[p[1]] = e.target.value; S.page = 0; update(); });
    });
    if (rAEl && rBEl) {
      rAEl.addEventListener('change', function (e) { S.rA = Number(e.target.value); renderHead(); update(); });
      rBEl.addEventListener('change', function (e) { S.rB = Number(e.target.value); renderHead(); update(); });
    }
    var pageSizeEl = document.getElementById('f-pagesize');
    if (pageSizeEl) {
      pageSizeEl.addEventListener('change', function (e) { S.pageSize = Number(e.target.value) || 50; S.page = 0; render(); });
    }
    document.getElementById('clear').addEventListener('click', function () {
      S.q = S.type = S.quota = S.cat = S.gen = '';
      S.rA = 0;
      S.rB = numRounds - 1;
      S.page = 0;
      document.getElementById('q').value = '';
      ['f-type', 'f-quota', 'f-cat', 'f-gen'].forEach(function (id) { document.getElementById(id).value = ''; });
      if (rAEl) rAEl.value = '0';
      if (rBEl) rBEl.value = String(numRounds - 1);
      renderHead();
      update();
    });
    function go(delta) {
      S.page += delta;
      render();
      document.getElementById('tablewrap').scrollIntoView({ block: 'start' });
    }
    document.getElementById('prev').addEventListener('click', function () { go(-1); });
    document.getElementById('next').addEventListener('click', function () { go(1); });

    renderHead();
    update();
  }

  var countEl = document.getElementById('count');
  countEl.textContent = 'Loading dataset…';
  fetchDataset(pageCfg.year)
    .then(init)
    .catch(function (err) {
      console.error(err);
      countEl.textContent = '';
      var e = document.getElementById('empty');
      e.hidden = false;
      e.textContent = 'Could not load ' + dsCfg.jsonUrl + '. Open this site through a web server rather than a local file:// URL.';
    });
})();
