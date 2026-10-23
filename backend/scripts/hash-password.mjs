#!/usr/bin/env node
/**
 * Hash $DASHBOARD_PASSWORD to scrypt$<saltHex>$<hashHex>.
 * Usage: node scripts/hash-password.mjs /path/to/out.txt
 * Never prints the password. Prints only the output path and that writing succeeded.
 */
import { randomBytes, scryptSync } from "node:crypto";
import { writeFileSync } from "node:fs";

const outPath = process.argv[2] || "/tmp/wt_pw_hash.txt";
const pw = process.env.DASHBOARD_PASSWORD;
if (pw == null || pw.length === 0) {
  console.error("DASHBOARD_PASSWORD is not set");
  process.exit(1);
}
const salt = randomBytes(16);
const keylen = 64;
const derived = scryptSync(pw, salt, keylen, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const encoded = `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
writeFileSync(outPath, encoded, { mode: 0o600 });
console.log(`wrote_hash_file=${outPath} hash_len=${encoded.length}`);
