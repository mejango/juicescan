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
// time's dollar value, so it only rises. Balance is the indexer's flow-accrued dollar balance: every inflow and
// outflow at its own time's rate, so payouts and cash outs pull it down. It is not holdings at today's price, and
// price moves between an inflow and its outflow can push the sum below zero; a balance is never negative, so it
// floors at 0.
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
    points.push({ timestamp: Math.floor(end), valueUsd: Math.max(0, lastBase + added) });
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

function pointLabel(point) {
  return usd(point.valueUsd) + ', ' + new Date(point.timestamp * 1000).toLocaleString();
}

// Bars plus a text readout of the inspected bar. Pointer hover, or focus and the arrow keys, pick the bar, so the
// amounts and dates are reachable without a mouse and are announced.
function barsChart(points, label) {
  var NS = 'http://www.w3.org/2000/svg';
  var W = 450, H = 120, gap = 2, width = W / points.length - gap;
  var max = points.reduce(function (m, p) { return Math.max(m, p.valueUsd); }, 0) || 1;
  var wrap = document.createElement('div');
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label + ' Focus and use arrow keys to inspect values.');
  svg.setAttribute('tabindex', '0');
  svg.setAttribute('class', 'funding-chart-svg');
  var readout = document.createElement('div');
  readout.className = 'funding-chart-readout';
  readout.setAttribute('aria-live', 'polite');
  var rects = points.map(function (point, i) {
    var height = Math.max(1, (point.valueUsd / max) * (H - 4));
    var rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(i * (width + gap)));
    rect.setAttribute('y', String(H - height));
    rect.setAttribute('width', String(width));
    rect.setAttribute('height', String(height));
    rect.addEventListener('pointerenter', function () { inspect(i); });
    svg.appendChild(rect);
    return rect;
  });
  var current = points.length - 1;
  function inspect(i) {
    rects[current].removeAttribute('class');
    current = Math.max(0, Math.min(points.length - 1, i));
    rects[current].setAttribute('class', 'is-inspected');
    readout.textContent = pointLabel(points[current]);
  }
  svg.addEventListener('keydown', function (event) {
    var step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (event.key === 'Home') inspect(0);
    else if (event.key === 'End') inspect(points.length - 1);
    else if (step) inspect(current + step);
    else return;
    event.preventDefault();
  });
  inspect(current);
  wrap.appendChild(svg); wrap.appendChild(readout);
  return wrap;
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
    body.appendChild(barsChart(points, METRICS.filter(function (m) { return m[0] === metric; })[0][2]));
  }
  metricSelect.addEventListener('change', function () { metric = metricSelect.value; draw(); });
  rangeSelect.addEventListener('change', function () { range = Number(rangeSelect.value); draw(); });

  Promise.resolve().then(load).then(function (loaded) { data = loaded; draw(); }, function () {});
  return card;
}
