# Bendystraw PR — pending indexer work

Running list of changes to land in the bendystraw indexer (separate repo, not this one).

- **Canonical upstream:** `peripheralist/bendystraw`, branch `main` (the one with V6 support).
- `mejango/bendystraw` is a **stale fork** — open PRs against `peripheralist:main`.
- It's a **Ponder** indexer. Contract addresses: `src/constants/address.ts`. Per-chain start blocks: `ponder.config.ts` (`V6_TESTNET_START_BLOCKS`). Activity is a polymorphic `ActivityEvent` entity with one embedded event object per type (`payEvent`, `cashOutTokensEvent`, `deployErc20Event`, …) plus an `ActivityEventType` enum discriminator. A `SuckerTransaction` entity + sucker indexing already exist — **extend that pattern, don't reinvent it**.

---

## Item 1 — Index the cross-chain bridge (sucker) send lifecycle

**Goal:** index the sucker send lifecycle so consuming apps can show distinct **"sending X"** (queued) and **"sent X to {chain}"** (shipped) activity items. Today the activity feed has no `toRemote`/root-send event, so a downstream UI can only infer the prepare step from the sucker's under-the-hood `cashOutTokensEvent` and cannot show when the bridge message was actually sent.

**Contracts** (source of truth: `Bananapus/nana-suckers`, `src/interfaces/IJBSucker.sol` + `IJBSuckerRegistry.sol`).

Suckers are deployed dynamically per project — index them via a Ponder **factory** keyed off the registry deploy event:

```solidity
// JBSuckerRegistry
event SuckerDeployedFor(uint256 projectId, address sucker, JBSuckerDeployerConfig configuration, address caller);
```

Use `factory({ address: <JBSuckerRegistry per chain>, event: SuckerDeployedFor, parameter: "sucker" })` so every deployed JBSucker instance is indexed.

Two JBSucker events to index:

```solidity
// PREPARE — a move is queued into the outbox tree (the "sending" step)
event InsertToOutboxTree(
    bytes32 indexed beneficiary,
    address indexed token,
    bytes32 hashed,
    uint256 index,
    bytes32 root,
    uint256 projectTokenCount,
    uint256 terminalTokenAmount,
    bytes32 metadata,
    address caller
);

// SEND — the outbox root is shipped to the remote chain via toRemote (the "sent" step)
event RootToRemote(bytes32 indexed root, address indexed token, uint256 index, uint64 nonce, address caller);
```

**What to implement:**

1. New entities / `ActivityEvent` embedded types + enum values:
   - `bridgeToOutboxEvent` (or `suckerPrepareEvent`) ← `InsertToOutboxTree`. Fields: `chainId`, `projectId`, `txHash`, `timestamp`, `from`/`caller`, `sucker`, `token` (terminal/accounting token bridged), `beneficiary` (decode `bytes32` → address), `projectTokenCount`, `terminalTokenAmount`, `index`, `root`, `metadata`, `suckerGroupId`.
   - `bridgeToRemoteEvent` (or `suckerSendEvent`) ← `RootToRemote`. Fields: `chainId`, `projectId`, `txHash`, `timestamp`, `caller`, `sucker`, `token`, `index`, `nonce`, `root`, `suckerGroupId`.
   - Add both to the `ActivityEvent` type (embedded nullable fields) and the `ActivityEventType` enum, exactly like the existing embedded events.
2. Resolve `projectId` / `suckerGroupId` for each event from the indexed sucker instance (carry it through the factory context or look it up via the registry/existing sucker records — match how `SuckerTransaction` already derives them).
3. **Destination chain:** `RootToRemote` and `InsertToOutboxTree` don't carry the remote chain id directly — resolve it from the sucker's pair/peer config (the registry knows `remoteChainId` per sucker; reuse whatever `SuckerTransaction` uses for `peerChainId`). Consuming apps need it to render "to {chain}".
4. **GraphQL schema:** expose the new embedded events on `ActivityEvent` (and standalone query entities if that's the existing convention).
