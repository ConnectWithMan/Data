(function (global) {
  'use strict';

  var fmt = new Intl.NumberFormat('en-IN');

  function buildPdfBlob(title, subtitle, headers, dataRows) {
    function pdfEsc(s) {
      return String(s).replace(/[^\x20-\x7e]/g, ' ').replace(/([()\\])/g, '\\$1');
    }
    function trunc(s, maxLen) {
      s = String(s == null ? '' : s);
      return s.length > maxLen ? s.slice(0, maxLen - 1) + '.' : s;
    }

    var pageW = 842, pageH = 595, margin = 28;
    var colX = [28, 230, 440, 480, 535, 610, 665, 720, 775];
    var maxLens = [38, 40, 6, 9, 13, 9, 9, 9, 9];
    var rowsPerPage = 34;
    var totalRows = Math.min(dataRows.length, 1500);
    var numPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

    var objects = [];
    function addObj(body) {
      objects.push(body);
      return objects.length;
    }

    var fontId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    var boldFontId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
    var pagesId = addObj('');
    var pageIds = [];

    for (var p = 0; p < numPages; p++) {
      var stream = [];
      stream.push('BT');
      stream.push('/F2 13 Tf ' + margin + ' ' + (pageH - 34) + ' Td (' + pdfEsc(title) + ') Tj');
      stream.push('/F1 8.5 Tf 0 -14 Td (' + pdfEsc(subtitle + ' (Page ' + (p + 1) + ' of ' + numPages + ')') + ') Tj');
      stream.push('ET');

      var y = pageH - 72;
      stream.push('0.94 0.96 0.99 rg ' + margin + ' ' + (y - 4) + ' ' + (pageW - margin * 2) + ' 16 re f 0 0 0 rg');
      stream.push('BT /F2 8 Tf');
      for (var hi = 0; hi < headers.length; hi++) {
        stream.push('1 0 0 1 ' + colX[hi] + ' ' + y + ' Tm (' + pdfEsc(trunc(headers[hi], maxLens[hi])) + ') Tj');
      }
      stream.push('ET');

      y -= 16;
      var start = p * rowsPerPage;
      var end = Math.min(totalRows, start + rowsPerPage);
      stream.push('BT /F1 7.5 Tf');
      for (var ri = start; ri < end; ri++) {
        var row = dataRows[ri];
        for (var ci = 0; ci < row.length; ci++) {
          stream.push('1 0 0 1 ' + colX[ci] + ' ' + y + ' Tm (' + pdfEsc(trunc(row[ci], maxLens[ci])) + ') Tj');
        }
        y -= 13.5;
      }
      stream.push('ET');

      var streamStr = stream.join('\n');
      var contentId = addObj('<< /Length ' + streamStr.length + ' >>\nstream\n' + streamStr + '\nendstream');
      var pageId = addObj(
        '<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + pageW + ' ' + pageH + '] ' +
        '/Resources << /Font << /F1 ' + fontId + ' 0 R /F2 ' + boldFontId + ' 0 R >> >> ' +
        '/Contents ' + contentId + ' 0 R >>'
      );
      pageIds.push(pageId);
    }

    objects[pagesId - 1] = '<< /Type /Pages /Kids [' + pageIds.map(function (id) { return id + ' 0 R'; }).join(' ') + '] /Count ' + pageIds.length + ' >>';
    var catalogId = addObj('<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>');

    var pdf = '%PDF-1.4\n';
    var offsets = [0];
    for (var i = 0; i < objects.length; i++) {
      offsets.push(pdf.length);
      pdf += (i + 1) + ' 0 obj\n' + objects[i] + '\nendobj\n';
    }
    var xrefPos = pdf.length;
    pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
    for (var j = 1; j < offsets.length; j++) {
      pdf += String(offsets[j]).padStart(10, '0') + ' 00000 n \n';
    }
    pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root ' + catalogId + ' 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF';

    return new Blob([pdf], { type: 'application/pdf' });
  }

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function downloadDatasetPdf(counselling, year, btn) {
    var cfg = global.FAMRAL_CONFIG && global.FAMRAL_CONFIG[counselling];
    var dsMeta = cfg && cfg.datasets[year];
    if (!dsMeta) return;

    var origText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Generating PDF…';
    }

    fetch(dsMeta.jsonUrl)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (raw) {
        var r1 = dsMeta.rounds[0];
        var rF = dsMeta.rounds[dsMeta.rounds.length - 1];
        var headers = ['Institute', 'Program', 'Quota', 'Category', 'Gender', 'R' + r1 + ' Open', 'R' + r1 + ' Close', 'R' + rF + ' Open', 'R' + rF + ' Close'];
        var dataRows = [];
        var total = 0;

        if (raw && Array.isArray(raw.seats)) {
          total = raw.seats.length;
          var lim = Math.min(total, 1500);
          for (var i = 0; i < lim; i++) {
            var s = raw.seats[i];
            var a = s.round1 || {};
            var b = s['round' + rF] || s.round6 || {};
            dataRows.push([
              s.institute,
              s.program,
              s.quota,
              s.category,
              s.gender === 'Gender-Neutral' ? 'Gender-neutral' : s.gender,
              a.opening == null ? '-' : fmt.format(a.opening),
              a.closing == null ? '-' : fmt.format(a.closing),
              b.opening == null ? '-' : fmt.format(b.opening),
              b.closing == null ? '-' : fmt.format(b.closing)
            ]);
          }
        } else if (raw && Array.isArray(raw.rows)) {
          total = raw.rows.length;
          var lim2 = Math.min(total, 1500);
          var lastIdx = dsMeta.rounds.length - 1;
          for (var k = 0; k < lim2; k++) {
            var r = raw.rows[k];
            var o1 = r[5], c1 = r[6], oF = r[5 + lastIdx * 2], cF = r[6 + lastIdx * 2];
            dataRows.push([
              raw.inst[r[0]][0],
              raw.prog[r[1]][0],
              raw.quota[r[2]],
              raw.cat[r[3]],
              raw.gen[r[4]] === 'Gender-Neutral' ? 'Gender-neutral' : raw.gen[r[4]],
              o1 < 0 ? '-' : fmt.format(o1),
              c1 < 0 ? '-' : fmt.format(c1),
              oF < 0 ? '-' : fmt.format(oF),
              cF < 0 ? '-' : fmt.format(cF)
            ]);
          }
        }

        var title = cfg.shortName + ' ' + year + ' Opening & Closing Ranks';
        var subtitle = 'Exported ' + dataRows.length + ' of ' + total + ' seats · Source: database.famral.com';
        var blob = buildPdfBlob(title, subtitle, headers, dataRows);
        triggerDownload(blob, counselling + '-' + year + '-cutoffs.pdf');
      })
      .catch(function (err) {
        console.error(err);
        alert('Could not generate PDF. Please open the table page to export.');
      })
      .finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = origText;
        }
      });
  }

  function bindCardPdfButtons() {
    var btns = document.querySelectorAll('button[data-pdf-counselling][data-pdf-year]');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          downloadDatasetPdf(btn.getAttribute('data-pdf-counselling'), Number(btn.getAttribute('data-pdf-year')), btn);
        });
      })(btns[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindCardPdfButtons);
  } else {
    bindCardPdfButtons();
  }

  global.FAMRAL_PDF = {
    buildPdfBlob: buildPdfBlob,
    downloadDatasetPdf: downloadDatasetPdf
  };
})(window);
