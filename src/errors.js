// src/errors.js
// Error display: revert decoding, validation, network errors

export function renderError(message) {
  var box = document.createElement('div');

  if (message.includes('rejected by wallet')) {
    box.className = 'error-box muted';
    box.textContent = message;
    // Auto-dismiss after 3 seconds
    setTimeout(function() { if (box.parentNode) box.parentNode.removeChild(box); }, 3000);
    return box;
  }

  if (message.includes('Network error') || message.includes('timeout')) {
    box.className = 'error-box warning';
    box.textContent = message;
    return box;
  }

  // Default: revert or general error
  box.className = 'error-box error';
  box.textContent = message;
  return box;
}

export function renderValidationError(message) {
  var span = document.createElement('span');
  span.className = 'validation-error';
  span.textContent = message;
  return span;
}
