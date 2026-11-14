// src/funding-chart.js
// Volume and balance history for custom projects: the Overview counterpart to the revnet price chart.
// The same series juicebox.money draws (FundingChart.tsx), ported by hand.

var BARS = 45;
var DAY = 86400;
var RANGES = [
  ['1 hour', 3600], ['6 hours', 6 * 3600], ['1 day', DAY], ['7 days', 7 * DAY], ['30 days', 30 * DAY],
  ['3 months', 91 * DAY], ['1 year', 365 * DAY], ['All', 0],
];
var METRICS = [
  ['volume', 'Volume', 'Cumulative payment volume over time, shown as bars.'],
  ['balance', 'Balance', 'Project balance over time, shown as bars.'],
];

function scaledUsd(value) {
  try { return Number(BigInt(value)) / 1e18; } catch (e) { return null; }
}

function usd(value) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Even time buckets from the first event (or the window's start) to now, forward-filling quiet stretches.
// Volume is cumulative intake: indexed payment volume plus funds added straight to the terminal, each at its own
// time's dollar value, so it only rises. Balance is what the project holds, so payouts and cash outs pull it down.
export function fundingChartPoints(moments, adds, metric, rangeSeconds, now) {
  var events = [];
  moments.forEach(function (moment) {
    var base = scaledUsd(metric === 'volume' ? moment.volumeUsd : moment.balanceUsd);
    if (base != null) events.push({ timestamp: Number(moment.timestamp), base: base });
  });
  if (metric === 'volume') {
    adds.forEach(function (add) {
      var amount = scaledUsd(add.amountUsd);
      if (amount != null) events.push({ timestamp: Number(add.timestamp), add: amount });
    });
  }
  events.sort(function (a, b) { return a.timestamp - b.timestamp; });
  if (!events.length) return [];

  var t0 = Math.max(events[0].timestamp, rangeSeconds > 0 ? now - rangeSeconds : events[0].timestamp);
  var span = Math.max(now - t0, 1);
  var points = [], index = 0, lastBase = 0, added = 0;
  function consume(limit) {
    while (index < events.length && events[index].timestamp <= limit) {
      if (events[index].base !== undefined) lastBase = events[index].base;
      if (events[index].add !== undefined) added += events[index].add;
      index++;
    }
  }
  consume(t0); // the state standing when the window opens
  for (var bar = 0; bar < BARS; bar++) {
    var end = t0 + (span * (bar + 1)) / BARS;
    consume(end);
    points.push({ timestamp: Math.floor(end), valueUsd: lastBase + added });
  }
  return points;
}

function select(options, value, label) {
  var node = document.createElement('select');
  node.className = 'funding-chart-select';
  node.setAttribute('aria-label', label);
  options.forEach(function (option) {
    var item = document.createElement('option');
    item.value = String(option[0]); item.textContent = option[1];
    node.appendChild(item);
  });
  node.value = String(value);
  return node;
}

function barsSvg(points, label) {
  var NS = 'http://www.w3.org/2000/svg';
  var W = 450, H = 120, gap = 2, width = W / points.length - gap;
  var max = points.reduce(function (m, p) { return Math.max(m, p.valueUsd); }, 0) || 1;
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.setAttribute('class', 'funding-chart-svg');
  points.forEach(function (point, i) {
    var height = Math.max(1, (point.valueUsd / max) * (H - 4));
    var rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(i * (width + gap)));
    rect.setAttribute('y', String(H - height));
    rect.setAttribute('width', String(width));
    rect.setAttribute('height', String(height));
    var title = document.createElementNS(NS, 'title');
    title.textContent = usd(point.valueUsd) + ', ' + new Date(point.timestamp * 1000).toLocaleString();
    rect.appendChild(title);
    svg.appendChild(rect);
  });
  return svg;
}

// `load()` resolves to { moments, adds }. The card stays out of the page until there is history to draw, and
// when the read fails: the chart is extra, the page's numbers do not depend on it.
export function renderFundingChart(load) {
  var card = document.createElement('div');
  card.className = 'funding-chart';
  card.style.display = 'none';
  var head = document.createElement('div'); head.className = 'funding-chart-head';
  var left = document.createElement('div');
  var total = document.createElement('div'); total.className = 'market-chart-price';
  var metric = 'volume', range = 91 * DAY, data = null;
  var metricSelect = select(METRICS, metric, 'Choose which history to show');
  var rangeSelect = select(RANGES.map(function (r) { return [r[1], r[0]]; }), range, 'Chart range');
  left.appendChild(total); left.appendChild(metricSelect);
  head.appendChild(left); head.appendChild(rangeSelect);
  var body = document.createElement('div'); body.className = 'funding-chart-body';
  card.appendChild(head); card.appendChild(body);

  function draw() {
    if (!data) return;
    var points = fundingChartPoints(data.moments, data.adds, metric, range, Math.floor(Date.now() / 1000));
    card.style.display = points.length ? '' : 'none';
    if (!points.length) return;
    total.textContent = usd(points[points.length - 1].valueUsd);
    body.innerHTML = '';
    body.appendChild(barsSvg(points, METRICS.filter(function (m) { return m[0] === metric; })[0][2]));
  }
  metricSelect.addEventListener('change', function () { metric = metricSelect.value; draw(); });
  rangeSelect.addEventListener('change', function () { range = Number(rangeSelect.value); draw(); });

  Promise.resolve().then(load).then(function (loaded) { data = loaded; draw(); }, function () {});
  return card;
}
