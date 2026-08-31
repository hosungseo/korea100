import { fileURLToPath } from "node:url";

import { queryOntologyCase, DEFAULT_CASE_FILE } from "../src/ontology-bridge.mjs";

const ontologyDir = fileURLToPath(new URL("../../ontology/", import.meta.url));

const argv = process.argv.slice(2);
let caseFile = DEFAULT_CASE_FILE;
const words = [];
for (let index = 0; index < argv.length; index += 1) {
  if (argv[index] === "--case") {
    caseFile = argv[index + 1];
    index += 1;
    continue;
  }
  words.push(argv[index]);
}

const query = words.join(" ").trim() || "부분공개 통지 왔는데 뭐 하면 됨?";
console.log(JSON.stringify(await queryOntologyCase(query, { ontologyDir, caseFile }), null, 2));
