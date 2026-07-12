// src/tokens.js
// Token quick-select: per-chain known tokens with address resolution

import { getChainTokens, getCurrentChainId, onChainChange } from './chain.js';

export function renderTokenSelect(onSelect) {
  const container = document.createElement('div');
  container.className = 'token-pills';

  function render() {
    container.innerHTML = '';
    const tokens = getChainTokens(getCurrentChainId());
    tokens.forEach((token, i) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'pill' + (i === 0 ? ' selected' : '');
      pill.textContent = token.symbol;
      pill.addEventListener('click', () => {
        container.querySelectorAll('.pill').forEach(p => p.classList.remove('selected'));
        pill.classList.add('selected');
        onSelect(token);
      });
      container.appendChild(pill);
    });
    // Custom option
    const custom = document.createElement('button');
    custom.type = 'button';
    custom.className = 'pill';
    custom.textContent = 'custom';
    custom.addEventListener('click', () => {
      container.querySelectorAll('.pill').forEach(p => p.classList.remove('selected'));
      custom.classList.add('selected');
      onSelect(null);
    });
    container.appendChild(custom);
  }

  render();
  onChainChange(render);
  return container;
}
