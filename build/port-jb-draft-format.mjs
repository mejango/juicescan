// Regenerate src/jb-draft-format.js and its vectors from a juice-sdk-v4 checkout:
//   node build/port-jb-draft-format.mjs <path to juice-sdk-v4/packages/core>
// Juicescan takes no SDK. The format is the SDK's to define, so its module is copied here with
// the types removed, and test/jb-draft-format.test.js holds the copy to the SDK's vectors.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const core = process.argv[2];
if (!core) throw new Error('Pass the path to juice-sdk-v4/packages/core.');
const source = readFileSync(join(core, 'src/v6/jbDraft.ts'), 'utf8');
const header = `// The \`.jb\` launch draft format, version 2, as juice-sdk-v4 defines it in
// packages/core/src/v6/jbDraft.ts. Juicescan takes no SDK, so this file is that module with
// its types removed. Do not edit it: change the format in the SDK, then run
// build/port-jb-draft-format.mjs. test/jb-draft-format.test.js runs the SDK's vectors on it.
`;
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: 'ES2022', module: 'ESNext' } });
writeFileSync(new URL('../src/jb-draft-format.js', import.meta.url), header + outputText);
copyFileSync(join(core, 'src/v6/jbDraft.vectors.json'), new URL('../test/fixtures/jb-draft-vectors.json', import.meta.url));
console.log('Ported the .jb draft format and its vectors.');
