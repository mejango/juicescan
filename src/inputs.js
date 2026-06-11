// src/inputs.js
// Type-specific input renderers. Each returns a DOM element with .getValue() and .validate().
// Boring, explicit code — no magic. Every input type has its own renderer.

import { renderTokenSelect, isNativeToken, getTokenDecimals } from './tokens.js';
import { getAccount, connect, onWalletChange } from './wallet.js';
import { isAddress } from 'viem';

let inputIdCounter = 0;
function nextId() { return 'input-' + (++inputIdCounter); }

// Convert a decimal string (e.g. "1.5") to a fixed-point BigInt with given decimals
function toFixedPoint(value, decimals) {
  var parts = value.split('.');
  var whole = parts[0] || '0';
  var frac = (parts[1] || '').slice(0, decimals).padEnd(decimals, '0');
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(frac);
}

// Backgrounds alternate by nesting depth for visual differentiation
const DEPTH_BG = ['var(--depth-bg-0)', 'var(--depth-bg-1)'];

// --- Dispatcher ---

export function renderInput(param, context, depth) {
  if (param.type === 'tuple') return renderTupleInput(param, context, depth);
  if (param.type.endsWith('[]')) return renderArrayInput(param, context, depth);
  if (param.type.startsWith('uint') || param.type.startsWith('int')) return renderUintInput(param, context);
  if (param.type === 'address') return renderAddressInput(param, context);
  if (param.type === 'bool') return renderBoolInput(param);
  if (param.type.startsWith('bytes')) return renderBytesInput(param);
  if (param.type === 'string') return renderStringInput(param);
  return renderStringInput(param); // fallback
}

// --- Helper: create labeled group ---

function makeGroup(param, inputEl) {
  var id = nextId();
  var group = document.createElement('div');
  group.className = 'input-group';
  var label = document.createElement('label');
  label.className = 'input-label';
  label.htmlFor = id;
  label.innerHTML = param.name + ' <span class="type-hint">' + param.type + '</span>';
  inputEl.id = id;
  if (!inputEl.className || inputEl.className === '') {
    inputEl.className = 'field';
  } else if (inputEl.className.indexOf('field') === -1) {
    inputEl.className = 'field ' + inputEl.className;
  }
  group.appendChild(label);
  if (param.description) {
    var desc = document.createElement('div');
    desc.className = 'param-description';
    desc.textContent = param.description;
    group.appendChild(desc);
  }
  group.appendChild(inputEl);
  return group;
}

// --- Primitives ---

export function renderUintInput(param, context) {
  var input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '0';
  input.className = 'field numeric-field';

  // Detect fixed-point amount fields
  var isFixedPoint = /^_?(amount|value|tokenCount|cashOutCount|minReturnedTokens|minTokensPaidOut|minReclaimedTokens|minReclaimed|surplusAllowance)$/i.test(param.name);
  var group = makeGroup(param, input);

  // Fixed-point decimal helper
  var decimals = 18;
  if (isFixedPoint) {
    // Wrap the main input + decimal input in a row
    var fieldRow = document.createElement('div');
    fieldRow.className = 'field-with-decimals';
    input.parentNode.removeChild(input);
    fieldRow.appendChild(input);

    var decInput = document.createElement('input');
    decInput.type = 'text';
    decInput.className = 'field decimal-input';
    decInput.value = '18';
    decInput.addEventListener('input', function() {
      var d = parseInt(decInput.value);
      decimals = (isNaN(d) || d < 0 || d > 77) ? 18 : d;
      // Update pill selection
      decPills.querySelectorAll('.decimal-pill').forEach(function(p) {
        p.classList.toggle('selected', parseInt(p.textContent) === decimals);
      });
      updateHint();
    });
    fieldRow.appendChild(decInput);
    var decFieldLabel = document.createElement('span');
    decFieldLabel.className = 'decimal-field-label';
    decFieldLabel.textContent = 'decimals';
    fieldRow.appendChild(decFieldLabel);
    group.appendChild(fieldRow);

    // Quick-pick pills for common decimal values
    var decRow = document.createElement('div');
    decRow.className = 'decimal-helper';

    var decLabel = document.createElement('span');
    decLabel.className = 'decimal-label';
    decLabel.textContent = 'decimals';

    var decPills = document.createElement('span');
    decPills.className = 'decimal-pills';
    [18, 6, 8].forEach(function(d) {
      var pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'decimal-pill' + (d === 18 ? ' selected' : '');
      pill.textContent = d;
      pill.addEventListener('click', function() {
        decimals = d;
        decInput.value = d;
        decPills.querySelectorAll('.decimal-pill').forEach(function(p) { p.classList.remove('selected'); });
        pill.classList.add('selected');
        updateHint();
      });
      decPills.appendChild(pill);
    });

    decRow.appendChild(decLabel);
    decRow.appendChild(decPills);
    group.appendChild(decRow);

    var hint = document.createElement('div');
    hint.className = 'conversion-hint';
    group.appendChild(hint);

    function updateHint() {
      try {
        var v = input.value.trim();
        if (v && v.includes('.')) {
          var raw = toFixedPoint(v, decimals);
          hint.textContent = '→ ' + raw.toString() + ' raw';
        } else {
          hint.textContent = '';
        }
      } catch (_) { hint.textContent = ''; }
    }

    input.addEventListener('input', updateHint);
  }

  // Detect percent/rate fields and show max constant hint
  var CONST_HINTS = {
    reservedPercent:   { label: 'out of MAX_RESERVED_PERCENT (10,000)' },
    cashOutTaxRate:    { label: 'out of MAX_CASH_OUT_TAX_RATE (10,000)' },
    weightCutPercent:  { label: 'out of MAX_WEIGHT_CUT_PERCENT (1,000,000,000)' },
    percent:           { label: 'out of SPLITS_TOTAL_PERCENT (1,000,000,000)' },
    splitPercent:      { label: 'out of SPLITS_TOTAL_PERCENT (1,000,000,000)' },
  };
  var cleanName = param.name.replace(/^_/, '');
  var constHint = CONST_HINTS[cleanName];
  if (constHint && !isFixedPoint) {
    var pctHint = document.createElement('div');
    pctHint.className = 'conversion-hint';
    pctHint.textContent = constHint.label;
    group.appendChild(pctHint);
  }

  group.getValue = function() {
    var v = input.value.trim();
    if (!v) return 0n;
    if (v.includes('.') && isFixedPoint) {
      return toFixedPoint(v, decimals);
    }
    return BigInt(v);
  };

  group.validate = function() {
    var v = input.value.trim();
    if (!v) return null;
    try {
      if (v.includes('.') && isFixedPoint) toFixedPoint(v, decimals);
      else BigInt(v);
    } catch (_) {
      return param.name + ': must be a valid number';
    }
    if (Number(v) < 0) return param.name + ': must be non-negative';
    return null;
  };

  return group;
}

export function renderAddressInput(param, context) {
  var input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '0x...';
  input.className = 'field address-field';

  var group = makeGroup(param, input);

  var isToken = /^_?token$/i.test(param.name);
  var isBeneficiary = /^_?beneficiary$/i.test(param.name);

  // Token quick-select
  if (isToken) {
    var resolved = document.createElement('div');
    resolved.className = 'resolved-address';
    var tokenSelect = renderTokenSelect(function(token) {
      if (token) {
        input.value = token.address;
        resolved.textContent = '→ ' + token.address;
        input.style.display = 'none';
      } else {
        input.value = '';
        resolved.textContent = '';
        input.style.display = '';
      }
    });
    group.insertBefore(tokenSelect, input);
    group.appendChild(resolved);
    // Default to native token
    input.value = '0x000000000000000000000000000000000000EEEe';
    input.style.display = 'none';
    resolved.textContent = '→ 0x000000000000000000000000000000000000EEEe';
  }

  // Beneficiary "self" shortcut — doubles as connect wallet if disconnected
  if (isBeneficiary) {
    var pills = document.createElement('div');
    pills.className = 'token-pills';
    var selfPill = document.createElement('button');
    selfPill.type = 'button';

    function updateSelfPill() {
      var acc = getAccount();
      if (acc) {
        selfPill.textContent = 'self';
        selfPill.className = 'pill selected';
        input.value = acc;
      } else {
        selfPill.textContent = 'connect wallet';
        selfPill.className = 'pill pill-connect';
        input.value = '';
      }
    }
    updateSelfPill();
    onWalletChange(updateSelfPill);

    selfPill.addEventListener('click', function() {
      var acc = getAccount();
      if (!acc) {
        connect().then(function() {
          var newAcc = getAccount();
          if (newAcc) input.value = newAcc;
        });
        return;
      }
      input.value = acc;
      pills.querySelectorAll('.pill').forEach(function(p) { p.classList.remove('selected'); });
      selfPill.classList.add('selected');
    });
    var customPill = document.createElement('button');
    customPill.type = 'button';
    customPill.className = 'pill';
    customPill.textContent = 'custom';
    customPill.addEventListener('click', function() {
      input.value = '';
      input.focus();
      pills.querySelectorAll('.pill').forEach(function(p) { p.classList.remove('selected'); });
      customPill.classList.add('selected');
    });
    pills.appendChild(selfPill);
    pills.appendChild(customPill);
    group.insertBefore(pills, input);
  }

  group.getValue = function() { return input.value.trim(); };

  group.validate = function() {
    var v = input.value.trim();
    if (!v) return param.name + ': address required';
    if (!isAddress(v)) return param.name + ': invalid address';
    return null;
  };

  return group;
}

export function renderBoolInput(param) {
  var input = document.createElement('input');
  input.type = 'checkbox';
  var group = makeGroup(param, input);
  group.getValue = function() { return input.checked; };
  group.validate = function() { return null; };
  return group;
}

export function renderBytesInput(param) {
  var input = document.createElement('textarea');
  input.placeholder = '0x';
  input.value = '0x';
  input.rows = 2;
  var isOptionalBytes = /metadata|data/i.test(param.name);
  input.className = 'field bytes-field' + (isOptionalBytes ? ' optional-field' : '');
  var group = makeGroup(param, input);
  group.getValue = function() { return input.value.trim() || '0x'; };
  group.validate = function() {
    var v = input.value.trim();
    if (v && !v.startsWith('0x')) return param.name + ': must start with 0x';
    if (v && !/^0x[0-9a-fA-F]*$/.test(v)) return param.name + ': invalid hex';
    return null;
  };
  return group;
}

export function renderStringInput(param) {
  var input = document.createElement('textarea');
  input.rows = 1;
  input.placeholder = '';
  var isUri = /uri|url/i.test(param.name);
  var isOptionalString = isUri || /memo/i.test(param.name);
  input.className = (isUri ? 'field uri-field' : 'field string-field') + (isOptionalString ? ' optional-field' : '');
  var group = makeGroup(param, input);
  group.getValue = function() { return input.value; };
  group.validate = function() { return null; };
  return group;
}

// --- Composites ---

export function renderTupleInput(param, context, depth) {
  var container = document.createElement('div');
  container.className = 'tuple-group';
  container.style.paddingLeft = ((depth + 1) * 8) + 'px';
  container.style.background = DEPTH_BG[depth % DEPTH_BG.length];

  var label = document.createElement('div');
  label.className = 'tuple-label';
  label.textContent = param.name || param.internalType || 'struct';
  container.appendChild(label);

  var children = [];
  var components = param.components || [];
  for (var i = 0; i < components.length; i++) {
    var child = renderInput(components[i], context, depth + 1);
    children.push(child);
    container.appendChild(child);
  }

  container.getValue = function() {
    return children.map(function(c) { return c.getValue(); });
  };

  container.validate = function() {
    for (var j = 0; j < children.length; j++) {
      var err = children[j].validate();
      if (err) return err;
    }
    return null;
  };

  return container;
}

export function renderArrayInput(param, context, depth) {
  var container = document.createElement('div');
  container.className = 'array-group';

  var label = document.createElement('div');
  label.className = 'input-label';
  label.innerHTML = param.name + ' <span class="type-hint">' + param.type + '</span>';
  container.appendChild(label);

  var itemsDiv = document.createElement('div');
  container.appendChild(itemsDiv);
  var items = [];

  var elementType = param.type.replace(/\[\]$/, '');
  var elementParam = {
    type: elementType,
    name: '',
    components: param.components,
    internalType: param.internalType ? param.internalType.replace(/\[\]$/, '') : undefined,
  };

  function addItem() {
    var idx = items.length;
    var wrapper = document.createElement('div');
    wrapper.className = 'array-item';
    var indexLabel = document.createElement('span');
    indexLabel.className = 'array-index';
    indexLabel.textContent = '[' + idx + ']';
    wrapper.appendChild(indexLabel);
    var item = renderInput(elementParam, context, (depth || 0) + 1);
    wrapper.appendChild(item);
    items.push(item);
    itemsDiv.appendChild(wrapper);
  }

  addItem(); // start with one entry

  var controls = document.createElement('div');
  controls.className = 'array-controls';
  var addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn-array-add';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', addItem);
  var removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn-array-remove';
  removeBtn.textContent = '−';
  removeBtn.addEventListener('click', function() {
    if (items.length > 0) {
      items.pop();
      itemsDiv.removeChild(itemsDiv.lastChild);
    }
  });
  controls.appendChild(addBtn);
  controls.appendChild(removeBtn);
  container.appendChild(controls);

  container.getValue = function() {
    return items.map(function(i) { return i.getValue(); });
  };

  container.validate = function() {
    for (var j = 0; j < items.length; j++) {
      var err = items[j].validate();
      if (err) return err;
    }
    return null;
  };

  return container;
}
