// A dynamic import that failed stays failed in the browser's module map: importing the same chunk again
// rejects without a new request. Only a page reload fetches it again, so every lazy surface says so.
export var CHUNK_FAILED_TEXT = 'This part of the app did not load. Reload the page to try again.';

export function chunkReloadButton() {
  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'style-toggle-btn';
  button.textContent = '[reload]';
  button.addEventListener('click', function () { location.reload(); });
  return button;
}
