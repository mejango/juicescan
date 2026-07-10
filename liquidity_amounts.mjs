// Uniswap V4 liquidity mathematics
// getAmountsForLiquidity from @uniswap/v4-core

const USDC_DECIMALS = 6;
const ART_DECIMALS = 18;

// Current pool state
const sqrtPriceX96 = 1980375347829951738369254130786249142n;
const sqrtP_num = Number(sqrtPriceX96);
const sqrtP = sqrtP_num / Math.pow(2, 96);

console.log('Current sqrtP:', sqrtP);
console.log('Current price (ART/USDC raw):', sqrtP * sqrtP);

// For the range [0.0001, 0.0016] USDC/ART
const priceLowerHuman = 0.0001;  // USDC per ART
const priceUpperHuman = 0.0016;  // USDC per ART

// Convert to raw prices
const priceLowerRaw = priceLowerHuman * Math.pow(10, ART_DECIMALS - USDC_DECIMALS);
const priceUpperRaw = priceUpperHuman * Math.pow(10, ART_DECIMALS - USDC_DECIMALS);

// sqrtPrices
const sqrtPriceLower = Math.sqrt(priceLowerRaw);
const sqrtPriceUpper = Math.sqrt(priceUpperRaw);

console.log('\nRange analysis:');
console.log('Lower price (human USDC/ART):', priceLowerHuman);
console.log('Upper price (human USDC/ART):', priceUpperHuman);
console.log('Current price (human USDC/ART):', 0.0016005312);
console.log('Current price is AT the upper boundary!');

// Since current price equals upper boundary:
// The liquidity position should be single-sided in token0 (USDC)

console.log('\n=== LIQUIDITY COMPOSITION AT UPPER BOUNDARY ===');
console.log('At price =', sqrtPriceUpper, 'and above:');
console.log('  amount0 (USDC) > 0');
console.log('  amount1 (ART) = 0');
console.log('');
console.log('The position is SINGLE-SIDED in USDC!');

// Now test lpCounterpart formula
console.log('\n=== TESTING lpCounterpart FORMULA ===');

function lpCounterpart(amount, driverIsEth, p, pa, pb) {
  if (!(amount > 0) || !(p > 0) || !(pa > 0) || !(pb > pa)) return null;
  var sp = Math.sqrt(p), sa = Math.sqrt(pa), sb = Math.sqrt(pb);
  if (p <= pa) return driverIsEth ? null : 0;   // all token: no ETH side
  if (p >= pb) return driverIsEth ? 0 : null;   // all ETH: no token side
  if (driverIsEth) {
    var L = amount / (sp - sa);
    return L * (1 / sp - 1 / sb); // token amount
  }
  var Lx = amount / (1 / sp - 1 / sb);
  return Lx * (sp - sa); // ETH amount
}

// In discover.js convention:
// p = poolPrice = USDC per ART = 0.0016
// pa = floor price = 0.0001
// pb = ceiling price = 0.0016
// driverIsEth = true means "input is ART (tok)", return USDC (pair)
// driverIsEth = false means "input is USDC (pair)", return ART (tok)

const p = 0.0016005312;  // USDC per ART (current)
const pa = 0.0001;       // floor
const pb = 0.0016;       // ceiling

console.log('lpCounterpart(100 ART, driverIsEth=true, p='+ p +', pa='+ pa +', pb='+ pb +'):');
const result1 = lpCounterpart(100, true, p, pa, pb);
console.log('  Result:', result1);
console.log('  Interpretation: If I input 100 ART, get', result1, 'USDC');

console.log('\nlpCounterpart(1 USDC, driverIsEth=false, p='+ p +', pa='+ pa +', pb='+ pb +'):');
const result2 = lpCounterpart(1, false, p, pa, pb);
console.log('  Result:', result2);
console.log('  Interpretation: If I input 1 USDC, get', result2, 'ART');

// Analysis
console.log('\n=== WHAT THE BUG IS ===');
console.log('The formula assumes:');
console.log('  - p is always PAIR per TOK');
console.log('  - When driverIsEth=true: input TOK (token0), return PAIR (token1)');
console.log('  - When driverIsEth=false: input PAIR (token1), return TOK (token0)');
console.log('');
console.log('But in the pool:');
console.log('  - token0 = USDC (PAIR) - NOT TOK');
console.log('  - token1 = ART (TOK) - NOT PAIR');
console.log('');
console.log('So when user inputs ART (the TOK):');
console.log('  - Code treats it as token0 and returns something as token1');
console.log('  - But ART IS token1, should return token0');
console.log('  - Formula is completely inverted!');
console.log('');
console.log('AT THE BOUNDARY:');
console.log('  - Current price = upper price = 0.0016 USDC/ART');
console.log('  - lpCounterpart(any ART) returns:', result1, '(should be 0)');
console.log('  - lpCounterpart(any USDC) returns:', result2, '(should be non-zero or something sensible)');
console.log('  - The position at this boundary should be USDC-only');
console.log('  - But the formula gives backwards result!');
