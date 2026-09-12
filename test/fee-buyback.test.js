import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbi } from "viem";
import {
  analyzeFeeSimulation,
  checkFeeBuyback,
  createFeeWatch,
  feeReceipt
} from "../src/fee-buyback.ts";
const terminal = "0x1111111111111111111111111111111111111111";
const hook = "0x2222222222222222222222222222222222222222";
const user = "0x3333333333333333333333333333333333333333";
const controller = "0x4444444444444444444444444444444444444444";
const loans = "0x5555555555555555555555555555555555555555";
const owner = "0x6666666666666666666666666666666666666666";
const abi = parseAbi([
  "event Mint(uint256 indexed projectId,uint256 leftoverAmount,uint256 tokenCount,address caller)",
  "event Swap(uint256 indexed projectId,uint256 amountToSwapWith,bytes32 indexed poolId,uint256 amountReceived,address caller)",
  "event Pay(uint256 indexed rulesetId,uint256 indexed rulesetCycleNumber,uint256 indexed projectId,address payer,address beneficiary,uint256 amount,uint256 newlyIssuedTokenCount,string memo,bytes metadata,address caller)",
  "event MintTokens(address indexed beneficiary,uint256 indexed projectId,uint256 tokenCount,uint256 beneficiaryTokenCount,string memo,uint256 reservedPercent,address caller)",
  "event ProcessFee(uint256 indexed projectId,address indexed token,uint256 indexed amount,bool wasHeld,address beneficiary,address caller)"
]);
const opts = {
  trustedHooks: [hook],
  beneficiary: user,
  terminals: [terminal],
  controllers: [controller],
  feePayers: [loans, terminal]
};
const word = (n) => encodeAbiParameters([{ type: "uint256" }], [n]);
const mint = {
  address: hook,
  topics: encodeEventTopics({
    abi,
    eventName: "Mint",
    args: { projectId: 6n }
  }),
  data: encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }, { type: "address" }],
    [15090000n, 9429n, terminal]
  )
};
const swap = {
  address: hook,
  topics: encodeEventTopics({
    abi,
    eventName: "Swap",
    args: { projectId: 6n, poolId: `0x${"00".repeat(32)}` }
  }),
  data: encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }, { type: "address" }],
    [15090000n, 60874n, terminal]
  )
};
function pay(issued = 0n, payer = loans, beneficiary = user, projectId = 6n) {
  return {
    address: terminal,
    topics: encodeEventTopics({
      abi,
      eventName: "Pay",
      args: { rulesetId: 1n, rulesetCycleNumber: 1n, projectId }
    }),
    data: encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "string" },
        { type: "bytes" },
        { type: "address" }
      ],
      [payer, beneficiary, 15090000n, issued, "", word(6n), loans]
    )
  };
}
function receipt(received = 9429n, beneficiary = user, projectId = 6n) {
  return {
    address: controller,
    topics: encodeEventTopics({
      abi,
      eventName: "MintTokens",
      args: { beneficiary, projectId }
    }),
    data: encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "uint256" },
        { type: "string" },
        { type: "uint256" },
        { type: "address" }
      ],
      [9429n, received, "", 2500n, hook]
    )
  };
}
function processFee(beneficiary = user, projectId = 6n, address = terminal) {
  return {
    address,
    topics: encodeEventTopics({
      abi,
      eventName: "ProcessFee",
      args: { projectId, token: user, amount: 15090000n }
    }),
    data: encodeAbiParameters(
      [{ type: "bool" }, { type: "address" }, { type: "address" }],
      [false, beneficiary, loans]
    )
  };
}
function terminalFee(beneficiary = user, projectId = 1n) {
  return [
    pay(0n, terminal, beneficiary, projectId),
    { ...mint, topics: encodeEventTopics({ abi, eventName: "Mint", args: { projectId } }) },
    receipt(9429n, beneficiary, projectId),
    processFee(beneficiary)
  ];
}
function simulation(swaps = false, received = swaps ? 60874n : 9429n) {
  return [
    {
      calls: [
        {
          status: "0x1",
          logs: [pay(), swaps ? swap : mint, receipt(received)]
        }
      ]
    }
  ];
}
const result = (swaps = false) => analyzeFeeSimulation(simulation(swaps), opts);
describe("fee buyback execution evidence", () => {
  it("detects incident-shaped mint fallback even though the full loan succeeds", () => {
    expect(result()).toMatchObject({
      status: "fallback",
      fees: [{ projectId: 6n, received: 9429n, route: "fallback" }]
    });
  });
  it("uses beneficiary receipt after reserved splits, never gross swap output", () => {
    expect(
      analyzeFeeSimulation(simulation(true, 45655n), opts).fees[0].received
    ).toBe(45655n);
  });
  it("includes fees paid to another beneficiary and labels the actual recipient", () => {
    const s = simulation();
    s[0].calls[0].logs = [pay(0n, loans, owner), mint, receipt(9429n, owner)];
    const feeResult = analyzeFeeSimulation(s, opts);
    expect(feeResult).toMatchObject({
      status: "fallback",
      fees: [{ beneficiary: owner, received: 9429n, route: "fallback" }]
    });
    expect(feeReceipt({ ...feeResult.fees[0], received: 10n ** 18n })).toBe(
      "~1 project #6 tokens to 0x6666…6666"
    );
  });
  it("keeps separate beneficiaries and matches receipts to each fee recipient", () => {
    const s = simulation();
    s[0].calls[0].logs = [
      pay(), mint, receipt(12n),
      pay(0n, loans, owner), swap, receipt(99n), receipt(34n, owner)
    ];
    const { fees } = analyzeFeeSimulation(s, opts);
    expect(fees).toMatchObject([
      { beneficiary: user, received: 12n, route: "fallback" },
      { beneficiary: owner, received: 34n, route: "swap" }
    ]);
    expect(fees[0].key).not.toBe(fees[1].key);
  });
  it("does not use the viewer's receipt to verify another beneficiary's fee", () => {
    const s = simulation(true);
    s[0].calls[0].logs[0] = pay(7n, loans, owner);
    expect(analyzeFeeSimulation(s, opts)).toMatchObject({
      status: "unknown",
      fees: [{ beneficiary: owner, received: 7n, route: "unknown" }]
    });
  });
  it("reports ready only for successful nonzero swaps", () => {
    expect(result(true).status).toBe("ready");
  });
  it("handles partial fill plus leftover issuance as a successful buyback", () => {
    const s = simulation(true);
    s[0].calls[0].logs.splice(2, 0, mint);
    expect(analyzeFeeSimulation(s, opts).status).toBe("ready");
  });
  it("does not warn when the live pool cannot fill above the issuance price limit", () => {
    const s = simulation(true);
    s[0].calls[0].logs[1] = {
      ...swap,
      data: encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }, { type: "address" }],
        [15090000n, 0n, terminal]
      )
    };
    s[0].calls[0].logs.splice(2, 0, mint);
    expect(analyzeFeeSimulation(s, opts).status).toBe("none");
  });
  it("does not warn when direct issuance was selected", () => {
    const s = simulation();
    s[0].calls[0].logs = [pay(9429n)];
    expect(analyzeFeeSimulation(s, opts).status).toBe("none");
  });
  it("does not hide a ready source fee because another fee uses ordinary issuance", () => {
    const s = simulation(true);
    s[0].calls[0].logs.push(pay(123n));
    expect(analyzeFeeSimulation(s, opts).status).toBe("ready");
  });
  it("never promises more user tokens when all output is reserved", () => {
    expect(analyzeFeeSimulation(simulation(false, 0n), opts).status).toBe(
      "none"
    );
  });
  it("does not include rolled-back transactions or unrelated hooks", () => {
    const s = simulation();
    s[0].calls[0].status = "0x0";
    expect(analyzeFeeSimulation(s, opts).status).toBe("unknown");
    expect(
      analyzeFeeSimulation(simulation(), { ...opts, beneficiary: terminal }).fees
    ).toEqual(result().fees);
    expect(
      analyzeFeeSimulation(simulation(true), {
        ...opts,
        trustedHooks: [terminal]
      }).status
    ).not.toBe("ready");
  });
  it("does not mistake a user pay for a fee or consume its following mint events", () => {
    const s = simulation();
    s[0].calls[0].logs[0] = pay(0n, user);
    expect(analyzeFeeSimulation(s, opts).fees).toEqual([]);
  });
  it.each([user, owner])("detects a same-terminal internal fee for its actual beneficiary (%s)", (beneficiary) => {
    const s = simulation();
    s[0].calls[0].logs = terminalFee(beneficiary);
    expect(analyzeFeeSimulation(s, opts)).toMatchObject({
      status: "fallback",
      fees: [{ beneficiary, route: "fallback", received: 9429n }]
    });
  });
  it.each([1n, 6n])("does not label an ordinary terminal payout as a fee (project %s)", (projectId) => {
    const s = simulation();
    s[0].calls[0].logs = terminalFee(owner, projectId).slice(0, -1);
    expect(analyzeFeeSimulation(s, opts).fees).toEqual([]);
  });
  it("requires matching trusted ProcessFee proof for terminal payments", () => {
    for (const proof of [processFee(owner), processFee(user, 7n), processFee(user, 6n, owner)]) {
      const s = simulation();
      s[0].calls[0].logs = [...terminalFee().slice(0, -1), proof];
      expect(analyzeFeeSimulation(s, opts).fees).toEqual([]);
    }
  });
  it("keeps a warning when another fee successfully swaps", () => {
    const s = simulation();
    s[0].calls[0].logs.push(...simulation(true)[0].calls[0].logs);
    expect(analyzeFeeSimulation(s, opts).status).toBe("fallback");
  });
  it("does not use spoofed controller receipts or missing logs as readiness", () => {
    const s = simulation(true);
    s[0].calls[0].logs[2].address = user;
    expect(analyzeFeeSimulation(s, opts).status).toBe("unknown");
    expect(
      analyzeFeeSimulation([{ calls: [{ status: "0x1" }] }], opts).status
    ).toBe("unknown");
  });
  it.each([false, true])("requires a verified hook receipt even with direct issuance (swap: %s)", (swaps) => {
    const s = simulation(swaps);
    s[0].calls[0].logs = [pay(7n), swaps ? swap : mint];
    expect(analyzeFeeSimulation(s, opts)).toMatchObject({
      status: "unknown",
      fees: [{ received: 7n, route: "unknown" }]
    });
    s[0].calls[0].logs.push({ ...receipt(), address: owner });
    expect(analyzeFeeSimulation(s, opts).status).toBe("unknown");
    s[0].calls[0].logs.push(receipt());
    expect(analyzeFeeSimulation(s, opts)).toMatchObject({
      status: swaps ? "ready" : "fallback",
      fees: [{ received: 9436n, route: swaps ? "swap" : "fallback" }]
    });
  });
  it("treats malformed/unsupported RPC as unknown, never ready", async () => {
    const client = {
      request: vi.fn().mockRejectedValue(new Error("unsupported"))
    };
    expect(
      (await checkFeeBuyback(
        client,
        { from: user, to: loans, data: "0x" },
        opts
      )).status
    ).toBe("unknown");
    expect(analyzeFeeSimulation({}, opts).status).toBe("unknown");
  });
  it("simulates exact account/calldata/value on a pinned block with no balance or allowance overrides", async () => {
    const client = {
      request: vi.fn().mockResolvedValueOnce("0x123").mockResolvedValueOnce(simulation())
    };
    expect(
      (await checkFeeBuyback(
        client,
        { from: user, to: loans, data: "0x1234", value: 42n },
        opts
      )).status
    ).toBe("fallback");
    expect(client.request.mock.calls[1][0]).toEqual({
      method: "eth_simulateV1",
      params: [
        {
          blockStateCalls: [
            {
              calls: [
                {
                  from: user,
                  to: loans,
                  data: "0x1234",
                  value: "0x2a",
                  gas: "0x989680"
                }
              ]
            }
          ],
          validation: false
        },
        "0x123"
      ]
    });
  });
  it("times out a stalled provider so the user can retry or proceed explicitly", async () => {
    vi.useFakeTimers();
    try {
      const request = checkFeeBuyback(
        { request: () => new Promise(() => {
        }) },
        { from: user, to: loans, data: "0x" },
        opts
      );
      await vi.advanceTimersByTimeAsync(8001);
      expect((await request).status).toBe("unknown");
    } finally {
      vi.useRealTimers();
    }
  });
});
describe("live fee review", () => {
  it.each([[owner, 6n], [user, 7n]])("recovers when an unrelated earlier fee disappears (%s / %s)", async (beneficiary, projectId) => {
    const initial = simulation();
    initial[0].calls[0].logs.unshift(pay(5n, loans, beneficiary, projectId));
    const before = analyzeFeeSimulation(initial, opts);
    const after = result(true);
    const check = vi.fn().mockResolvedValueOnce(before).mockResolvedValue(after);
    const watch = createFeeWatch(check, vi.fn());
    expect((await watch.refresh()).status).toBe("fallback");
    expect((await watch.refresh()).status).toBe("ready");
    expect(await watch.confirm()).toBe(true);
    watch.stop();
  });
  it("retains separate occurrence IDs for repeated fees to the same beneficiary", () => {
    const s = simulation();
    s[0].calls[0].logs.push(...simulation(true)[0].calls[0].logs);
    const { fees } = analyzeFeeSimulation(s, opts);
    expect(fees[0].key).not.toBe(fees[1].key);
  });
  it("does not infer recovery when one of several identical fee identities disappears", async () => {
    const initial = simulation();
    initial[0].calls[0].logs.push(...simulation(true)[0].calls[0].logs);
    const check = vi.fn().mockResolvedValueOnce(analyzeFeeSimulation(initial, opts)).mockResolvedValue(result(true));
    const watch = createFeeWatch(check, vi.fn());
    expect((await watch.refresh()).status).toBe("fallback");
    expect((await watch.refresh()).status).toBe("unknown");
    watch.stop();
  });
  it("keeps an affected group's identity count after recovery and later growth", async () => {
    const expanded = simulation(true);
    expanded[0].calls[0].logs.push(...simulation(true)[0].calls[0].logs);
    const check = vi.fn()
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(analyzeFeeSimulation(expanded, opts))
      .mockResolvedValue(result(true));
    const watch = createFeeWatch(check, vi.fn());
    expect((await watch.refresh()).status).toBe("fallback");
    expect((await watch.refresh()).status).toBe("ready");
    expect((await watch.refresh()).status).toBe("unknown");
    watch.stop();
  });
  it("rechecks before confirmation and refuses a newly unfavorable result", async () => {
    const check = vi.fn().mockResolvedValueOnce(result(true)).mockResolvedValue(result());
    const watch = createFeeWatch(check, vi.fn());
    await watch.refresh();
    expect(await watch.confirm()).toBe(false);
    expect(await watch.confirm()).toBe(true);
    watch.stop();
  });
  it("never reports ready if a previously affected fee disappears", async () => {
    const check = vi.fn().mockResolvedValueOnce(result()).mockResolvedValue({ status: "none", fees: [] });
    const changed = vi.fn();
    const watch = createFeeWatch(check, changed);
    await watch.refresh();
    await watch.refresh();
    expect(changed.mock.lastCall?.[0].status).toBe("unknown");
    watch.stop();
  });
  it("requires an explicit choice when a ready estimate becomes unavailable", async () => {
    const check = vi.fn().mockResolvedValueOnce(result(true)).mockRejectedValue(new Error("RPC down"));
    const watch = createFeeWatch(check, vi.fn());
    await watch.refresh();
    expect(await watch.confirm()).toBe(false);
    expect(await watch.confirm()).toBe(true);
    watch.stop();
  });
  it("discards in-flight results after closing or changing the review", async () => {
    let resolve;
    const changed = vi.fn();
    const watch = createFeeWatch(
      () => new Promise((r) => {
        resolve = r;
      }),
      changed
    );
    const pending = watch.refresh();
    watch.stop();
    changed.mockClear();
    resolve(result());
    await pending;
    expect(changed).not.toHaveBeenCalled();
    expect(await watch.confirm()).toBe(false);
  });
});
