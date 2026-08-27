import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

const require = createRequire(import.meta.url);
const { normalizeEmail, maskEmail, buildMarketingOtpMessage } = require("../functions/marketingEmailOtp.js");

test("Marketing OTP email is normalized, masked and addressed to the registered member", () => {
  assert.equal(normalizeEmail(" Member@Example.COM "), "member@example.com");
  assert.equal(maskEmail("member@example.com"), "me****@example.com");
  const message = buildMarketingOtpMessage("sender@gmail.com", "member@example.com", "123456", "Asha");
  assert.equal(message.to, "member@example.com");
  assert.match(message.text, /123456/);
  assert.match(message.text, /5 minutes/);
});

test("Marketing OTP accepts only six digits", () => {
  assert.throws(() => buildMarketingOtpMessage("sender@gmail.com", "member@example.com", "1234"), /6-digit/);
});

test("Marketing login contains email OTP and no SMS/mobile login provider", async () => {
  const [backend, login, legacyAdapter, packageJson] = await Promise.all([
    readFile(new URL("../functions/index.js", import.meta.url), "utf8"),
    readFile(new URL("../src/Auth/SecureLogin.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/Auth/UnifiedLogin.jsx", import.meta.url), "utf8"),
    readFile(new URL("../functions/package.json", import.meta.url), "utf8"),
  ]);
  assert.match(backend, /defineSecret\("EMAIL_PASS"\)/);
  assert.match(backend, /defineString\("EMAIL_NODEMAILER"/);
  assert.match(backend, /require\("nodemailer"\)/);
  assert.match(backend, /secrets: \[EMAIL_PASS\]/);
  assert.doesNotMatch(backend, /2factor\.in|TWOFACTOR_API/i);
  assert.match(login, /Send Email OTP/);
  assert.match(login, /Verify Email OTP/);
  assert.match(login, /\^\\d\{6\}\$/);
  assert.doesNotMatch(login, /Member mobile|Owner mobile|autoComplete="tel"/);
  assert.doesNotMatch(legacyAdapter, /mobile|SMS|OTP/);
  assert.match(packageJson, /nodemailer/);
});
