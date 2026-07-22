import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultFundAccessLimitGroup,
  createDefaultRuleset,
  createDefaultSplitGroup,
} from '../src/ruleset-config.js';
import { configRow, percentSlider, renderRulesetFieldset } from '../src/ruleset-ui.js';

describe('ruleset editor DOM invariants', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps slider and typed percentage state synchronized and bounded', () => {
    const state = { reservedPercent: 12.5 };
    const row = percentSlider('reserved rate', state, 'reservedPercent', 100);
    const [slider, typed] = row.querySelectorAll('input');

    slider.value = '25.5';
    slider.dispatchEvent(new Event('input'));
    expect(state.reservedPercent).toBe(25.5);
    expect(typed.value).toBe('25.5');

    typed.value = '101';
    typed.dispatchEvent(new Event('input'));
    expect(state.reservedPercent).toBe(25.5);
    typed.dispatchEvent(new Event('blur'));
    expect(typed.value).toBe('25.5');
  });

  it('marks optional config fields and writes trimmed values only on input', () => {
    const state = { projectId: '7' };
    const row = configRow('project ID', 'optional, routes to project', state, 'projectId', '0');
    const input = row.querySelector('input');
    expect(input.classList.contains('optional-field')).toBe(true);
    expect(input.placeholder).toBe('0');
    input.value = ' 42 ';
    input.dispatchEvent(new Event('input'));
    expect(state.projectId).toBe('42');
  });

  it('renders and mutates the complete expanded ruleset shape', () => {
    const updateUI = vi.fn();
    const ruleset = createDefaultRuleset({ mustStartAtOrAfter: 123 });
    Object.assign(ruleset, {
      durationPreset: -1,
      durationCustom: '3600',
      splitsExpanded: true,
      fundAccessExpanded: true,
      flagsExpanded: true,
      advancedExpanded: true,
      splitGroups: [createDefaultSplitGroup()],
      fundAccessLimitGroups: [createDefaultFundAccessLimitGroup()],
    });
    const state = { rulesets: [createDefaultRuleset(), ruleset] };
    const fieldset = renderRulesetFieldset(ruleset, 1, state, updateUI, {
      includeStartAt: true,
      weightHint: 'tokens per ETH',
    });
    document.body.appendChild(fieldset);

    expect(fieldset.querySelector('.nested-index').textContent).toBe('#2');
    expect(fieldset.querySelectorAll('input[type="checkbox"]')).toHaveLength(15);
    expect(fieldset.querySelector('input[placeholder="seconds"]').value).toBe('3600');
    expect(fieldset.textContent).toContain('Fund access limits');
    expect(fieldset.textContent).toContain('Surplus allowances');

    const usd = [...fieldset.querySelectorAll('button')].find(button => button.textContent === 'USD');
    usd.click();
    expect(ruleset.baseCurrency).toBe(2);
    expect(updateUI).toHaveBeenCalled();

    const addSplit = [...fieldset.querySelectorAll('button')].find(button => button.textContent === '+ split');
    addSplit.click();
    expect(ruleset.splitGroups[0].splits).toHaveLength(2);

    const pausePay = [...fieldset.querySelectorAll('label')].find(label => label.textContent === 'Pause payments');
    const checkbox = pausePay.querySelector('input');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    expect(ruleset.pausePay).toBe(true);

    fieldset.querySelector('.ruleset-remove').click();
    expect(state.rulesets).toHaveLength(1);
  });
});
