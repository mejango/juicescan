// src/friendly.js
// Normal-view renderer for function forms.
// Transforms raw Solidity params into friendly, approachable inputs.
// Three layers: smart defaults → per-function config → wizard steps.

import { renderInput } from './inputs.js';

// --- Smart defaults: label transforms ---

export function camelToLabel(name) {
  // Strip leading underscore
  var n = name;
  if (n.charAt(0) === '_') n = n.slice(1);
  // camelCase → spaced words, then title-case each
  var spaced = n.replace(/([a-z])([A-Z])/g, '$1 $2')
               .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// --- Detect if a tuple should be flattened ---

export function shouldFlatten(param) {
  if (param.type !== 'tuple') return false;
  var comps = param.components || [];
  // Flatten if no nested tuples or arrays of tuples
  for (var i = 0; i < comps.length; i++) {
    if (comps[i].type === 'tuple' || comps[i].type === 'tuple[]') return false;
    if (comps[i].type.endsWith('[]') && comps[i].components) return false;
  }
  return true;
}

// --- Render a single friendly input ---

function renderFriendlyField(param, config, context, fnNatspec) {
  var paramDescriptions = (fnNatspec && fnNatspec.params) ? fnNatspec.params : {};
  var labels = (config && config.labels) || {};
  var defaults = (config && config.defaults) || {};
  var hidden = (config && config.hidden) || [];

  var cleanName = param.name;
  if (cleanName.charAt(0) === '_') cleanName = cleanName.slice(1);

  // Get the label: config override > camelToLabel
  var label = labels[cleanName] || labels[param.name] || camelToLabel(param.name);

  // Get NatSpec description
  var descKey = param.name;
  if (!paramDescriptions[descKey] && descKey.charAt(0) === '_') descKey = descKey.slice(1);
  var description = paramDescriptions[param.name] || paramDescriptions[descKey] || '';

  // Create the actual input using existing renderInput (reuse all smart behaviors)
  var paramWithDesc = Object.assign({}, param, { description: description });
  var inputEl = renderInput(paramWithDesc, context, 0);

  // Apply default value if specified
  var defaultVal = defaults[cleanName] || defaults[param.name];
  if (defaultVal !== undefined) {
    var field = inputEl.querySelector('.field');
    if (field) {
      if (field.type === 'checkbox') {
        field.checked = defaultVal === 'true' || defaultVal === true;
      } else {
        field.value = defaultVal;
      }
    }
  }

  // Re-label the input with friendly label (no type hint)
  var existingLabel = inputEl.querySelector('.input-label');
  if (existingLabel) {
    existingLabel.innerHTML = '';
    existingLabel.textContent = label;
    existingLabel.className = 'input-label friendly-label';
  }

  // For tuple groups, re-label the tuple label
  var tupleLabel = inputEl.querySelector('.tuple-label');
  if (tupleLabel) {
    tupleLabel.textContent = label;
  }

  // For array groups, re-label
  var arrayLabel = inputEl.querySelector(':scope > .input-label');
  if (arrayLabel) {
    arrayLabel.innerHTML = '';
    arrayLabel.textContent = label;
    arrayLabel.className = 'input-label friendly-label';
  }

  // Memo fields → textarea
  if (param.type === 'string' && /^_?memo$/i.test(param.name)) {
    var oldField = inputEl.querySelector('.field');
    if (oldField && oldField.tagName === 'INPUT') {
      var textarea = document.createElement('textarea');
      textarea.className = 'field friendly-textarea';
      textarea.placeholder = oldField.placeholder;
      textarea.value = oldField.value;
      textarea.id = oldField.id;
      textarea.rows = 2;
      oldField.parentNode.replaceChild(textarea, oldField);
      // Rewire getValue
      var origGetValue = inputEl.getValue;
      inputEl.getValue = function() { return textarea.value; };
    }
  }

  return { el: inputEl, name: cleanName, paramName: param.name, isHidden: hidden.indexOf(cleanName) !== -1 || hidden.indexOf(param.name) !== -1 };
}

// --- Render advanced toggle for hidden fields ---

export function renderAdvancedToggle(hiddenFields) {
  var container = document.createElement('div');
  container.className = 'advanced-section';

  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'advanced-toggle';
  toggle.textContent = 'show advanced';

  var fieldsDiv = document.createElement('div');
  fieldsDiv.className = 'advanced-fields';
  fieldsDiv.style.display = 'none';

  for (var i = 0; i < hiddenFields.length; i++) {
    fieldsDiv.appendChild(hiddenFields[i]);
  }

  var expanded = false;
  toggle.addEventListener('click', function() {
    expanded = !expanded;
    fieldsDiv.style.display = expanded ? '' : 'none';
    toggle.textContent = expanded ? 'hide advanced' : 'show advanced';
  });

  container.appendChild(toggle);
  container.appendChild(fieldsDiv);
  return container;
}

// --- Wizard step renderer ---

export function renderWizard(steps, allFieldMap, isRead) {
  var container = document.createElement('div');
  container.className = 'wizard-container';

  var currentStep = 0;

  // Step indicator bar
  var indicatorBar = document.createElement('div');
  indicatorBar.className = 'wizard-steps';
  container.appendChild(indicatorBar);

  // Step content panels
  var panels = [];
  for (var s = 0; s < steps.length; s++) {
    var panel = document.createElement('div');
    panel.className = 'wizard-panel';
    panel.style.display = s === 0 ? '' : 'none';

    var fields = steps[s].fields || [];
    for (var f = 0; f < fields.length; f++) {
      var fieldName = fields[f];
      if (allFieldMap[fieldName]) {
        panel.appendChild(allFieldMap[fieldName]);
      }
    }

    panels.push(panel);
    container.appendChild(panel);
  }

  // Navigation row
  var nav = document.createElement('div');
  nav.className = 'wizard-nav';

  var backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn wizard-back';
  backBtn.textContent = 'BACK';

  var nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn wizard-next';
  nextBtn.textContent = 'NEXT';

  nav.appendChild(backBtn);
  nav.appendChild(nextBtn);
  container.appendChild(nav);

  // The action button placeholder — the real action buttons live outside the wizard.
  // We expose a flag so form.js knows when to show them.
  container._isLastStep = function() { return currentStep === steps.length - 1; };

  function updateView() {
    // Update indicators
    indicatorBar.innerHTML = '';
    for (var i = 0; i < steps.length; i++) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'wizard-step';
      if (i === currentStep) dot.classList.add('active');
      if (i < currentStep) dot.classList.add('completed');
      dot.textContent = steps[i].label;
      // Allow clicking completed/current steps to navigate
      (function(idx) {
        dot.addEventListener('click', function() {
          if (idx <= currentStep) {
            currentStep = idx;
            updateView();
          }
        });
      })(i);
      indicatorBar.appendChild(dot);
    }

    // Show/hide panels
    for (var p = 0; p < panels.length; p++) {
      panels[p].style.display = p === currentStep ? '' : 'none';
    }

    // Update nav buttons
    backBtn.style.display = currentStep === 0 ? 'none' : '';
    nextBtn.style.display = currentStep === steps.length - 1 ? 'none' : '';
  }

  backBtn.addEventListener('click', function() {
    if (currentStep > 0) {
      currentStep--;
      updateView();
    }
  });

  nextBtn.addEventListener('click', function() {
    if (currentStep < steps.length - 1) {
      currentStep++;
      updateView();
    }
  });

  updateView();
  return container;
}

// --- Main renderer ---

export function renderNormalForm(fn, contractName, context, fnNatspec, formViewConfig) {
  var config = null;
  if (formViewConfig && formViewConfig[contractName] && formViewConfig[contractName][fn.name]) {
    config = formViewConfig[contractName][fn.name];
  }

  var container = document.createElement('div');
  container.className = 'fn-inputs friendly-inputs';

  var allInputs = [];
  var fieldMap = {}; // cleanName → input element

  // Build all friendly fields
  var visibleFields = [];
  var hiddenFields = [];

  // Determine which params to flatten
  var flattenNames = (config && config.flatten) || [];

  for (var i = 0; i < fn.inputs.length; i++) {
    var param = fn.inputs[i];

    // Auto-flatten single-level tuples
    if (shouldFlatten(param) || flattenNames.indexOf(param.name) !== -1) {
      var comps = param.components || [];
      for (var c = 0; c < comps.length; c++) {
        var field = renderFriendlyField(comps[c], config, context, fnNatspec);
        allInputs.push({ el: field.el, tupleParent: param.name, tupleIndex: c });
        fieldMap[field.name] = field.el;
        if (field.isHidden) hiddenFields.push(field.el);
        else visibleFields.push(field.el);
      }
    } else {
      var field = renderFriendlyField(param, config, context, fnNatspec);
      allInputs.push({ el: field.el, tupleParent: null });
      var cleanName = param.name;
      if (cleanName.charAt(0) === '_') cleanName = cleanName.slice(1);
      fieldMap[cleanName] = field.el;
      fieldMap[param.name] = field.el;
      if (field.isHidden) hiddenFields.push(field.el);
      else visibleFields.push(field.el);
    }
  }

  // Auto-hide: bytes metadata fields without explicit config
  if (!config || !config.hidden) {
    for (var j = 0; j < allInputs.length; j++) {
      var inp = allInputs[j];
      var el = inp.el;
      // Check if this is a bytes metadata field
      var paramName = el.dataset ? el.dataset.paramName : '';
      // Use the input label to detect metadata bytes fields
      var label = el.querySelector && el.querySelector('.input-label, .friendly-label');
      var labelText = label ? label.textContent.toLowerCase() : '';
      if (labelText === 'metadata' && visibleFields.indexOf(el) !== -1) {
        // Move from visible to hidden
        var idx = visibleFields.indexOf(el);
        if (idx !== -1) {
          visibleFields.splice(idx, 1);
          hiddenFields.push(el);
        }
      }
    }
  }

  var isRead = fn.stateMutability === 'view' || fn.stateMutability === 'pure';
  var layout = (config && config.layout) || 'flat';

  if (layout === 'stepped' && config && config.steps) {
    // Wizard layout
    var wizard = renderWizard(config.steps, fieldMap, isRead);
    container.appendChild(wizard);

    // Hidden fields below the wizard
    if (hiddenFields.length > 0) {
      container.appendChild(renderAdvancedToggle(hiddenFields));
    }
  } else {
    // Flat layout
    for (var v = 0; v < visibleFields.length; v++) {
      container.appendChild(visibleFields[v]);
    }
    if (hiddenFields.length > 0) {
      container.appendChild(renderAdvancedToggle(hiddenFields));
    }
  }

  // Expose getValue/validate matching the raw inputs interface
  // Returns an array parallel to fn.inputs (matching what form.js expects)
  container._getInputs = function() {
    var result = [];
    var tupleAccum = {}; // parentName → { children: [] }

    for (var k = 0; k < allInputs.length; k++) {
      var entry = allInputs[k];
      if (entry.tupleParent) {
        if (!tupleAccum[entry.tupleParent]) {
          tupleAccum[entry.tupleParent] = { children: [] };
        }
        tupleAccum[entry.tupleParent].children.push(entry.el);
      } else {
        // If we had accumulated tuple children, flush them first
        result.push(entry.el);
      }
    }

    return result;
  };

  // Build proper inputs array matching fn.inputs shape
  container._buildInputsArray = function() {
    var result = [];
    var inputIdx = 0;

    for (var k = 0; k < fn.inputs.length; k++) {
      var param = fn.inputs[k];

      if (shouldFlatten(param) || flattenNames.indexOf(param.name) !== -1) {
        // Re-assemble flattened tuple into a single virtual input
        var comps = param.components || [];
        var children = [];
        for (var c = 0; c < comps.length; c++) {
          children.push(allInputs[inputIdx]);
          inputIdx++;
        }
        // Create a virtual input that wraps the children
        var tupleInput = {
          getValue: (function(ch) {
            return function() {
              return ch.map(function(ci) { return ci.el.getValue(); });
            };
          })(children),
          validate: (function(ch) {
            return function() {
              for (var v = 0; v < ch.length; v++) {
                var err = ch[v].el.validate();
                if (err) return err;
              }
              return null;
            };
          })(children)
        };
        result.push(tupleInput);
      } else {
        result.push(allInputs[inputIdx].el);
        inputIdx++;
      }
    }

    return result;
  };

  return container;
}
