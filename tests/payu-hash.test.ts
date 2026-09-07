/**
 * PayU hash unit tests against the real payuService exports.
 * Sets test merchant env before importing config-bound helpers.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.PAYU_USE_TEST = "true";
process.env.PAYU_MERCHANT_KEY = "gtKFFx";
process.env.PAYU_MERCHANT_SALT = "eCwWELxi";
process.env.PAYMENT_PROVIDER = "payu";

import { describe, expect, test } from "bun:test";
import crypto from "crypto";
import {
  amountsEqual,
  buildPaymentHash,
  formatPayuAmount,
  generateTxnId,
  verifyResponseHash,
} from "../src/core/payuService";

const sha512 = (value: string) =>
  crypto.createHash("sha512").update(value).digest("hex").toLowerCase();

describe("PayU hash formulas (payuService)", () => {
  const key = "gtKFFx";
  const salt = "eCwWELxi";
  const txnid = "t6svtqtjRdl4ws";
  const amount = "10.00";
  const productinfo = "iPhone";
  const firstname = "Ashish";
  const email = "test@gmail.com";

  test("buildPaymentHash matches documented sequence", () => {
    const hash = buildPaymentHash({
      key,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      salt,
    });

    const manual = sha512(
      `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|||||||||||${salt}`,
    );
    expect(hash).toBe(manual);
    expect(hash).toHaveLength(128);
  });

  test("buildPaymentHash includes udfs when present", () => {
    const hash = buildPaymentHash({
      key,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      udf1: "web",
      udf2: "PRODUCT",
      udf3: "order-1",
      salt,
    });

    const manual = sha512(
      `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|web|PRODUCT|order-1||||||||${salt}`,
    );
    expect(hash).toBe(manual);
  });

  test("verifyResponseHash accepts valid reverse hash", () => {
    const status = "success";
    const correct = sha512(
      [
        salt,
        status,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        email,
        firstname,
        productinfo,
        amount,
        txnid,
        key,
      ].join("|"),
    );

    expect(
      verifyResponseHash({
        hash: correct,
        status,
        email,
        firstname,
        productinfo,
        amount,
        txnid,
        key,
      }),
    ).toBe(true);
  });

  test("verifyResponseHash rejects tampered amount", () => {
    const status = "success";
    const correct = sha512(
      [
        salt,
        status,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        email,
        firstname,
        productinfo,
        amount,
        txnid,
        key,
      ].join("|"),
    );

    expect(
      verifyResponseHash({
        hash: correct,
        status,
        email,
        firstname,
        productinfo,
        amount: "999.00",
        txnid,
        key,
      }),
    ).toBe(false);
  });

  test("formatPayuAmount is two-decimal string", () => {
    expect(formatPayuAmount(499)).toBe("499.00");
    expect(formatPayuAmount(10.5)).toBe("10.50");
  });

  test("amountsEqual tolerates string/number", () => {
    expect(amountsEqual("10.00", 10)).toBe(true);
    expect(amountsEqual("10.00", "10.01")).toBe(false);
  });

  test("generateTxnId respects length and charset", () => {
    const id = generateTxnId("ord");
    expect(id.length).toBeLessThanOrEqual(25);
    expect(/^[a-zA-Z0-9]+$/.test(id)).toBe(true);
  });
});
