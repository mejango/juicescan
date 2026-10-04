// Shared public origins for indexed reads, server previews, documentation and schema validation.
export const BENDYSTRAW_MAINNET_HOST = 'https://bendystraw.up.railway.app';
export const BENDYSTRAW_TESTNET_HOST = 'https://testnet.bendystraw.xyz';
export const BENDYSTRAW_GRAPHQL_ENDPOINTS = Object.freeze({
  mainnet: BENDYSTRAW_MAINNET_HOST + '/graphql',
  testnet: BENDYSTRAW_TESTNET_HOST + '/graphql',
});
