import { build } from "../_lib/gen.mjs";
await build(import.meta.url, { png: process.argv.includes("--png") });
