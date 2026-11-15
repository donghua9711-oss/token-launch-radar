// Launch Radar's page. It reads window.RADAR (data.js, written beside dashboard/ by main.ts from
// the same rows board.json carries) and renders the ranked board, its filters, a per-protocol
// detail drawer with the model's own arithmetic and the row's farm plan, a live-token view, and
// the calibration table the multiples came from. No network: every byte shown is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watch: false, minTvl: 0, tab: 'board', sort: 'rank', dir: 1, selected: null };
  var LIKE = { High: 4, Elevated: 3, Moderate: 2, Speculative: 1 };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtFull(n) {
    return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtX(n) { return 'x' + Number(n).toFixed(2); }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined || child === false) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string' || typeof child === 'number') node.appendChild(document.createTextNode(String(child)));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var p = new URLSearchParams(hash);
    if (p.get('q')) state.q = p.get('q');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('watchlist') === '1') state.watch = true;
    if (p.get('min')) state.minTvl = Number(p.get('min')) || 0;
    if (p.get('tab') === 'live') state.tab = 'live';
    if (p.get('p')) state.selected = p.get('p');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.watch) p.set('watchlist', '1');
    if (state.minTvl) p.set('min', String(state.minTvl));
    if (state.tab === 'live') p.set('tab', 'live');
    if (state.selected) p.set('p', state.selected);
    var next = p.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname + window.location.search);
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorized') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sorted(list) {
    var key = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else if (key === 'like') { av = LIKE[a.likelihood] || 0; bv = LIKE[b.likelihood] || 0; }
      else { av = a.rank; bv = b.rank; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.rank - b.rank;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'scope', 'aria-hidden': 'true' }),
        el('span', { class: 'brand-name' }, 'Launch ', el('b', { text: 'Radar' }))),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version })),
        el('span', null, el('b', { text: String(DATA.board_size) }), ' pre-token ranked'),
        el('span', null, el('b', { text: String(DATA.live_size) }), ' already live')));
  }

  function lede() {
    var top = DATA.rows[0];
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Every protocol with no token yet, ranked by what its token would be worth' }),
        el('p', null,
          'The radar prices each pre-token protocol the way the market already prices live tokens of the same kind: ',
          el('b', { text: 'TVL x the category\u2019s calibrated market-cap multiple' }),
          ', adjusted for this week\u2019s growth and for how long the protocol has run with no token. ',
          'The watchlist is the floor, not the ceiling: all ', el('b', { text: String(DATA.watchlist_size) }),
          ' watchlist protocols are ranked, joined by every rankable pre-token protocol below the floor \u2014 the early launches a radar exists to find. Exchange reserve pages, versioned pools and the wrapped or staked products the house already judged are left off: they are not tokens that do not exist yet. Implied value is a model\u2019s claim, never a promise.')),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { text: 'Watchlist covered' }), el('b', { class: 'plain', text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'stat' }, el('span', { text: 'Pre-token rows' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Top implied value' }), el('b', { text: top ? fmtUsd(top.implied_value_usd) : 'n/a' })),
        el('div', { class: 'stat' }, el('span', { text: 'Global live multiple' }), el('b', { class: 'plain', text: fmtX(DATA.global.multiple) + ' TVL' }))));
  }

  function controls() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorized'; }))).sort();
    var chainCount = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCount[c] = (chainCount[c] || 0) + 1; }); });
    var chains = Object.keys(chainCount).sort(function (a, b) { return chainCount[b] - chainCount[a] || (a < b ? -1 : 1); });
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    function select(id, label, options, value, onChange) {
      var s = el('select', { id: id, 'aria-label': label },
        options.map(function (o) { return el('option', { value: o[0], text: o[1], selected: o[0] === value ? 'selected' : null }); }));
      s.addEventListener('change', function () { onChange(s.value); writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { for: id, text: label }), s);
    }
    var watchBtn = el('button', { type: 'button', class: 'toggle', 'aria-pressed': state.watch ? 'true' : 'false',
      onclick: function () { state.watch = !state.watch; writeHash(); render(); } },
      el('span', { class: 'dot', 'aria-hidden': 'true' }), 'Watchlist only');
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'board' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'board'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live tokens', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      select('category', 'Category', [['all', 'All categories']].concat(cats.map(function (c) { return [c, c]; })), state.category, function (v) { state.category = v; }),
      select('chain', 'Chain', [['all', 'All chains']].concat(chains.map(function (c) { return [c, c + ' (' + chainCount[c] + ')']; })), state.chain, function (v) { state.chain = v; }),
      select('mintvl', 'Min TVL', [['0', 'Any size'], ['50000000', '$50M+'], ['100000000', '$100M+'], ['250000000', '$250M+'], ['1000000000', '$1B+']], String(state.minTvl), function (v) { state.minTvl = Number(v) || 0; }),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'House floor' }), watchBtn),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'View' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'board' ? filtered().length + ' of ' + DATA.board_size + ' rows' : DATA.live.length + ' live shown' }));
  }

  function sortHeader(key, label, align) {
    var active = state.sort === key;
    return el('th', { scope: 'col', class: align === 'right' ? 'r' : '' },
      el('button', { type: 'button', onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'rank' || key === 'name' ? 1 : -1; }
        render();
      } }, label, active ? el('span', { class: 'dir', 'aria-hidden': 'true', text: state.dir > 0 ? ' \u2191' : ' \u2193' }) : null));
  }

  function boardTable() {
    var list = sorted(filtered());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Loosen the search, the minimum TVL or the watchlist toggle to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear all filters', onclick: function () {
          state.q = ''; state.category = 'all'; state.chain = 'all'; state.watch = false; state.minTvl = 0; writeHash(); render();
        } })));
    }
    var max = 0;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var chainText = (r.chains || []).length ? r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') : 'unnamed chain';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        'data-watch': r.watchlist ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rank' + (r.rank <= 3 ? ' top' : ''), text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          r.watchlist ? el('span', null, el('span', { class: 'chip watch', text: 'watchlist' })) : null)),
        el('td', { text: r.category || 'Uncategorized' }),
        el('td', { class: 'sub', text: chainText }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num-cell' }, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / (max || 1)) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
        el('td', null, el('span', { class: 'chip ' + r.likelihood.toLowerCase(), text: r.likelihood })));
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols ranked by implied value. Select any row for its model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'), sortHeader('name', 'Protocol'), el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', text: 'Chains' }), sortHeader('tvl', 'TVL', 'right'), sortHeader('growth', '7d', 'right'),
            sortHeader('implied', 'Implied value', 'right'), sortHeader('like', 'Likelihood'))),
          tbody)));
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.slug }))),
        el('td', { text: r.category || 'Uncategorized' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.tvl_usd > 0 ? fmtX(r.mcap_usd / r.tvl_usd) : 'n/a' }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) })));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Already live: these tokens trade, so their market cap is a fact. They are kept off the board — and they are the calibration set: each category\u2019s multiple is the median of ratios like these.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', class: 'r', text: 'TVL' }), el('th', { scope: 'col', class: 'r', text: 'Market cap' }),
            el('th', { scope: 'col', class: 'r', text: 'Mcap / TVL' }), el('th', { scope: 'col', class: 'r', text: '7d' }))),
          tbody)));
  }

  function modelPanel() {
    var g = DATA.global;
    var rows = DATA.calibration.map(function (c) {
      return el('tr', null,
        el('td', { text: c.category || 'Uncategorized' }),
        el('td', { class: 'num', text: String(c.tokenized_count) }),
        el('td', { class: 'num', text: fmtX(c.median_ratio) }),
        el('td', { class: 'num', text: fmtX(c.multiple) }));
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How the radar prices a token that does not exist yet' }),
      el('div', { class: 'formula', text: 'implied value = TVL x category multiple x growth factor x age factor' }),
      el('p', null,
        el('b', { text: 'Category multiple. ' }),
        'For every category, the multiple is the median market-cap / TVL ratio of that category\u2019s protocols whose token already trades in this same snapshot, shrunk toward the global median (',
        el('b', { text: fmtX(g.median_ratio) }), ' across ', el('b', { text: String(g.tokenized_count) }),
        ' live tokens) so thin categories cannot dominate, and clamped between x0.05 and x3.00. A category with no live token is priced at the global multiple. Nothing is priced by hand and no name is special-cased.'),
      el('p', null,
        el('b', { text: 'Growth factor. ' }), '1 + clamp(7-day TVL change, -60%, +150%) / 250: a hot week lifts a row up to x1.60, a bad one cuts it to x0.76, an unreported change is neutral. ',
        el('b', { text: 'Age factor. ' }), '0.85 + 0.3 x log10(1 + days live / 30), capped at x1.25: time run with no token is evidence a launch, when it comes, lands on a real product. An unknown listing date is neutral. ',
        el('b', { text: 'Likelihood ' }), 'grades launch-readiness from size, age, momentum and watchlist membership; it never moves the value, only the reader\u2019s eye.'),
      el('div', { class: 'calib-wrap' },
        el('table', { class: 'calib' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', class: 'r', text: 'Live tokens' }),
            el('th', { scope: 'col', class: 'r', text: 'Median mcap/TVL' }), el('th', { scope: 'col', class: 'r', text: 'Multiple used' }))),
          el('tbody', null, rows))));
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); render(); });

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'kicker', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' - watchlist' : '') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Uncategorized') + ' - records no token in this snapshot' })),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value, step by step' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL (snapshot)' }), el('b', { text: fmtFull(row.tvl_usd) })),
        el('div', null, el('span', { text: 'x category multiple (' + (row.category || 'global') + ')' }), el('b', { text: fmtX(row.category_multiple) })),
        el('div', null, el('span', { text: 'x growth factor (7d ' + fmtPct(row.change_7d) + ')' }), el('b', { text: fmtX(row.growth_factor) })),
        el('div', null, el('span', { text: 'x age factor (' + fmtAge(row.age_days) + ' with no token)' }), el('b', { text: fmtX(row.age_factor) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { text: fmtFull(row.implied_value_usd) }))),
      el('p', { class: 'note', text: 'The same figures board.json carries for this row; the multiple is calibrated from live tokens of the same category in the snapshot, not chosen for this protocol. An estimate, not a price.' })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'The record' }),
      el('div', { class: 'meta' },
        el('div', null, el('span', { text: 'First tracked' }), row.listed_at || 'not reported'),
        el('div', null, el('span', { text: 'Days with no token' }), row.age_days === null ? 'unknown' : String(row.age_days)),
        el('div', null, el('span', { text: 'Chains' }), (row.chains || []).join(', ') || 'none named'),
        el('div', null, el('span', { text: 'Likelihood' }), row.likelihood),
        el('div', null, el('span', { text: '7-day TVL change' }), fmtPct(row.change_7d)),
        el('div', null, el('span', { text: 'Watchlist (house floor)' }), row.watchlist ? 'yes - $' + Math.round(DATA.floor_usd / 1e6) + 'M+ and no token' : 'no - below the floor or filtered by the house rule'))));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        return el('li', null, el('input', { type: 'checkbox', 'aria-label': 'Mark step done' }), el('span', { text: s }));
      })),
      el('p', { class: 'note', text: 'Costs are rough mainnet-and-L2 figures for one wallet at this protocol\u2019s size. Points are never guaranteed; a plan is a way to be a real user early, not a promise of a drop.' })));
    if (!dialog.isConnected) app.appendChild(dialog);
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }

  function render() {
    var selected = state.selected;
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'board' ? boardTable() : liveTable());
    if (state.tab === 'board') shell.appendChild(modelPanel());
    shell.appendChild(el('footer', { class: 'foot' },
      el('span', { text: 'Data: ' + DATA.source }),
      el('span', { text: 'Implied values are this board\u2019s own model output, not market prices.' })));
    app.appendChild(shell);
    app.appendChild(dialog);
    app.setAttribute('aria-busy', 'false');
    state.selected = selected;
  }

  readHash();
  render();
  if (state.selected) openDetail(state.selected);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
