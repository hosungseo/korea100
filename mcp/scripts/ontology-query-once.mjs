import { fileURLToPath } from "node:url";

import { queryOntologyCase } from "../src/ontology-bridge.mjs";

const ontologyDir = fileURLToPath(new URL("../../ontology/", import.meta.url));
const q = process.argv.slice(2).join(" ").trim() || "부분공개 통지 왔는데 뭐 하면 됨?";
console.log(JSON.stringify(await queryOntologyCase(q, { ontologyDir }), null, 2));
