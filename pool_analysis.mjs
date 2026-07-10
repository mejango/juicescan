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
    console.log('  fee:', key.fee);
    console.log('  tickSpacing:', key.tickSpacing);
    console.log('  hooks:', key.hooks);

    // Verify the currency ordering
    const c0 = key.currency0.toLowerCase();
    const c1 = key.currency1.toLowerCase();
    const usdcLower = USDC_ADDR.toLowerCase();
    const artLower = ART_ADDR.toLowerCase();

    console.log('\nCurrency Mapping:');
    console.log('  currency0 is USDC:', c0 === usdcLower);
    console.log('  currency1 is ART:', c1 === artLower);
    const usdcIsC0 = c0 === usdcLower;
    const artIsC1 = c1 === artLower;

    // Step 2: Compute poolId and read slot0
    console.log('\n2. Computing poolId and reading slot0...');

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
    console.log('poolId:', poolId);

    // State slot is keccak256(abi.encode(poolId, uint256(6)))
    const stateSlot = keccak256(
      encodeAbiParameters(
        [{ type: 'bytes32' }, { type: 'uint256' }],
        [poolId, BigInt(6)]
      )
    );
    console.log('stateSlot:', stateSlot);

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
    console.log('\n3. Computing human price (USDC per ART)...');

    const sqrtPriceX96Num = Number(sqrtPriceX96);
    const sqrtP = sqrtPriceX96Num / Math.pow(2, 96);
    const rawPrice = sqrtP * sqrtP;

    console.log('sqrtP (sqrtPriceX96 / 2^96):', sqrtP);
    console.log('rawPrice (sqrtP^2):', rawPrice);

    // If USDC is currency0 (token0) and ART is currency1 (token1):
    // rawPrice = token1/token0 = ART/USDC (in raw units)
    // Human price USDC/ART = 1 / (rawPrice * 10^(dec1-dec0))
    //                        = 1 / (rawPrice * 10^(18-6))
    //                        = 1 / (rawPrice * 10^12)

    let humanPrice;
    if (usdcIsC0 && artIsC1) {
      // USDC = token0, ART = token1
      // rawPrice = token1/token0 = ART/USDC in raw decimal units
      humanPrice = 1 / (rawPrice * Math.pow(10, ART_DECIMALS - USDC_DECIMALS));
      console.log('Price formula: USDC/ART = 1 / (rawPrice * 10^12)');
    } else if (artIsC0 && usdcIsC1) {
      // ART = token0, USDC = token1
      // rawPrice = token1/token0 = USDC/ART in raw decimal units
      humanPrice = rawPrice * Math.pow(10, USDC_DECIMALS - ART_DECIMALS);
      console.log('Price formula: USDC/ART = rawPrice * 10^(-12)');
    } else {
      console.log('ERROR: Unexpected currency ordering!');
      process.exit(1);
    }

    console.log('Human price (USDC per ART):', humanPrice);
    console.log('Expected ~0.0016, actual:', humanPrice.toFixed(6));

    // Step 4: Get liquidity amounts for the range [0.0001, 0.0016]
    console.log('\n4. Computing tick boundaries for price range [0.0001, 0.0016] USDC/ART...');

    // Price range in human terms: USDC/ART from 0.0001 to 0.0016
    // These are HUMAN prices (with decimals accounted for)

    // For a Uniswap V4 pool, tick = log_{1.0001}(sqrtPrice) where sqrtPrice = sqrt(token1/token0 in raw units)
    // In human terms: USDC/ART = price0, tick = log_{1.0001}(sqrt(rawPrice)) where rawPrice is in raw decimals

    // If USDC is token0 and ART is token1:
    //   raw price = token1/token0 = ART/USDC (in raw units) = humanPrice(USDC/ART) * 10^12
    //   sqrtPrice = sqrt(rawPrice)
    //   tick = log_{1.0001}(sqrtPrice)

    // For price range [0.0001, 0.0016] USDC/ART:
    //   lower: USDC/ART = 0.0001 => raw price = 0.0001 * 10^12 => sqrtPrice = sqrt(0.0001 * 10^12)
    //   upper: USDC/ART = 0.0016 => raw price = 0.0016 * 10^12 => sqrtPrice = sqrt(0.0016 * 10^12)

    const priceLower = 0.0001;  // USDC per ART
    const priceUpper = 0.0016;  // USDC per ART

    console.log('Price range (USDC per ART): [', priceLower, ',', priceUpper, ']');

    // Compute raw prices
    const rawPriceLower = priceLower * Math.pow(10, ART_DECIMALS - USDC_DECIMALS);
    const rawPriceUpper = priceUpper * Math.pow(10, ART_DECIMALS - USDC_DECIMALS);

    console.log('Raw price range (token1/token0): [', rawPriceLower, ',', rawPriceUpper, ']');

    // Compute sqrtPrices
    const sqrtPriceLower = Math.sqrt(rawPriceLower);
    const sqrtPriceUpper = Math.sqrt(rawPriceUpper);

    console.log('sqrt(rawPrice) range: [', sqrtPriceLower, ',', sqrtPriceUpper, ']');

    // Compute ticks: tick = log_{1.0001}(sqrtPrice)
    const TICK_BASE = 1.0001;
    const tickLower = Math.round(Math.log(sqrtPriceLower) / Math.log(TICK_BASE));
    const tickUpper = Math.round(Math.log(sqrtPriceUpper) / Math.log(TICK_BASE));

    console.log('Tick range: [', tickLower, ',', tickUpper, ']');

    // Current sqrtPrice and tick
    const currentSqrtPrice = sqrtP;
    const currentTick = tick;
    console.log('Current sqrtPrice:', currentSqrtPrice);
    console.log('Current tick:', currentTick);

    console.log('\n5. Position analysis at current price:');
    console.log('Is current price at or above upper tick?', currentSqrtPrice >= sqrtPriceUpper);
    console.log('Is current price at or below lower tick?', currentSqrtPrice <= sqrtPriceLower);
    console.log('Is current price within range?', currentSqrtPrice > sqrtPriceLower && currentSqrtPrice < sqrtPriceUpper);

    // For concentrated liquidity at specific price:
    // If price >= upper: position is single-sided in token0 (USDC only)
    // If price <= lower: position is single-sided in token1 (ART only)
    // If price in range: position has both tokens

    // Since current price equals priceUpper (0.0016 USDC/ART):
    // The position should be at its upper boundary, meaning it should be single-sided in token0 (USDC)

    if (Math.abs(currentSqrtPrice - sqrtPriceUpper) < sqrtPriceUpper * 0.001) {
      console.log('STATUS: Current price equals/near UPPER boundary (max USDC/ART price)');
      console.log('EXPECTATION: Position should be SINGLE-SIDED in token0 (USDC only)');
      console.log('ART amount should be 0, USDC amount should be non-zero');
    } else if (Math.abs(currentSqrtPrice - sqrtPriceLower) < sqrtPriceLower * 0.001) {
      console.log('STATUS: Current price equals/near LOWER boundary');
      console.log('EXPECTATION: Position should be SINGLE-SIDED in token1 (ART only)');
    } else if (currentSqrtPrice > sqrtPriceLower && currentSqrtPrice < sqrtPriceUpper) {
      console.log('STATUS: Current price is WITHIN the range');
      console.log('EXPECTATION: Position has both USDC and ART');
    } else {
      console.log('STATUS: Current price is OUTSIDE the range');
    }

    console.log('\n6. INTERPRETATION FOR THE BUG:');
    console.log('Pool: currency0 = USDC (token0), currency1 = ART (token1)');
    console.log('Current price:', humanPrice.toFixed(6), 'USDC per ART');
    console.log('Price range:', priceLower, '-', priceUpper, 'USDC/ART');
    console.log('At price', priceUpper, '(top of range):');
    console.log('  ACTUAL REALITY: Should take USDC, NOT ART');
    console.log('  BUG IN CODE: lpCounterpart assumes tok=token0, pair=token1');
    console.log('  But here: ART=token1 (correct assumption), USDC=token0 (PAIR)');
    console.log('  So if input is ART (tok), it returns USDC, BUT ART is NOT token0!');
    console.log('  The formula is INVERTED.');

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

main();
