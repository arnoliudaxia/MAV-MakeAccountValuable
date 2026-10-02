import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const N = 16_384;
const R = 8;
const P = 1;
const MAXMEM = 32 * 1024 * 1024;

function readHidden(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    process.stdout.write(`${prompt} `);
    return new Promise((resolve, reject) => {
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", chunk => {
        input += chunk;
      });
      process.stdin.on("end", () => resolve(input.replace(/\r?\n$/, "")));
      process.stdin.on("error", reject);
    });
  }

  return new Promise((resolve, reject) => {
    let input = "";
    const onData = chunk => {
      for (const character of String(chunk)) {
        if (character === "\u0003") {
          cleanup();
          process.stdout.write("\n");
          reject(new Error("已取消"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(input);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          input = input.slice(0, -1);
        } else {
          input += character;
        }
      }
    };
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };

    process.stdout.write(`${prompt} `);
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

const password = await readHidden("Password:");
const confirmation = await readHidden("Confirm password:");
if (!password || password !== confirmation) {
  console.error("Passwords are empty or do not match.");
  process.exitCode = 1;
} else {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });
  const hash = [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64url"),
    Buffer.from(derivedKey).toString("base64url"),
  ].join("$");

  console.log("\nAUTH_PASSWORD_HASH (copy this value into .env; plaintext is never written):");
  console.log(hash);
}
