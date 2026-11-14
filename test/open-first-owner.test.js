import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/discover.js'), 'utf8');
const before = (first, second) => {
  const a = source.indexOf(first), b = source.indexOf(second, a);
  return a >= 0 && b > a;
};

// A click that starts reads answers at once: the control is held and says so before the first read.
// These flows have no DOM harness (their modals are not exported), so the order is checked in the source.
describe('owner, shop and Safe queue clicks answer before their reads', () => {
  it('holds the Safe queue Sign and Execute buttons while the fresh queue checks run, and restores them on cancel', () => {
    expect(before("signBtn.disabled = true; signBtn.textContent = 'Checking…';", "var before = await freshQueuedSafeTx(safe, c.id, tx, { signer: signerAccount, verifyAuthority: verifyAuthority });")).toBe(true);
    expect(source).toContain("if (!ok) { signBtn.disabled = false; signBtn.textContent = 'Sign'; return; }");
    expect(before("execBtn.disabled = true; execBtn.textContent = 'Checking…';", "var before = await freshQueuedSafeTx(safe, c.id, tx, { requireThreshold: true, requireCurrent: true, verifyAuthority: verifyAuthority });")).toBe(true);
    expect(source).toContain("if (!ok) { execBtn.disabled = false; execBtn.textContent = 'Execute'; return; }");
  });

  it('holds the item discount and remove buttons for the whole change and names the first read', () => {
    expect(source).toContain('busyWhile(dBtn, null, function () {');
    expect(source).toContain('busyWhile(rmBtn, null, function () {');
    expect(source.split("setStatus('Reading the live item…', 'pending');\n  var avail = selectedChains || shopChainsOf(project), resolved = await resolveHookMap(").length).toBe(3);
  });

  it('holds the free mint and redeem buttons while their permission and inventory reads run', () => {
    expect(before("submit.disabled = true; status.textContent = 'Checking permissions…';", 'var canMint = await accountCanMintShopOn(project, chainId, live.hook, account);')).toBe(true);
    expect(before("btn.disabled = true; status.textContent = 'Checking…';\n    try { await requireGenericInventory(", "catch (error) { status.textContent = errMessage(error); btn.disabled = false; return; }")).toBe(true);
  });

  it('says who-can-send is being checked before the shared owner path reads the authority', () => {
    expect(before("setStatus('Checking who can send this…', 'pending');", 'var safeInfo = await safeInfoForAuthority(authorityAddr, homeChainId, authorityChainId);')).toBe(true);
  });

  it('holds the place of the Execute all bar and of the project Safe choice while they are read', () => {
    expect(source).toContain("batchChecking.textContent = 'Checking what can execute together…'; batchBar.appendChild(batchChecking);");
    expect(source).toContain("choiceText.textContent = 'Checking for a project Safe…';");
    expect(source).toContain(".catch(function () { authorityChoice.hidden = true; }).then(function () { fromSafe.disabled = false; choiceText.textContent = 'Propose from the project Safe'; });");
  });
});
