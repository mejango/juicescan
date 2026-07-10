// Let's trace through the discover.js logic to understand how it should work

const USDC_DECIMALS = 6;
const ART_DECIMALS = 18;

// From discover.js, line 14761-14763:
// var sp = Number(sqrtP) / Math.pow(2, 96), rawP = sp * sp;
// var rawRatio = pairIsC0 ? (rawP > 0 ? 1 / rawP : 0) : rawP;
// var poolPrice = rawRatio * Math.pow(10, 18 - pairDec);

// Let's see what the actual logic is
const sqrtPriceX96 = 1980375347829951738369254130786249142n;
const sqrtP_num = Number(sqrtPriceX96);
const sp = sqrtP_num / Math.pow(2, 96);
const rawP = sp * sp;

console.log('sqrtP:', sp);
console.log('rawP:', rawP);

// In discover.js:
// pairIsC0 = ((key.currency0 || '').toLowerCase() === pair.addr);
// For our case: currency0 = USDC, pair.addr = USDC
// So pairIsC0 = true

// Therefore:
// rawRatio = pairIsC0 ? (rawP > 0 ? 1 / rawP : 0) : rawP;
//          = 1 / rawP (since rawP > 0)

const pairIsC0 = true;
const rawRatio = pairIsC0 ? (rawP > 0 ? 1 / rawP : 0) : rawP;

console.log('pairIsC0:', pairIsC0);
console.log('rawRatio:', rawRatio);

// poolPrice = rawRatio * Math.pow(10, 18 - pairDec);
// where pairDec = pair.decimals = USDC_DECIMALS = 6

const pairDec = USDC_DECIMALS;
const poolPrice = rawRatio * Math.pow(10, 18 - pairDec);

console.log('poolPrice (from discover.js formula):', poolPrice);
console.log('poolPrice formatted:', poolPrice.toFixed(8));

// This should be the price in the pair-per-token terms
// pair = USDC, token = ART
// So poolPrice should be USDC per ART

console.log('\n=== UNDERSTANDING THE BUG ===');
console.log('lpCounterpart assumes:');
console.log('  p / pa / pb = PAIR-per-TOK');
console.log('  tok = token0, pair = token1');
console.log('  But actually:');
console.log('    token0 = USDC (pair)');
console.log('    token1 = ART (tok)');
console.log('  This means the formula ASSUMES the opposite!');
console.log('');
console.log('When the user inputs ART (drives tok):');
console.log('  The formula thinks: input token0, return token1');
console.log('  But actually: ART is token1, should return token0 (USDC)');
console.log('  So the formula backwards!');
