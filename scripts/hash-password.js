// Usage: node scripts/hash-password.js [password]
//   or:  node scripts/hash-password.js   (prompts interactively)

import bcrypt from "bcrypt";
import readline from "readline";

const COST = 12;
const arg = process.argv[2];

async function hash(password) {
  const h = await bcrypt.hash(password, COST);
  console.log("\nHash:", h, "\n");
}

if (arg) {
  hash(arg);
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question("Password: ", async (pw) => {
    rl.close();
    await hash(pw);
  });
}
