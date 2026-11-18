// PREMINT's page. It reads window.RADAR (data.js, written beside dashboard/ by main.ts from the
// same rows board.json carries) and renders the ranked board over the snapshot's whole clean
// pre-token universe, its filters (search, category, chain, size, watchlist, farm verdict), a
// per-protocol detail drawer with the model's own arithmetic, its leave-one-out value range and
// its netted farm verdict, a live-token view, the calibration table the multiples came from, and
// the blind-test validation the model was put through. Every chart on the page — the refit range
// tracks, the growth bars, the verdict distribution, the validation bars — is drawn from that
// data at render time. No network: every byte shown is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', verdict: 'all', watch: false, minTvl: 0, tab: 'board', sort: 'rank', dir: 1, selected: null };
  var LIKE = { High: 4, Elevated: 3, Moderate: 2, Speculative: 1 };
  var V = DATA.validation;

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
  function fmtShare(pct) {
    if (pct >= 0.01) return pct.toPrecision(2) + '%';
    return pct.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') + '%';
  }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  // Log-scale position of a value inside the board's own implied-value span: the range tracks
  // and TVL bars are drawn on this scale so a $965M row and a $40K row share one axis honestly.
  var vMin = Infinity, vMax = 0, tMax = 0;
  DATA.rows.forEach(function (r) {
    if (r.implied_value_low_usd < vMin) vMin = r.implied_value_low_usd;
    if (r.implied_value_high_usd > vMax) vMax = r.implied_value_high_usd;
    if (r.tvl_usd > tMax) tMax = r.tvl_usd;
  });
  var logSpan = Math.log(vMax) - Math.log(Math.max(1, vMin));
  function logPos(v) { return clamp01((Math.log(Math.max(1, v)) - Math.log(Math.max(1, vMin))) / (logSpan || 1)); }

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
    if (p.get('verdict')) state.verdict = p.get('verdict');
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
    if (state.verdict !== 'all') p.set('verdict', state.verdict);
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
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
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
      else if (key === 'verdict') { av = a.breakeven_pct; bv = b.breakeven_pct; }
      else if (key === 'like') { av = LIKE[a.likelihood] || 0; bv = LIKE[b.likelihood] || 0; }
      else { av = a.rank; bv = b.rank; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.rank - b.rank;
    });
  }

  function header() {
    function meta(label, value, acc) {
      return el('div', null, el('span', { class: 'lab', text: label }), el('b', { class: acc ? 'acc' : '', text: value }));
    }
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark', 'aria-hidden': 'true' }),
        el('div', null,
          el('div', { class: 'brand-name', text: 'PREMINT' }),
          el('div', { class: 'brand-sub', text: 'Pre-token valuation terminal' }))),
      el('div', { class: 'top-meta' },
        meta('Snapshot', DATA.as_of),
        meta('Model', DATA.model_version),
        meta('Pre-token ranked', String(DATA.board_size), true),
        meta('Live comps', String(DATA.live_size))));
  }

  function tapeRow(label, model, flat, lowerWins) {
    var mw = lowerWins ? model <= flat : model >= flat;
    return el('tr', null,
      el('td', { text: label }),
      el('td', { class: 'num model', text: model }),
      el('td', { class: 'num', text: flat }),
      el('td', { class: mw ? 'win' : 'lose', text: mw ? 'model' : 'flat' }));
  }
  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Every protocol with no token yet, priced by the tokens that already trade' }),
        el('p', null,
          'PREMINT ranks the snapshot\u2019s whole clean pre-token universe: every protocol that records no token and passes the watchlist rule\u2019s own exclusions \u2014 no wrapped, staked or bridged products, no exchange reserve pages, no versioned deployments \u2014 at ',
          el('b', { text: 'any size' }),
          ', not just above the $50M floor. All ', el('b', { text: String(DATA.watchlist_size) + ' watchlist protocols' }),
          ' are ranked, and so are the large clean protocols a floor-only board leaves out. Protocols whose token already trades are never ranked: they are set aside as the comparable set the model is fitted on \u2014 and blind-tested on, right. Each price is ',
          el('b', { text: 'TVL x the category\u2019s calibrated market-cap multiple' }),
          ', adjusted for this week\u2019s growth and for how long the protocol has run with no token; the track under each value is the refit range its category\u2019s evidence supports. Implied value is a model\u2019s claim, never a promise.')),
      el('div', { class: 'tape', role: 'group', 'aria-label': 'Blind-test validation summary' },
        el('div', { class: 'tape-head' },
          el('span', { class: 'lab', text: 'Blind test' }),
          el('span', { text: 'fitted ' + V.train + ' / tested ' + V.test + ' of ' + V.comps + ' live comps' })),
        el('table', null,
          el('thead', null, el('tr', null,
            el('th', { text: 'Measure' }), el('th', { text: 'Model' }), el('th', { text: 'Flat' }), el('th', { text: 'Edge' }))),
          el('tbody', null,
            tapeRow('Median error', fmtX(V.model_median_factor), fmtX(V.flat_median_factor), true),
            tapeRow('Within 2x of actual', V.model_within_2x_pct + '%', V.flat_within_2x_pct + '%', false),
            tapeRow('Walk-forward error', fmtX(V.walk_forward_median_factor), fmtX(V.walk_forward_flat_median_factor), true))),
        el('p', { class: 'tape-note', text: 'Walk-forward fits on smaller protocols and predicts larger ones (' + V.walk_forward_n + ' predictions): there the flat multiple wins, and the board says so. Full method below.' })));
  }

  function strip() {
    var top = DATA.rows[0];
    var vc = DATA.verdict_counts;
    var total = vc.FARM + vc.THIN + vc.SKIP;
    function kpi(label, value, sub, acc) {
      return el('div', { class: 'kpi' },
        el('span', { class: 'lab', text: label }),
        el('b', { class: acc ? 'acc' : '', text: value }),
        el('small', { text: sub }));
    }
    function seg(cls, n) { return el('i', { class: cls, style: 'width:' + (total ? (n / total) * 100 : 0) + '%' }); }
    function leg(cls, name, n) {
      return el('span', null, el('span', { class: 'sw ' + cls, 'aria-hidden': 'true' }), name + ' ', el('b', { text: String(n) }), ' \u00b7 ' + (total ? Math.round((n / total) * 100) : 0) + '%');
    }
    return el('div', null,
      el('div', { class: 'strip' },
        kpi('Universe ranked', String(DATA.board_size), 'clean pre-token protocols'),
        kpi('Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size, 'house floor, all ranked'),
        kpi('Top implied value', top ? fmtUsd(top.implied_value_usd) : 'n/a', top ? top.name : '', true),
        kpi('Blind-test error', fmtX(V.model_median_factor), 'flat multiple ' + fmtX(V.flat_median_factor)),
        kpi('Walk-forward error', fmtX(V.walk_forward_median_factor), 'flat ' + fmtX(V.walk_forward_flat_median_factor) + ' wins there'),
        kpi('Global multiple', fmtX(DATA.global.median_ratio), DATA.global.tokenized_count + ' live tokens fitted')),
      el('div', { class: 'dist', 'aria-label': 'Farm verdict distribution' },
        el('span', { class: 'lab', text: 'Verdict distribution \u2014 plan cost netted against implied value' }),
        el('div', { class: 'dist-bar', 'aria-hidden': 'true' }, seg('d-farm', vc.FARM), seg('d-thin', vc.THIN), seg('d-skip', vc.SKIP)),
        el('div', { class: 'dist-legend' }, leg('sw-farm', 'FARM', vc.FARM), leg('sw-thin', 'THIN', vc.THIN), leg('sw-skip', 'SKIP', vc.SKIP))));
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
    var vc = DATA.verdict_counts;
    var shown = state.tab === 'board' ? filtered().length : DATA.live.length;
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      select('category', 'Category', [['all', 'All categories']].concat(cats.map(function (c) { return [c, c]; })), state.category, function (v) { state.category = v; }),
      select('chain', 'Chain', [['all', 'All chains']].concat(chains.map(function (c) { return [c, c + ' (' + chainCount[c] + ')']; })), state.chain, function (v) { state.chain = v; }),
      select('verdict', 'Farm verdict', [['all', 'All verdicts'], ['FARM', 'FARM (' + vc.FARM + ')'], ['THIN', 'THIN (' + vc.THIN + ')'], ['SKIP', 'SKIP (' + vc.SKIP + ')']], state.verdict, function (v) { state.verdict = v; }),
      select('mintvl', 'Min TVL', [['0', 'Any size'], ['50000000', '$50M+'], ['100000000', '$100M+'], ['250000000', '$250M+'], ['1000000000', '$1B+']], String(state.minTvl), function (v) { state.minTvl = Number(v) || 0; }),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'House floor' }), watchBtn),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'View' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count' }, el('b', { text: String(shown) }), state.tab === 'board' ? ' of ' + DATA.board_size + ' rows' : ' live shown'));
  }

  function sortHeader(key, label, align) {
    var active = state.sort === key;
    return el('th', { scope: 'col', class: align === 'right' ? 'r' : '' },
      el('button', { type: 'button', onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'rank' || key === 'name' || key === 'verdict' ? 1 : -1; }
        render();
      } }, label, active ? el('span', { class: 'dir', 'aria-hidden': 'true', text: state.dir > 0 ? ' \u2191' : ' \u2193' }) : null));
  }

  function rangeTrack(r, cls) {
    var lo = logPos(r.implied_value_low_usd), hi = logPos(r.implied_value_high_usd), pt = logPos(r.implied_value_usd);
    return el('div', { class: cls, 'aria-hidden': 'true' },
      el('i', { style: 'left:' + (lo * 100).toFixed(1) + '%;width:' + Math.max(1.5, (hi - lo) * 100).toFixed(1) + '%' }),
      el('u', { style: 'left:calc(' + (pt * 100).toFixed(1) + '% - 1px)' }));
  }
  function growthCell(r) {
    var g = r.change_7d;
    var bar = null;
    if (g !== null && g !== undefined && isFinite(g)) {
      var w, left;
      if (g >= 0) { w = clamp01(g / 150) * 50; left = 50; }
      else { w = clamp01(-g / 60) * 50; left = 50 - w; }
      bar = el('div', { class: 'gbar', 'aria-hidden': 'true' },
        el('span', { class: 'zero' }),
        el('i', { class: g >= 0 ? '' : 'down', style: 'left:' + left + '%;width:' + Math.max(1.5, w) + '%' }));
    }
    return el('td', { class: 'r' }, el('div', { class: 'gcell' },
      el('span', { class: 'num ' + (g === null ? '' : g >= 0 ? 'pos' : 'neg'), text: fmtPct(g) }), bar));
  }
  function meter(tier) {
    var n = LIKE[tier] || 0;
    var bars = [];
    for (var i = 0; i < 4; i++) bars.push(el('i', { class: i < n ? 'on' : '' }));
    return el('span', { class: 'meter-wrap' },
      el('span', { class: 'meter', 'aria-hidden': 'true' }, bars),
      el('span', { text: tier }));
  }

  function boardTable() {
    var list = sorted(filtered());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Loosen the search, the verdict, the minimum TVL or the watchlist toggle to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear all filters', onclick: function () {
          state.q = ''; state.category = 'all'; state.chain = 'all'; state.verdict = 'all'; state.watch = false; state.minTvl = 0; writeHash(); render();
        } })));
    }
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
        el('td', { class: 'rank' + (r.rank <= 3 ? ' top' : ''), text: String(r.rank).padStart(3, '0') }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'slug', text: r.slug }),
          r.watchlist ? el('span', null, el('span', { class: 'chip watch', text: 'watchlist' })) : null)),
        el('td', { text: r.category || 'Uncategorized' }),
        el('td', { class: 'sub', text: chainText }),
        el('td', { class: 'r' }, el('div', { class: 'tvlcell' },
          el('span', { class: 'num', text: fmtUsd(r.tvl_usd) }),
          el('div', { class: 'tbar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round((Math.log(Math.max(1, r.tvl_usd)) / Math.log(Math.max(2, tMax))) * 100)) + '%' })))),
        growthCell(r),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'r' }, el('div', { class: 'valcell' },
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
          rangeTrack(r, 'rtrack'),
          el('span', { class: 'range-txt', text: fmtUsd(r.implied_value_low_usd) + ' \u2013 ' + fmtUsd(r.implied_value_high_usd) }))),
        el('td', null, meter(r.likelihood)),
        el('td', null, el('div', { class: 'vcell' },
          el('span', { class: 'chip ' + r.verdict.toLowerCase(), text: r.verdict }),
          el('span', { class: 'vsub', text: '$' + r.farm_cost_usd.toFixed(2) + ' \u00b7 ' + r.farm_weeks + 'wk \u00b7 be ' + fmtShare(r.breakeven_pct) }))));
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', { class: 'board' },
          el('caption', { text: 'Ranked by implied value; the track under each value is its leave-one-out refit range on the board\u2019s log scale, the amber tick its point value. Select any row for its model breakdown, verdict and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'), sortHeader('name', 'Protocol'), el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', text: 'Chains' }), sortHeader('tvl', 'TVL', 'right'), sortHeader('growth', '7d', 'right'),
            sortHeader('age', 'Age', 'right'), sortHeader('implied', 'Implied value', 'right'), sortHeader('like', 'Likelihood'), sortHeader('verdict', 'Verdict'))),
          tbody)));
  }

  function liveTable() {
    var maxRatio = 0;
    DATA.live.forEach(function (r) { if (r.tvl_usd > 0 && r.mcap_usd / r.tvl_usd > maxRatio) maxRatio = r.mcap_usd / r.tvl_usd; });
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      var ratio = r.tvl_usd > 0 ? r.mcap_usd / r.tvl_usd : null;
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'slug', text: r.slug }))),
        el('td', { text: r.category || 'Uncategorized' }),
        el('td', { class: 'num r', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num r', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'r' }, el('div', { class: 'gcell' },
          el('span', { class: 'num', text: ratio === null ? 'n/a' : fmtX(ratio) }),
          ratio === null ? null : el('div', { class: 'tbar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round((ratio / (maxRatio || 1)) * 100)) + '%;background:var(--acc-dim)' })))),
        el('td', { class: 'num r ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) })));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', { class: 'board' },
          el('caption', { text: 'Already live: these tokens trade, so their market cap is a fact. They are kept off the board \u2014 and they are the calibration and validation set: each category\u2019s multiple is the median of ratios like these, fitted on one half and blind-tested on the other.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', class: 'r', text: 'TVL' }), el('th', { scope: 'col', class: 'r', text: 'Market cap' }),
            el('th', { scope: 'col', class: 'r', text: 'Mcap / TVL' }), el('th', { scope: 'col', class: 'r', text: '7d' }))),
          tbody)));
  }

  function vizPair(label, modelVal, flatVal, modelTxt, flatTxt, note) {
    var max = Math.max(modelVal, flatVal) || 1;
    function row(who, val, txt, isModel) {
      return el('div', { class: 'viz-row' },
        el('span', { class: 'who', text: who }),
        el('div', { class: 'vtrack' + (isModel ? ' model' : ''), 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, (val / max) * 100).toFixed(1) + '%' })),
        el('span', { class: 'val', text: txt }));
    }
    return el('div', { class: 'viz' },
      el('h3', { text: label }),
      row('Model', modelVal, modelTxt, true),
      row('Flat multiple', flatVal, flatTxt, false),
      note ? el('p', { class: 'viz-cap', text: note }) : null);
  }

  function modelPanel() {
    var g = DATA.global;
    var vc = DATA.verdict_counts;
    var maxMult = 0;
    DATA.calibration.forEach(function (c) { if (c.multiple > maxMult) maxMult = c.multiple; });
    var rows = DATA.calibration.map(function (c) {
      return el('tr', null,
        el('td', { class: 'cat', text: c.category || 'Uncategorized' }),
        el('td', { class: 'num r', text: String(c.tokenized_count) }),
        el('td', { class: 'num r', text: fmtX(c.median_ratio) }),
        el('td', { class: 'r' },
          el('span', { class: 'cbar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, (c.multiple / (maxMult || 1)) * 100).toFixed(1) + '%' })),
          ' ', el('span', { class: 'num', text: fmtX(c.multiple) })));
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How PREMINT prices a token that does not exist yet' }),
      el('div', { class: 'model-grid' },
        el('div', null,
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
          el('p', null,
            el('b', { text: 'Tested blind, not just fitted. ' }),
            'The multiples were fitted on ', el('b', { text: String(V.train) + ' of the snapshot\u2019s ' + String(V.comps) + ' live tokens' }),
            ' and used to predict the other ', el('b', { text: String(V.test) }), ' sight unseen (the halves are dealt alternately by TVL, so both span every size). Median error: ',
            el('b', { text: fmtX(V.model_median_factor) }), ' for the full model against ', el('b', { text: fmtX(V.flat_median_factor) }),
            ' for one flat global multiple \u2014 the category multiples and factors earn their place. Within a factor of two: ',
            el('b', { text: V.model_within_2x_pct + '%' }), ' against ', el('b', { text: V.flat_within_2x_pct + '%' }),
            '. Walked forward across TVL bands (fitted on smaller protocols only, predicting larger ones, ',
            el('b', { text: String(V.walk_forward_n) + ' predictions' }), '), the median error is ', el('b', { text: fmtX(V.walk_forward_median_factor) }),
            ' against ', el('b', { text: fmtX(V.walk_forward_flat_median_factor) }), ' flat \u2014 the flat baseline wins that test: extrapolating upward in size is where the category edge thins, and the board says so rather than hiding it. Every figure in this paragraph is computed from the snapshot at run time.'),
          el('p', null,
            el('b', { text: 'Ranges, not just points. ' }),
            'Each row\u2019s track is its value range: the implied value re-priced at the low and high of its category multiple\u2019s leave-one-out refits \u2014 the multiple refitted once per live token of the category, each time leaving that token out. Thin evidence spreads wide; deep categories hold tight.'),
          el('p', null,
            el('b', { text: 'Farm verdicts. ' }),
            'Every plan is netted before it is shown: its gas, spread and idle-capital cost over its weeks, against the row\u2019s implied value. FARM when the cost breaks even at ',
            el('b', { text: '0.001%' }), ' of the implied value or less, THIN up to ', el('b', { text: '0.005%' }),
            ', SKIP above that. On this board: ', el('b', { text: vc.FARM + ' FARM, ' + vc.THIN + ' THIN, ' + vc.SKIP + ' SKIP' }),
            '. The working capital itself is never counted as a cost \u2014 the farmer keeps it.')),
        el('div', null,
          vizPair('Blind test \u2014 median error (lower wins)', V.model_median_factor, V.flat_median_factor, fmtX(V.model_median_factor), fmtX(V.flat_median_factor),
            'Fitted on ' + V.train + ' live tokens, tested on ' + V.test + ' never seen in fitting.'),
          el('div', { style: 'height:14px' }),
          vizPair('Blind test \u2014 within 2x of actual (higher wins)', V.model_within_2x_pct, V.flat_within_2x_pct, V.model_within_2x_pct + '%', V.flat_within_2x_pct + '%', null),
          el('div', { style: 'height:14px' }),
          vizPair('Walk-forward \u2014 median error (lower wins)', V.walk_forward_median_factor, V.walk_forward_flat_median_factor, fmtX(V.walk_forward_median_factor), fmtX(V.walk_forward_flat_median_factor),
            V.walk_forward_n + ' predictions, fitted on smaller protocols only. The flat multiple wins this one \u2014 reported, not buried.'),
          el('div', { style: 'height:20px' }),
          el('h3', { text: 'Calibration \u2014 the fitted multiples' }),
          el('div', { style: 'height:8px' }),
          el('div', { class: 'calib-wrap' },
            el('table', { class: 'calib' },
              el('thead', null, el('tr', null,
                el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', class: 'r', text: 'Live' }),
                el('th', { scope: 'col', class: 'r', text: 'Median mcap/TVL' }), el('th', { scope: 'col', class: 'r', text: 'Multiple used' }))),
              el('tbody', null, rows))))));
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); render(); });

  function factorBar(label, value, cap) {
    return el('div', { class: 'fbar-row' },
      el('span', { class: 'who', text: label }),
      el('div', { class: 'vtrack model', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, clamp01(value / cap) * 100).toFixed(1) + '%' })),
      el('span', { class: 'val', text: fmtX(value) }));
  }

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'kicker', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' \u00b7 watchlist' : '') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Uncategorized') + ' \u00b7 ' + row.slug + ' \u00b7 records no token in this snapshot' })),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value, step by step' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL (snapshot)' }), el('b', { text: fmtFull(row.tvl_usd) })),
        el('div', null, el('span', { text: 'x category multiple (' + (row.category || 'global') + ')' }), el('b', { text: fmtX(row.category_multiple) })),
        el('div', null, el('span', { text: 'x growth factor (7d ' + fmtPct(row.change_7d) + ')' }), el('b', { text: fmtX(row.growth_factor) })),
        el('div', null, el('span', { text: 'x age factor (' + fmtAge(row.age_days) + ' with no token)' }), el('b', { text: fmtX(row.age_factor) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { text: fmtFull(row.implied_value_usd) }))),
      el('div', { class: 'viz' },
        factorBar('Multiple / x3.00 cap', row.category_multiple, 3),
        factorBar('Growth / x1.60 cap', row.growth_factor, 1.6),
        factorBar('Age / x1.25 cap', row.age_factor, 1.25)),
      el('h3', { text: 'Refit range \u2014 leave-one-out' }),
      rangeTrack(row, 'dtrack'),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Low refit' }), el('b', { text: fmtFull(row.implied_value_low_usd) })),
        el('div', null, el('span', { text: 'High refit' }), el('b', { text: fmtFull(row.implied_value_high_usd) }))),
      el('p', { class: 'note', text: 'The same figures board.json carries for this row; the multiple is calibrated from live tokens of the same category in the snapshot, not chosen for this protocol. The range is that multiple\u2019s leave-one-out refit spread, re-priced on the board\u2019s log scale. An estimate, not a price.' })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm verdict' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Plan cost (gas, spread, idle capital)' }), el('b', { text: '$' + row.farm_cost_usd.toFixed(2) })),
        el('div', null, el('span', { text: 'Plan length' }), el('b', { text: 'about ' + row.farm_weeks + ' weeks' })),
        el('div', null, el('span', { text: 'Break-even share of implied value' }), el('b', { text: fmtShare(row.breakeven_pct) })),
        el('div', { class: 'total' }, el('span', { text: 'Verdict' }), el('span', { class: 'chip ' + row.verdict.toLowerCase(), text: row.verdict }))),
      el('p', { class: 'note', text: 'FARM at a break-even share of 0.001% or less, THIN up to 0.005%, SKIP above. The plan\u2019s working capital is not counted as a cost: the farmer keeps it.' })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'The record' }),
      el('div', { class: 'meta' },
        el('div', null, el('span', { text: 'First tracked' }), row.listed_at || 'not reported'),
        el('div', null, el('span', { text: 'Days with no token' }), row.age_days === null ? 'unknown' : String(row.age_days)),
        el('div', null, el('span', { text: 'Chains' }), (row.chains || []).join(', ') || 'none named'),
        el('div', null, el('span', { text: 'Likelihood' }), row.likelihood),
        el('div', null, el('span', { text: '7-day TVL change' }), fmtPct(row.change_7d)),
        el('div', null, el('span', { text: 'Watchlist (house floor)' }), row.watchlist ? 'yes \u2014 $' + Math.round(DATA.floor_usd / 1e6) + 'M+ and no token' : 'no \u2014 below the floor or filtered by the house rule'))));
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
    shell.appendChild(strip());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'board' ? boardTable() : liveTable());
    if (state.tab === 'board') shell.appendChild(modelPanel());
    shell.appendChild(el('footer', { class: 'foot' },
      el('span', { text: 'PREMINT \u00b7 pre-token valuation terminal' }),
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
