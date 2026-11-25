(function () {
  'use strict';

  var headerEl = document.getElementById('site-header');
  var footerEl = document.getElementById('site-footer');

  if (headerEl) {
    var active = headerEl.getAttribute('data-active') || '';
    var narrow = headerEl.getAttribute('data-narrow') === '1';
    var barClass = narrow ? 'bar narrow' : 'bar';

    var links = [
      { href: '/josaa/', label: 'JoSAA', key: 'josaa' },
      { href: '/csab/', label: 'CSAB', key: 'csab' },
      { href: 'https://www.famral.com/', label: 'famral.com', key: 'famral' }
    ];

    var navHtml = links.map(function (l) {
      var cur = active === l.key ? ' aria-current="page"' : '';
      return '<a href="' + l.href + '"' + cur + '>' + l.label + '</a>';
    }).join('');

    headerEl.className = 'top';
    headerEl.innerHTML =
      '<div class="' + barClass + '">' +
        '<a class="brand" href="/">Famral <span>Database</span></a>' +
        '<button class="nav-toggle" id="nav-toggle" type="button" aria-label="Toggle navigation" aria-expanded="false" aria-controls="site-nav">' +
          '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
        '</button>' +
        '<nav id="site-nav" aria-label="Primary navigation">' + navHtml + '</nav>' +
      '</div>';

    var toggle = document.getElementById('nav-toggle');
    var nav = document.getElementById('site-nav');
    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        var open = !nav.classList.contains('open');
        nav.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', String(open));
      });
    }
  }

  if (footerEl) {
    var fNarrow = footerEl.getAttribute('data-narrow') === '1';
    var counselling = footerEl.getAttribute('data-counselling') || '';
    var footClass = fNarrow ? 'foot narrow' : 'foot';

    var leftText = 'Data is compiled from official JoSAA and CSAB releases. Verify on official portals before making admission decisions.';
    if (counselling === 'josaa') {
      leftText = 'Data is compiled from official JoSAA releases. Verify on <a href="https://josaa.nic.in/" target="_blank" rel="noopener noreferrer">Joint Seat Allocation Authority (JoSAA)</a> before making admission decisions.';
    } else if (counselling === 'csab') {
      leftText = 'Data is compiled from official CSAB releases. Verify on <a href="https://csab.nic.in/" target="_blank" rel="noopener noreferrer">Central Seat Allocation Board (CSAB)</a> before making admission decisions.';
    }

    footerEl.innerHTML =
      '<div class="' + footClass + '">' +
        '<span>' + leftText + '</span>' +
        '<span><a href="/">All Datasets</a> · <a href="/josaa/cutoff/">JoSAA</a> · <a href="/csab/cutoff/">CSAB</a></span>' +
      '</div>';
  }
})();
