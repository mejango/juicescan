# Juicescan

Juicescan is the explorer for [Juicebox V6](https://juicebox.money): look up any project or revnet, read its rules and balances, and send any protocol transaction from your own wallet.

It is a static bundle published to IPFS. It reads chain RPCs and the Bendystraw indexer, and every transaction is built in the browser and signed by your wallet. It covers Ethereum, Base, Arbitrum, Optimism and their Sepolia testnets.

## Quick start

```bash
nvm use
npm ci
npm run dev          # regenerate the registry, bundle, and serve at http://localhost:3000
npm run build        # regenerate data and bundle to dist/
npm run check        # the full pre-publish gate
```

`dist/` is the whole deployable app: `index.html`, the minified ESM entry `app-<hash>.js` and the chunks it loads from `chunks/`, `style.css`, the static guides `learn.html` and `build.html`, `llms.txt`, `robots.txt`, `manifest.json`, the logo and favicon, and the PDF runtime. Every file resolves relative to the page, so the directory deploys as one IPFS CID.

`npm run serve` serves the existing `dist/` without rebuilding it. Set `PORT` to change its port.

Project URLs mirror the hash route into `?project=<chain>:<id>`. An HTTP host running `npm run serve` uses it to return a project link card (logo, name, slogan, balance, payment count). On IPFS the query is ignored. The server builds no transactions.

## Architecture

Vanilla ES modules, no framework, bundled with esbuild. State lives in plain objects. Views are built with a small `el()` DOM helper and re-rendered on change. esbuild splits the app into an ESM entry and lazy chunks.

```
src/
  app.js                  entry: routing (#discover, #learn, …) and the tab shell
  discover.js             project directory and project detail
                          (tokens, owners, settlement, loans, stages),
                          cross-chain moves, Safe flows, 721 management
  create-flow.js          the launch form (custom projects and revnets)
  pay-component.js        pay a project (terminal or buyback route)
  cashout-component.js    cash out tokens
  mint/burn/deploy-erc20/reserved/payouts/permissions-component.js
                          single-purpose controller and terminal actions
  launch-component.js     standalone launch and the shared ruleset encoders
  queue-ruleset-component.js   queue new rulesets on an existing project
  component-base.js       executeTransaction(), wallet, ENS, address and amount helpers
  encoding.js             parseAmount and formatAmount
  chain.js / wallet.js / relayr.js / safe.js   chain config, wallet, relayer, Safe
  bendystraw-*.js         the indexer client and formatters
  abi-registry.js         GENERATED: all contract ABIs and addresses

data/*.json               GENERATED: deployments, contract sources
build/                    the data pipeline, bundler and IPFS publisher
test/                     unit tests, browser tests and the live UI canary
```

### Build pipeline

`npm run build` runs four steps:

1. `sync-deployments`: pull ABIs and addresses from `../../deploy-all-v6/deployments` into `data/`.
2. `extract-sources`: pull verified contract sources for the in-app source viewer.
3. `generate`: fold everything into `src/abi-registry.js`.
4. `bundle`: write `dist/`, including the static guides and assets.

`src/abi-registry.js` and `data/*.json` are generated and change only when the recorded V6 deployment artifacts change. Regenerate them with `npm run build`.

Hook, router and gateway generations differ per chain and per project. [RISKS.md](RISKS.md) says how to read which one a project uses.

### Choosing a base currency

Juicebox has two notions of currency:

- `baseCurrency`: a standard id (`ETH = 1`, `USD = 2`) used for issuance and pricing. The same on every chain.
- `JBAccountingContext.currency`: `uint32(uint160(token))`, derived from the token address. Per token, per chain.

`JBPrices` converts between them through price feeds. A custom accounting token uses its own currency id for both, so it needs no feed. The launch form defaults ETH and USDC projects to `baseCurrency = USD(2)` so both resolve through the ETH/USD and USDC/USD feeds on every chain. An ETH base also works where the USDC/ETH ratio feed is registered. Read the selected chain's live `JBPrices` coverage before choosing a base currency.

## How a transaction is built

Every write is composed in the browser and handed to the wallet through `executeTransaction()` in `component-base.js`, which handles approvals, permits, simulation, confirmation and status. Each transaction's arguments come from a pure `buildXArgs()` function that a test round-trips through the contract ABI.

[test/TX_COVERAGE.md](test/TX_COVERAGE.md) lists every action, its contract function, its builder and its test.

`pay` sends a minimum of 99% of the previewed tokens and `cashOutTokensOf` a minimum of 95% of the previewed reclaim. The transaction reverts below either.

Address fields resolve ENS. A field that could encode the zero address as a destination for funds or authority blocks the deploy.

## Testing

`npm run check` is the full pre-publish gate. [TESTING.md](TESTING.md) lists every layer and what it protects.

## Publish to IPFS

```bash
npm run publish    # run the full gate, then pin dist/ and print the CID
```

Requires a local `ipfs` (kubo) binary and `FILEBASE_KEY`, `FILEBASE_SECRET` and `FILEBASE_BUCKET` in `.env`. `PINATA_JWT` is optional and adds a second pin of the same CID.
