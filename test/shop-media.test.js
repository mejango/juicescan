import { describe, expect, it, vi } from 'vitest';
import { decodeFunctionData, encodeFunctionData } from 'viem';
import { getABI } from '../src/abi-registry.js';
import { canonicalShopMetadata, mergeShopMediaMetadata, prepareShopMediaMetadata, SHOP_MEDIA_METADATA_ABI, shopMediaMetadataArgs } from '../src/shop-media.js';

const HOOK = '0x1111111111111111111111111111111111111111';
const ENCODED = `0x${'ab'.repeat(32)}`;
const metadata = { name: 'Original item', description: 'Local description', image: 'ipfs://original',
  attributes: [{ trait_type: 'Edition', value: 'Base' }], external_url: 'https://example.com/item',
  properties: { nested: ['keep', { value: 42 }] }, custom: { chain: 8453 } };
const row = (chainName, changes = {}) => ({ chainName, metadata: { ...metadata, ...changes } });
function services() {
  var count = 0;
  return { pinFile: vi.fn().mockResolvedValue('ipfs://uploaded-file'),
    pinJson: vi.fn().mockImplementation(async (_json, _name) => `ipfs://metadata-${++count}`),
    encodeUri: vi.fn().mockReturnValue(ENCODED) };
}

describe('shop media metadata preservation', () => {
  it('encodes the tier URI only and uses the hook sentinel to preserve the resolver and collection fields', () => {
    const args = shopMediaMetadataArgs(HOOK, 7, ENCODED);
    const data = encodeFunctionData({ abi: SHOP_MEDIA_METADATA_ABI, functionName: 'setMetadata', args });
    expect(decodeFunctionData({ abi: getABI('JB721TiersHook'), data })).toEqual({ functionName: 'setMetadata', args: ['', '', '', '', HOOK, 7n, ENCODED] });
  });

  it.each([0, -1, 1.5, 0x100000000])('rejects an invalid tier ID %s', id => {
    expect(() => shopMediaMetadataArgs(HOOK, id, ENCODED)).toThrow(/invalid/);
  });

  it('preserves arbitrary chain-local JSON while changing an image', () => {
    const next = mergeShopMediaMetadata(metadata, { mediaUri: 'https://example.com/new.png' });
    expect(next).toEqual({ ...metadata, image: 'https://example.com/new.png', mediaType: 'image' });
    expect(metadata.image).toBe('ipfs://original');
    expect(next.properties).not.toBe(metadata.properties);
  });

  it('replaces active animation with the new image and keeps existing name/description aliases in sync only when edited', () => {
    const previous = { ...metadata, productName: 'Original item', productDescription: 'Local description',
      imageUri: 'ipfs://old', animation_url: 'ipfs://old-video', animationUrl: 'ipfs://old-video' };
    expect(mergeShopMediaMetadata(previous, { mediaUri: 'ipfs://new', name: 'New item', description: '' })).toEqual({
      ...metadata, name: 'New item', productName: 'New item', description: '', productDescription: '',
      image: 'ipfs://new', imageUri: 'ipfs://new', mediaType: 'image',
    });
  });

  it('keeps a poster image when replacing video or audio', () => {
    expect(mergeShopMediaMetadata(metadata, { mediaUri: 'ipfs://new-video', mediaType: 'video/mp4' }))
      .toMatchObject({ image: metadata.image, animation_url: 'ipfs://new-video', mediaType: 'video/mp4' });
  });

  it('pins one uploaded file and separate metadata for distinct preserved chain JSON', async () => {
    const s = services(), file = new File(['image'], 'new.png', { type: 'image/png' });
    const updates = await prepareShopMediaMetadata([row('Base'), row('Optimism', { description: 'Keep this local description', custom: { chain: 10 } })], { file, mediaType: 'image/png' }, s);
    expect(s.pinFile).toHaveBeenCalledTimes(1);
    expect(s.pinJson).toHaveBeenCalledTimes(2);
    expect(updates.map(update => update.metadata.image)).toEqual(['ipfs://uploaded-file', 'ipfs://uploaded-file']);
    expect(updates[1].metadata).toMatchObject({ description: 'Keep this local description', custom: { chain: 10 } });
    expect(updates[0].uri).not.toBe(updates[1].uri);
  });

  it('shares metadata only when the entire resulting JSON is identical', async () => {
    const s = services();
    const a = row('Base'), b = row('Optimism', { image: 'ipfs://different-old-image' });
    b.metadata = Object.fromEntries(Object.entries(b.metadata).reverse());
    const updates = await prepareShopMediaMetadata([a, b], { mediaUri: 'ipfs://same-replacement' }, s);
    expect(s.pinFile).not.toHaveBeenCalled(); expect(s.pinJson).toHaveBeenCalledTimes(1);
    expect(updates[0].uri).toBe(updates[1].uri);
    expect(canonicalShopMetadata(updates[0].metadata)).toBe(canonicalShopMetadata(updates[1].metadata));
  });

  it('rejects different conceptual items before uploading', async () => {
    const s = services();
    await expect(prepareShopMediaMetadata([row('Base'), row('Optimism', { name: 'Unrelated item' })], { file: new File(['x'], 'image.png') }, s)).rejects.toThrow(/different item names/);
    expect(s.pinFile).not.toHaveBeenCalled(); expect(s.pinJson).not.toHaveBeenCalled();
  });

  it.each([
    [{}, /Choose media/],
    [{ mediaUri: 'javascript:alert(1)' }, /replacement media URI/],
    [{ file: { size: 0 } }, /1 byte and 25 MB/],
    [{ file: { size: 26 * 1024 * 1024 } }, /1 byte and 25 MB/],
    [{ file: { size: 10 }, mediaUri: 'ipfs://a' }, /not both/],
    [{ name: '' }, /item name/],
  ])('rejects invalid edits before pinning: %j', async (edits, error) => {
    const s = services();
    await expect(prepareShopMediaMetadata([row('Base')], edits, s)).rejects.toThrow(error);
    expect(s.pinJson).not.toHaveBeenCalled(); expect(s.pinFile).not.toHaveBeenCalled();
  });

  it('checks all chains for a no-op before pinning any metadata', async () => {
    const s = services();
    await expect(prepareShopMediaMetadata([row('Base'), row('Optimism', { description: 'new' })], { description: 'new' }, s)).rejects.toThrow(/does not change.*Optimism/);
    expect(s.pinJson).not.toHaveBeenCalled();
  });

  it('rejects oversized existing JSON before pinning', async () => {
    const s = services();
    await expect(prepareShopMediaMetadata([row('Base', { custom: 'x'.repeat(65536) })], { name: 'New' }, s)).rejects.toThrow(/too large/);
    expect(s.pinJson).not.toHaveBeenCalled();
  });
});
