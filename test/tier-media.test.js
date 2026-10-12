import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderTierMediaInto } from '../src/discover.js';

describe('shop tier media rendering', () => {
  let intersectionCallback;

  beforeEach(() => {
    intersectionCallback = null;
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback) { intersectionCallback = callback; }
      observe() {}
      disconnect() {}
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(['thumb', 'full', 'detail'])('restores the placeholder after image candidates fail in %s', async mode => {
    const container = document.createElement('div');
    container.innerHTML = '<span class="shop-tier-ph">#2</span>';
    renderTierMediaInto(container, { image: 'data:image/svg+xml;base64,YnJva2Vu' }, 'Blue Team', mode);
    const image = container.querySelector('img');
    image.dispatchEvent(new Event('error'));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.shop-tier-ph').textContent).toBe('#2');
  });

  it('provides a named fallback for selected thumbnails and ignores stale image errors', () => {
    const container = document.createElement('div');
    renderTierMediaInto(container, { image: 'data:image/svg+xml;base64,YnJva2Vu' }, 'Blue Team', 'thumb');
    const stale = container.querySelector('img');
    renderTierMediaInto(container, { image: 'data:image/svg+xml;base64,Z29vZA==' }, 'Orange Team', 'thumb');
    const current = container.querySelector('img');
    stale.dispatchEvent(new Event('error'));
    expect(container.querySelector('img')).toBe(current);
    current.dispatchEvent(new Event('error'));
    expect(container.textContent).toBe('Orange Team');
    expect(container.querySelector('img')).toBeNull();
  });

  it('keeps the image while an IPFS retry remains, then restores its fallback', async () => {
    const container = document.createElement('div');
    renderTierMediaInto(container, { image: 'ipfs://bafyimage/image.png' }, 'Blue Team', 'thumb');
    const image = container.querySelector('img');
    await vi.waitFor(() => expect(image.getAttribute('src')).toBeTruthy());
    let attempts = 0;
    while (container.querySelector('img') && attempts++ < 10) image.dispatchEvent(new Event('error'));
    expect(attempts).toBeGreaterThan(1);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('Blue Team');
  });

  it('loads visible video previews lazily through eth.sucks and falls back on error', () => {
    const container = document.createElement('div');
    expect(renderTierMediaInto(container, {
      animationUrl: 'ipfs://bafyvideo/movie.mp4', mediaType: 'video/mp4',
    }, 'Mission video', 'full')).toBe(true);

    const video = container.querySelector('video');
    expect(video.preload).toBe('metadata');
    expect(video.controls).toBe(true);
    expect(video.hasAttribute('src')).toBe(false);

    intersectionCallback([{ target: video, isIntersecting: true }]);
    expect(video.getAttribute('src')).toBe('https://bafyvideo.eth.sucks/movie.mp4');
    expect(video.play).toHaveBeenCalledOnce();

    intersectionCallback([{ target: video, isIntersecting: false }]);
    expect(video.pause).toHaveBeenCalledOnce();

    video.dispatchEvent(new Event('error'));
    expect(video.getAttribute('src')).toBe('https://juicebox.center/ipfs/bafyvideo/movie.mp4');
  });

  it('uses a music-note thumbnail without starting an audio request', () => {
    const container = document.createElement('div');
    expect(renderTierMediaInto(container, {
      animationUrl: 'ipfs://bafyaudio/song.mp3', mediaType: 'audio/mpeg',
    }, 'Theme song', 'thumb')).toBe(true);

    const note = container.querySelector('.tier-media-audio-note');
    expect(note).not.toBeNull();
    expect(note.textContent).toBe('♪');
    expect(note.getAttribute('aria-label')).toBe('Theme song: audio');
    expect(container.querySelector('audio')).toBeNull();
  });

  it('does not autoplay when the visitor requests reduced motion', () => {
    matchMedia.mockReturnValue({ matches: true });
    const container = document.createElement('div');
    renderTierMediaInto(container, {
      animationUrl: 'ipfs://bafyvideo/movie.mp4', mediaType: 'video/mp4',
    }, 'Quiet video', 'detail');

    const video = container.querySelector('video');
    expect(video.autoplay).toBe(false);
    expect(video.getAttribute('src')).toBe('https://bafyvideo.eth.sucks/movie.mp4');
    expect(video.play).not.toHaveBeenCalled();
  });

  it('renders audio-only detail media as a note plus a demand-loaded native player', () => {
    const container = document.createElement('div');
    renderTierMediaInto(container, {
      animationUrl: 'ipfs://bafyaudio/song.mp3', mediaType: 'audio/mpeg',
    }, 'Theme song', 'detail');

    expect(container.querySelector('.tier-media-audio-note')).not.toBeNull();
    const audio = container.querySelector('audio');
    expect(audio.controls).toBe(true);
    expect(audio.preload).toBe('none');
    expect(audio.getAttribute('src')).toBe('https://bafyaudio.eth.sucks/song.mp3');
  });
});
