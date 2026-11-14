// The `.jb` launch draft format, version 2, as juice-sdk-v4 defines it in
// packages/core/src/v6/jbDraft.ts. Juicescan takes no SDK, so this file is that module with
// its types removed. Do not edit it: change the format in the SDK, then run
// build/port-jb-draft-format.mjs. test/jb-draft-format.test.js runs the SDK's vectors on it.
/**
 * The `.jb` launch draft, version 2: one file every Juicebox client reads and writes.
 *
 * The file states what to launch in plain units, never a site's form state:
 * - amounts, rates and percents are decimal strings in human units ("10000", "2.5");
 * - percents run 0 to 100, and a cash out tax runs 0 to 1, as the sites show it;
 * - times are unix seconds, 0 meaning "not set";
 * - chain ids are the real ids, and a per-chain map overrides its default on that chain.
 *
 * A reader is strict. A file with an unknown key or a value of the wrong type is refused,
 * so a site never opens part of a file. Only `v`, `kind` and `stages` must be written: a
 * key left out takes the default the `emptyJbDraft*` helpers give, so a short file written
 * by hand says the same thing on every site. What a site's own form cannot express is
 * that site's rule: it refuses with {@link jbDraftUnsupported}.
 */
export const JB_DRAFT_VERSION = 2;
export const JB_DRAFT_MAX_CHARS = 2_000_000;
export class JbDraftError extends Error {
    constructor(message) {
        super(message);
        this.name = "JbDraftError";
    }
}
/** The refusal a site gives a file holding something its form cannot express. */
export function jbDraftUnsupported(site, what) {
    return new JbDraftError(`${site} can't launch this file: it has ${what}.`);
}
/** `my-project.jb`, or `<fallback>.jb` for a name with nothing to keep. */
export function jbDraftFileName(name, fallback = "project") {
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `${slug || fallback}.jb`;
}
function invalid(path) {
    throw new JbDraftError(`That .jb file can't be read: ${path} isn't valid.`);
}
const text = (max) => (value, path) => typeof value === "string" && value.length <= max ? value : invalid(path);
const decimal = (value, path) => typeof value === "string" &&
    value.length <= 40 &&
    /^\d*(?:\.\d*)?$/.test(value)
    ? value
    : invalid(path);
const flag = (value, path) => typeof value === "boolean" ? value : invalid(path);
const whole = (min, max) => (value, path) => typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max
    ? value
    : invalid(path);
const oneOf = (...options) => (value, path) => options.includes(value) ? value : invalid(path);
const list = (item, max, min = 0) => (value, path) => Array.isArray(value) && value.length >= min && value.length <= max
    ? value.map((entry, index) => item(entry, `${path}[${index}]`))
    : invalid(path);
const nullable = (item) => (value, path) => value === null ? null : item(value, path);
function record(value, path) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : invalid(path);
}
/** Exactly these keys: a missing one or an extra one refuses the file. */
const shape = (spec) => (value, path) => {
    const source = record(value, path);
    for (const key of Object.keys(source)) {
        if (!Object.prototype.hasOwnProperty.call(spec, key))
            invalid(`${path}.${key}`);
    }
    const out = {};
    for (const key of Object.keys(spec)) {
        // Defaults are filled before this runs, so a key still missing is one that must be written.
        if (!Object.prototype.hasOwnProperty.call(source, key))
            invalid(`${path}.${key}`);
        out[key] = spec[key](source[key], `${path}.${key}`);
    }
    return out;
};
const MAX_CHAINS = 16;
const chainId = whole(1, Number.MAX_SAFE_INTEGER);
const chainMap = (entry) => (value, path) => {
    const source = record(value, path);
    const keys = Object.keys(source);
    if (keys.length > MAX_CHAINS)
        invalid(path);
    const out = {};
    for (const key of keys) {
        if (!/^[1-9]\d{0,15}$/.test(key))
            invalid(`${path}.${key}`);
        out[Number(key)] = entry(source[key], `${path}.${key}`);
    }
    return out;
};
const address = text(64);
const addresses = chainMap(address);
const decimals = chainMap(decimal);
const currency = oneOf("eth", "usd", "token");
/** Far enough out for any date, small enough to stay a date (year 2286). */
const time = whole(0, 9_999_999_999);
const supplyOnChain = (value, path) => value === "unlimited" ? value : decimal(value, path);
const split = shape({
    share: decimal,
    amount: decimal,
    amountPerChain: decimals,
    to: oneOf("address", "project", "fundMarket", "sticky", "hook"),
    address,
    addressPerChain: addresses,
    projectId: decimal,
    projectIdPerChain: decimals,
    hook: address,
    addToBalance: flag,
    lockedUntil: time,
    sticky: nullable(shape({
        group: oneOf("all", "tenure"),
        minWeeks: decimal,
        maxWeeks: decimal,
    })),
});
const splits = list(split, 100);
const stage = shape({
    startAt: time,
    startAfterCycles: decimal,
    startAfterDays: decimal,
    duration: whole(0, 4_294_967_295),
    issuance: decimal,
    baseCurrency: currency,
    cutPercent: decimal,
    cutDays: decimal,
    reserved: splits,
    autoIssuances: list(shape({
        count: decimal,
        address,
        chainId,
    }), 100),
    cashOutTax: decimal,
    payouts: list(shape({
        token: oneOf("eth", "usdc", "custom"),
        mode: oneOf("none", "all", "amounts"),
        currency,
        splits,
    }), 3),
    surplusAllowance: shape({
        mode: oneOf("none", "unlimited", "limited"),
        amount: decimal,
        currency,
    }),
    approval: oneOf("none", "3hours", "1day", "3days", "7days", "custom"),
    holdFees: flag,
    ownerMinting: flag,
    pausePay: flag,
    pauseCreditTransfers: flag,
    pause721Transfers: flag,
    useTotalSurplusForCashOuts: flag,
    ownerMustSendPayouts: flag,
    metadataExtra: whole(0, 0x3fff),
    powers: shape({
        setTerminals: flag,
        setController: flag,
        terminalMigration: flag,
        setCustomToken: flag,
        addAccountingContext: flag,
        addPriceFeed: flag,
    }),
});
const uri = text(500);
const item = shape({
    name: text(100),
    description: text(2_000),
    mediaUri: uri,
    mediaType: text(100),
    metadataUri: uri,
    price: decimal,
    supply: decimal,
    supplyPerChain: chainMap(supplyOnChain),
    excludedChains: list(chainId, MAX_CHAINS),
    discountPercent: decimal,
    reserveEvery: decimal,
    reserveBeneficiary: address,
    reserveBeneficiaryPerChain: addresses,
    category: whole(0, 0xffffff),
    votingUnits: decimal,
    splits,
    allowOwnerMint: flag,
    transfersPausable: flag,
    cantBeRemoved: flag,
    allowCredits: flag,
    ownerCanEditDiscount: flag,
});
const draft = shape({
    v: (value, path) => value === JB_DRAFT_VERSION ? JB_DRAFT_VERSION : invalid(path),
    kind: oneOf("project", "revnet"),
    name: text(100),
    ticker: text(32),
    tagline: text(100),
    description: text(10_000),
    payNotice: text(1_000),
    tags: list(text(30), 3),
    logoUri: uri,
    coverUri: uri,
    links: shape({
        website: uri,
        twitter: uri,
        discord: uri,
        telegram: uri,
        instagram: uri,
        whatsapp: uri,
    }),
    chains: list(chainId, MAX_CHAINS),
    linkChains: flag,
    bridge: oneOf("ccip", "native", "both"),
    owner: address,
    ownerPerChain: addresses,
    safe: nullable(shape({
        signers: list(address, 20),
        threshold: whole(0, 20),
    })),
    accepts: list(oneOf("eth", "usdc", "custom"), 2),
    customToken: address,
    anyToken: flag,
    approvalHook: address,
    approvalHookPerChain: addresses,
    afterMode: oneOf("wait", "terminal", "cycle"),
    stages: list(stage, 32, 1),
    shop: shape({
        currency,
        collectionName: text(100),
        collectionSymbol: text(32),
        preventOverspending: flag,
        noNewTiersWithReserves: flag,
        noNewTiersWithVotes: flag,
        noNewTiersWithOwnerMinting: flag,
        issueTokensForSplits: flag,
        itemsRedeem: flag,
        operatorCanAdjustTiers: flag,
        operatorCanUpdateMetadata: flag,
        operatorCanMint: flag,
        operatorCanIncreaseDiscount: flag,
        categories: list(shape({
            id: whole(1, 0xffffff),
            name: text(64),
        }), 255),
        items: list(item, 100),
    }),
});
/**
 * What the shape alone cannot say. A revnet has no owner rules, so a revnet file carries
 * none: a reader never has to decide what a payout on a revnet would mean.
 */
function checkKind(value) {
    const revnet = value.kind === "revnet";
    const custom = value.accepts.includes("custom");
    const hasEntries = (map) => Object.keys(map).length > 0;
    const bad = (when, path) => {
        if (when)
            invalid(path);
    };
    /** `token` means the custom token, so it needs one. */
    const money = (unit, path) => bad(unit === "token" && !custom, path);
    /** A row carries only what its kind uses, and a share or an amount, never both. */
    const eachSplit = (rows, path, amounts = false) => rows.forEach((row, index) => {
        const at = `${path}[${index}]`;
        bad((row.to === "sticky") !== (row.sticky !== null), `${at}.sticky`);
        bad(row.to !== "hook" && row.hook !== "", `${at}.hook`);
        bad(row.to !== "project" && row.addToBalance, `${at}.addToBalance`);
        // A project row names a project. A hook row may pass one on to its hook.
        const takesProject = row.to === "project" || row.to === "hook" || row.to === "fundMarket";
        bad(!takesProject && row.projectId !== "", `${at}.projectId`);
        bad(row.to !== "project" &&
            row.to !== "hook" &&
            hasEntries(row.projectIdPerChain), `${at}.projectIdPerChain`);
        bad(amounts ? row.share !== "" : row.amount !== "", amounts ? `${at}.share` : `${at}.amount`);
        bad(!amounts && hasEntries(row.amountPerChain), `${at}.amountPerChain`);
    });
    bad(custom && value.accepts.length > 1, "draft.accepts");
    bad(new Set(value.accepts).size !== value.accepts.length, "draft.accepts");
    bad(new Set(value.chains).size !== value.chains.length, "draft.chains");
    bad(revnet && value.afterMode !== "wait", "draft.afterMode");
    bad(revnet && value.approvalHook !== "", "draft.approvalHook");
    bad(revnet && hasEntries(value.approvalHookPerChain), "draft.approvalHookPerChain");
    money(value.shop.currency, "draft.shop.currency");
    value.shop.items.forEach((entry, index) => eachSplit(entry.splits, `draft.shop.items[${index}].splits`));
    value.stages.forEach((entry, index) => {
        const at = `draft.stages[${index}]`;
        money(entry.baseCurrency, `${at}.baseCurrency`);
        money(entry.surplusAllowance.currency, `${at}.surplusAllowance.currency`);
        eachSplit(entry.reserved, `${at}.reserved`);
        entry.payouts.forEach((payout, n) => {
            money(payout.currency, `${at}.payouts[${n}].currency`);
            bad(payout.mode === "none" && payout.splits.length > 0, `${at}.payouts[${n}].splits`);
            eachSplit(payout.splits, `${at}.payouts[${n}].splits`, payout.mode === "amounts");
        });
        bad(index === 0 && entry.startAfterCycles !== "", `${at}.startAfterCycles`);
        bad(index === 0 && entry.startAfterDays !== "", `${at}.startAfterDays`);
        bad(entry.startAt > 0 && entry.startAfterCycles !== "", `${at}.startAfterCycles`);
        if (!revnet) {
            // One payout entry per accepted token, in the same order.
            bad(entry.payouts.map((payout) => payout.token).join() !==
                value.accepts.join(), `${at}.payouts`);
            bad(entry.autoIssuances.length > 0, `${at}.autoIssuances`);
            bad(entry.startAfterDays !== "", `${at}.startAfterDays`);
            bad(entry.cutDays !== "", `${at}.cutDays`);
            return;
        }
        bad(index > 0 && entry.startAt > 0, `${at}.startAt`);
        // A cut repeats on the stage's cycle, so it needs one. A cycle is at least a day.
        bad(entry.cutDays !== "" && !(Number(entry.cutDays) > 0), `${at}.cutDays`);
        bad(Number(entry.cutPercent) > 0 && entry.cutDays === "", `${at}.cutDays`);
        bad(entry.startAfterCycles !== "", `${at}.startAfterCycles`);
        bad(entry.duration !== 0, `${at}.duration`);
        bad(entry.payouts.length > 0, `${at}.payouts`);
        bad(entry.surplusAllowance.mode !== "none", `${at}.surplusAllowance`);
        bad(entry.approval !== "none", `${at}.approval`);
        bad(entry.holdFees, `${at}.holdFees`);
        bad(entry.ownerMinting, `${at}.ownerMinting`);
        bad(entry.pausePay, `${at}.pausePay`);
        bad(entry.pauseCreditTransfers, `${at}.pauseCreditTransfers`);
        bad(!entry.pause721Transfers, `${at}.pause721Transfers`);
        bad(!entry.useTotalSurplusForCashOuts, `${at}.useTotalSurplusForCashOuts`);
        bad(entry.ownerMustSendPayouts, `${at}.ownerMustSendPayouts`);
        bad(Object.values(entry.powers).some(Boolean), `${at}.powers`);
    });
}
const TOKEN_CURRENCY = {
    eth: "eth",
    usdc: "usd",
    custom: "token",
};
/** What a token's amounts are counted in when nothing says otherwise: itself. */
export function jbDraftTokenCurrency(token) {
    return TOKEN_CURRENCY[token];
}
/** What issuance is priced in when nothing says otherwise: the custom token, else ETH when
 *  ETH is accepted, else USD. */
export function jbDraftBaseCurrency(accepts) {
    return accepts.includes("custom")
        ? "token"
        : accepts.includes("eth")
            ? "eth"
            : "usd";
}
/** A split row with everything unset, for a writer to fill. */
export function emptyJbDraftSplit(to = "address") {
    return {
        share: "",
        amount: "",
        amountPerChain: {},
        to,
        address: "",
        addressPerChain: {},
        projectId: "",
        projectIdPerChain: {},
        hook: "",
        addToBalance: false,
        lockedUntil: 0,
        sticky: null,
    };
}
/** A token's payout entry with no payouts. */
export function emptyJbDraftPayout(token) {
    return { token, mode: "none", currency: TOKEN_CURRENCY[token], splits: [] };
}
/**
 * A stage with nothing chosen. A project's has cash outs off, one day for the rules before
 * it to be approved, and no payouts in any accepted token. A revnet's has the 0.1 cash out
 * tax a revnet starts at and keeps shop items from moving, as REVDeployer does.
 */
export function emptyJbDraftStage(kind = "project", accepts = ["eth"]) {
    const revnet = kind === "revnet";
    return {
        startAt: 0,
        startAfterCycles: "",
        startAfterDays: "",
        duration: 0,
        issuance: "",
        baseCurrency: jbDraftBaseCurrency(accepts),
        cutPercent: "",
        cutDays: "",
        reserved: [],
        autoIssuances: [],
        cashOutTax: revnet ? "0.1" : "1",
        payouts: revnet ? [] : accepts.map(emptyJbDraftPayout),
        surplusAllowance: {
            mode: "none",
            amount: "",
            currency: TOKEN_CURRENCY[accepts[0] ?? "eth"],
        },
        approval: revnet ? "none" : "1day",
        holdFees: false,
        ownerMinting: false,
        pausePay: false,
        pauseCreditTransfers: false,
        pause721Transfers: revnet,
        useTotalSurplusForCashOuts: true,
        ownerMustSendPayouts: false,
        metadataExtra: 0,
        powers: {
            setTerminals: false,
            setController: false,
            terminalMigration: false,
            setCustomToken: false,
            addAccountingContext: false,
            addPriceFeed: false,
        },
    };
}
/** A shop item with everything unset, for a writer to fill. */
export function emptyJbDraftItem() {
    return {
        name: "",
        description: "",
        mediaUri: "",
        mediaType: "",
        metadataUri: "",
        price: "",
        supply: "",
        supplyPerChain: {},
        excludedChains: [],
        discountPercent: "",
        reserveEvery: "",
        reserveBeneficiary: "",
        reserveBeneficiaryPerChain: {},
        category: 0,
        votingUnits: "",
        splits: [],
        allowOwnerMint: false,
        transfersPausable: false,
        cantBeRemoved: false,
        allowCredits: true,
        ownerCanEditDiscount: true,
    };
}
/** A draft with nothing chosen: ETH on no chain yet, one empty stage, an empty shop. */
export function emptyJbDraft(kind = "project", accepts = ["eth"]) {
    return {
        v: JB_DRAFT_VERSION,
        kind,
        name: "",
        ticker: "",
        tagline: "",
        description: "",
        payNotice: "",
        tags: [],
        logoUri: "",
        coverUri: "",
        links: {
            website: "",
            twitter: "",
            discord: "",
            telegram: "",
            instagram: "",
            whatsapp: "",
        },
        chains: [],
        linkChains: true,
        bridge: "ccip",
        owner: "",
        ownerPerChain: {},
        safe: null,
        accepts: [...accepts],
        customToken: "",
        anyToken: true,
        approvalHook: "",
        approvalHookPerChain: {},
        afterMode: "wait",
        stages: [emptyJbDraftStage(kind, accepts)],
        shop: {
            currency: jbDraftBaseCurrency(accepts),
            collectionName: "",
            collectionSymbol: "",
            preventOverspending: false,
            noNewTiersWithReserves: false,
            noNewTiersWithVotes: false,
            noNewTiersWithOwnerMinting: false,
            issueTokensForSplits: false,
            itemsRedeem: false,
            operatorCanAdjustTiers: true,
            operatorCanUpdateMetadata: true,
            operatorCanMint: true,
            operatorCanIncreaseDiscount: true,
            categories: [],
            items: [],
        },
    };
}
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
/** Give a written object the keys it left out. Anything that is not an object passes
 *  through for the strict check to refuse. */
function withDefaults(value, defaults) {
    if (!isRecord(value))
        return value;
    const out = { ...value };
    for (const [key, fallback] of Object.entries(defaults)) {
        if (!Object.prototype.hasOwnProperty.call(out, key))
            out[key] = fallback;
        else if (isRecord(fallback))
            out[key] = withDefaults(out[key], fallback);
    }
    return out;
}
const eachOf = (value, fill) => Array.isArray(value) ? value.map(fill) : value;
const fillSplit = (value) => withDefaults(value, emptyJbDraftSplit());
/** The file with every key it left out. `stages` is the one list that must be written. */
function withJbDraftDefaults(source) {
    const kind = source.kind === "revnet" ? "revnet" : "project";
    const written = Array.isArray(source.accepts) ? source.accepts : ["eth"];
    const accepts = written.filter((token) => token in TOKEN_CURRENCY);
    const { stages: _stages, ...defaults } = emptyJbDraft(kind, accepts);
    const filled = withDefaults(source, defaults);
    filled.stages = eachOf(filled.stages, (entry) => {
        const stage = withDefaults(entry, emptyJbDraftStage(kind, accepts));
        if (!isRecord(stage))
            return stage;
        stage.reserved = eachOf(stage.reserved, fillSplit);
        stage.payouts = eachOf(stage.payouts, (payout) => {
            const token = isRecord(payout) && String(payout.token) in TOKEN_CURRENCY;
            const filledPayout = token
                ? withDefaults(payout, emptyJbDraftPayout(payout.token))
                : payout;
            if (isRecord(filledPayout))
                filledPayout.splits = eachOf(filledPayout.splits, fillSplit);
            return filledPayout;
        });
        return stage;
    });
    if (isRecord(filled.shop)) {
        filled.shop.items = eachOf(filled.shop.items, (entry) => {
            const filledItem = withDefaults(entry, emptyJbDraftItem());
            if (isRecord(filledItem))
                filledItem.splits = eachOf(filledItem.splits, fillSplit);
            return filledItem;
        });
    }
    return filled;
}
/** Check a value against the format, returning the whole draft: only the format's keys,
 *  with every key the file left out at its default. */
export function checkJbDraft(value) {
    const source = record(value, "the file");
    if (source.v !== JB_DRAFT_VERSION) {
        throw new JbDraftError("This .jb file was saved in a format this site no longer reads. Export it again from the site it came from.");
    }
    const checked = draft(withJbDraftDefaults(source), "draft");
    checkKind(checked);
    return checked;
}
/** Read the text of a `.jb` file. Throws a {@link JbDraftError} a person can act on. */
export function parseJbDraft(source) {
    if (source.length > JB_DRAFT_MAX_CHARS)
        throw new JbDraftError("That file is too large.");
    let value;
    try {
        value = JSON.parse(source);
    }
    catch {
        throw new JbDraftError("That doesn't look like a .jb file.");
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new JbDraftError("That doesn't look like a .jb file.");
    }
    return checkJbDraft(value);
}
/** The text of a `.jb` file. A draft the format refuses is never written. */
export function serializeJbDraft(value) {
    return JSON.stringify(checkJbDraft(value), null, 2);
}
