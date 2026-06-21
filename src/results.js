// src/results.js
// Renders read/simulate return values with smart annotations

import { truncAddr } from './component-base.js';

export function renderResult(outputs, rawResult) {
  var container = document.createElement('div');
  container.className = 'result-box';

  // Normalize: single return → wrap in array, multi → already array
  var values = outputs.length === 1 ? [rawResult] : (Array.isArray(rawResult) ? rawResult : [rawResult]);

  for (var i = 0; i < outputs.length; i++) {
    var output = outputs[i];
    var value = values[i];
    var row = renderResultValue(output.name || '[' + i + ']', output.type, output.components, value);
    container.appendChild(row);
  }
  return container;
}

function renderResultValue(name, type, components, value) {
  var row = document.createElement('div');
  row.className = 'result-row';

  if (type === 'tuple' && components) {
    // Struct — render hierarchically
    var label = document.createElement('div');
    label.className = 'result-label';
    label.textContent = name + ':';
    row.appendChild(label);
    var nested = document.createElement('div');
    nested.className = 'result-nested';
    for (var i = 0; i < components.length; i++) {
      var comp = components[i];
      var val = Array.isArray(value) ? value[i] : value[comp.name];
      nested.appendChild(renderResultValue(comp.name || '[' + i + ']', comp.type, comp.components, val));
    }
    row.appendChild(nested);
    return row;
  }

  if (type.endsWith('[]')) {
    var arrLabel = document.createElement('div');
    arrLabel.className = 'result-label';
    arrLabel.textContent = name + ': (' + (value ? value.length : 0) + ' items)';
    row.appendChild(arrLabel);
    var arrNested = document.createElement('div');
    arrNested.className = 'result-nested';
    var elementType = type.replace(/\[\]$/, '');
    if (value) {
      for (var j = 0; j < value.length; j++) {
        arrNested.appendChild(renderResultValue('[' + j + ']', elementType, components, value[j]));
      }
    }
    row.appendChild(arrNested);
    return row;
  }

  // Primitive
  var primLabel = document.createElement('span');
  primLabel.className = 'result-label';
  primLabel.textContent = name + ': ';

  var primVal = document.createElement('span');
  primVal.className = 'result-value';
  primVal.textContent = formatValue(value);

  row.appendChild(primLabel);
  row.appendChild(primVal);

  // Annotations
  var annotation = annotate(name, type, value);
  if (annotation) {
    var ann = document.createElement('span');
    ann.className = 'result-annotation';
    ann.textContent = ' (' + annotation + ')';
    row.appendChild(ann);
  }

  // Copy on click for addresses and hashes
  if (type === 'address' || (typeof value === 'string' && value.startsWith('0x') && value.length === 66)) {
    primVal.className += ' copyable';
    primVal.title = 'Click to copy';
    primVal.addEventListener('click', function() {
      navigator.clipboard.writeText(String(value));
      primVal.classList.add('copied');
      setTimeout(function() { primVal.classList.remove('copied'); }, 1000);
    });
  }

  return row;
}

function formatValue(value) {
  if (typeof value === 'bigint') return value.toLocaleString();
  if (typeof value === 'string' && value.startsWith('0x') && value.length === 42) {
    return truncAddr(value);
  }
  return String(value);
}

function annotate(name, type, value) {
  if (typeof value !== 'bigint') return null;
  var n = name.toLowerCase();

  // Timestamps (> year 2000 in seconds)
  if ((n.includes('start') || n.includes('time') || n.includes('date') || n === 'id' || n === 'rulesetid') && value > 946684800n && value < 4102444800n) {
    return new Date(Number(value) * 1000).toISOString().split('T')[0];
  }
  // Duration in seconds
  if (n.includes('duration') && value > 0n) {
    var days = Number(value) / 86400;
    if (days >= 1) return days.toFixed(1) + ' days';
    var hours = Number(value) / 3600;
    return hours.toFixed(1) + ' hours';
  }
  // Basis points (max 10000)
  if ((n.includes('percent') || n.includes('rate')) && value <= 10000n) {
    return (Number(value) / 100).toFixed(2) + '%';
  }
  // Weight cut percent (max 1,000,000,000 = 9 decimals)
  if (n.includes('weightcut') && value <= 1000000000n) {
    return (Number(value) / 10000000).toFixed(2) + '%';
  }
  return null;
}
