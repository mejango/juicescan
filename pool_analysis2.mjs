import { createPublicClient, http, keccak256, encodeAbiParameters } from 'viem';

const CHAIN_ID = 84532;
const RPC_URL = 'https://sepolia.base.org';
const HOOK_ADDR = '0x77bEe1AD2AC0AcE98a9b5B58D75685c8b4d94948';
const POOL_MANAGER_ADDR = '0x05e73354cfdd6745c338b50bcfdfa3aa6fa03408';
const PROJECT_ID = 6;
const USDC_ADDR = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const ART_ADDR = '0xC48A486dA5257AE506Ee4cDdEb4bCd2A44e6a9E0';

const USDC_DECIMALS = 6;
const ART_DECIMALS = 18;

const extsloadAbi = [
  {
    type: 'function',
    name: 'extsload',
    stateMutability: 'view',
    inputs: [{ name: 'slot', type: 'bytes32' }],
    outputs: [{ type: 'bytes32' }],
  },
];

const poolKeyOfAbi = [
  {
    type: 'function',
    name: 'poolKeyOf',
    stateMutability: 'view',
    inputs: [
      { name: 'projectId', type: 'uint256' },
      { name: 'terminalToken', type: 'address' },
    ],
    outputs: [
      {
        name: 'key',
        type: 'tuple',
        components: [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'hooks', type: 'address' },
        ],
      },
    ],
  },
];

async function main() {
  const client = createPublicClient({
    chain: { id: CHAIN_ID },
    transport: http(RPC_URL),
  });

  try {
    console.log('\n=== POOL STATE ANALYSIS FOR PROJECT 6 (ART) ON BASE SEPOLIA ===\n');

    // Step 1: Read the pool key
    console.log('1. Reading pool key from hook...');
    const key = await client.readContract({
      address: HOOK_ADDR,
      abi: poolKeyOfAbi,
      functionName: 'poolKeyOf',
      args: [BigInt(PROJECT_ID), USDC_ADDR],
    });

    console.log('Pool Key:');
    console.log('  currency0:', key.currency0);
    console.log('  currency1:', key.currency1);

    // Verify the currency ordering
    const c0 = key.currency0.toLowerCase();
    const c1 = key.currency1.toLowerCase();
    const usdcLower = USDC_ADDR.toLowerCase();
    const artLower = ART_ADDR.toLowerCase();

    console.log('\nCurrency Mapping:');
    console.log('  USDC is currency0:', c0 === usdcLower);
    console.log('  ART is currency1:', c1 === artLower);

    // Step 2: Compute poolId and read slot0
    console.log('\n2. Reading slot0 from pool...');

    const POOLKEY_TUPLE = [
      {
        type: 'tuple',
        components: [
          { type: 'address' },
          { type: 'address' },
          { type: 'uint24' },
          { type: 'int24' },
          { type: 'address' },
        ],
      },
    ];

    const poolId = keccak256(
      encodeAbiParameters(POOLKEY_TUPLE, [
        [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
      ])
    );

    // State slot is keccak256(abi.encode(poolId, uint256(6)))
    const stateSlot = keccak256(
      encodeAbiParameters(
        [{ type: 'bytes32' }, { type: 'uint256' }],
        [poolId, BigInt(6)]
      )
    );

    // Read slot0 via extsload
    const slot0Raw = await client.readContract({
      address: POOL_MANAGER_ADDR,
      abi: extsloadAbi,
      functionName: 'extsload',
      args: [stateSlot],
    });

    console.log('slot0Raw:', slot0Raw);

    // Extract sqrtPriceX96 (bits 0..159)
    const sqrtPriceX96 = BigInt(slot0Raw) & ((1n << 160n) - 1n);
    console.log('sqrtPriceX96:', sqrtPriceX96.toString());

    // Extract tick (bits 160..183, signed int24)
    const tickRaw = (BigInt(slot0Raw) >> 160n) & ((1n << 24n) - 1n);
    const tick = tickRaw & 0x800000n ? Number(tickRaw - 0x1000000n) : Number(tickRaw);
    console.log('tick:', tick);

    // Step 3: Compute human price
    console.log('\n3. Computing human price...');

    // sqrtPriceX96 is a Q64.96 fixed-point number
    // sqrtPrice = sqrtPriceX96 / 2^96
    // price = sqrtPrice^2 = (sqrtPriceX96 / 2^96)^2 = sqrtPriceX96^2 / 2^192

    // This price is token1/token0 in RAW decimal units
    // Since USDC is token0 (6 decimals) and ART is token1 (18 decimals):
    // raw price = (amount of token1 in 1 wei of token0) = ART/USDC in raw units

    // Human-readable price = raw_price * 10^(decimals0 - decimals1)
    //                      = (ART/USDC raw) * 10^(6 - 18)
    //                      = (ART/USDC raw) * 10^(-12)

    // But we want USDC/ART, so:
    // USDC/ART = 1 / (ART/USDC raw) * 10^(-12)
    //          = 10^(-12) / (ART/USDC raw)

    // Let's use BigInt for precision
    const sqrtP_bi = sqrtPriceX96;
    const sqrtP_num = Number(sqrtP_bi);

    // price_raw = sqrtP^2 = (sqrtPriceX96 / 2^96)^2
    const sqrtP = sqrtP_num / Math.pow(2, 96);
    const priceRaw = sqrtP * sqrtP;

    console.log('sqrtPrice (sqrtPriceX96 / 2^96):', sqrtP);
    console.log('price_raw (token1/token0, raw decimals):', priceRaw);

    // Conversion to human-readable price
    // raw price is ART/USDC in raw decimal units
    // We want USDC/ART in human-readable units
    // USDC/ART_human = 1 / (ART/USDC_raw) / 10^(dec_ART - dec_USDC)
    //                = 10^(6-18) / (ART/USDC_raw)
    //                = 10^(-12) / priceRaw

    let humanPriceUsdcPerArt = Math.pow(10, USDC_DECIMALS - ART_DECIMALS) / priceRaw;

    console.log('\nHuman price (USDC per ART):', humanPriceUsdcPerArt);
    console.log('Formatted:', humanPriceUsdcPerArt.toFixed(8));

    // The inverse would be ART/USDC
    let humanPriceArtPerUsdc = priceRaw * Math.pow(10, ART_DECIMALS - USDC_DECIMALS);
    console.log('Human price (ART per USDC):', humanPriceArtPerUsdc);
    console.log('Formatted:', humanPriceArtPerUsdc.toFixed(2));

    // Step 4: Range analysis
    console.log('\n4. Price range analysis...');

    // The expected range is [0.0001, 0.0016] USDC/ART
    const priceLowerHuman = 0.0001;  // USDC per ART
    const priceUpperHuman = 0.0016;  // USDC per ART

    // Convert to raw prices (in raw decimal units)
    // raw = human / 10^(dec0 - dec1) = human / 10^(-12) = human * 10^12
    const priceLowerRaw = priceLowerHuman * Math.pow(10, ART_DECIMALS - USDC_DECIMALS);
    const priceUpperRaw = priceUpperHuman * Math.pow(10, ART_DECIMALS - USDC_DECIMALS);

    console.log('Expected range (USDC/ART):', priceLowerHuman, 'to', priceUpperHuman);
    console.log('Expected range (raw):', priceLowerRaw, 'to', priceUpperRaw);
    console.log('Current price (raw):', priceRaw);

    // Compute ticks from prices
    // tick = log_{1.0001}(sqrtPrice)
    // sqrtPrice = sqrt(price_raw)
    const sqrtPriceLower = Math.sqrt(priceLowerRaw);
    const sqrtPriceUpper = Math.sqrt(priceUpperRaw);
    const sqrtPriceCurrent = Math.sqrt(priceRaw);

    console.log('\nsqrtPrice for lower:', sqrtPriceLower);
    console.log('sqrtPrice for upper:', sqrtPriceUpper);
    console.log('sqrtPrice current:', sqrtPriceCurrent);

    const TICK_BASE = 1.0001;
    const tickLower = Math.round(Math.log(sqrtPriceLower) / Math.log(TICK_BASE));
    const tickUpper = Math.round(Math.log(sqrtPriceUpper) / Math.log(TICK_BASE));

    console.log('\nTick for lower:', tickLower);
    console.log('Tick for upper:', tickUpper);
    console.log('Tick current:', tick);

    // Step 5: Position analysis
    console.log('\n5. Position liquidity analysis...');

    if (priceRaw >= priceUpperRaw) {
      console.log('Current price is AT or ABOVE the upper boundary');
      console.log('=> Position is single-sided in token0 (USDC)');
      console.log('=> Buying ART would require NO USDC (all position is USDC, ART = 0)');
    } else if (priceRaw <= priceLowerRaw) {
      console.log('Current price is AT or BELOW the lower boundary');
      console.log('=> Position is single-sided in token1 (ART)');
      console.log('=> Buying ART would require MORE ART only');
    } else {
      console.log('Current price is WITHIN the range');
      console.log('=> Position has both tokens');
    }

    console.log('\n6. KEY FINDING:');
    console.log('Pool structure:');
    console.log('  - currency0 (token0) = USDC (6 decimals)');
    console.log('  - currency1 (token1) = ART (18 decimals)');
    console.log('\nDiscovery conventions:');
    console.log('  - "tok" = ART (project token)');
    console.log('  - "pair" = USDC (accounting/pair token)');
    console.log('  - driverIsEth means "input is ART", returns USDC');
    console.log('\nCurrent lpCounterpart formula assumes:');
    console.log('  - tok = token0');
    console.log('  - pair = token1');
    console.log('\nREALITY:');
    console.log('  - ART (tok) = token1 ✓');
    console.log('  - USDC (pair) = token0 ✗ (should be token1)');
    console.log('\nBUG: The formula is backwards for this pool!');
    console.log('     Input ART → should return USDC');
    console.log('     But formula treats ART as token0 and USDC as token1');

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

main();
