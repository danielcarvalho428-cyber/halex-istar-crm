const assert = require("node:assert/strict");
const test = require("node:test");
const { isValidNfeAccessKey, parseNfePdfIdentity } = require("./nfe-document.cjs");

const accessKey = "52260601571702000198550020004654761880555810";

test("extracts the NF number from a valid DANFE access key", () => {
  assert.equal(isValidNfeAccessKey(accessKey), true);
  const result = parseNfePdfIdentity(
    `${accessKey}.pdf`,
    `NF-e 000465476\n${accessKey}\nPEDIDO: 655803025 1 |`,
  );
  assert.equal(result.identity.invoiceNumber, "465476");
  assert.equal(result.identity.customerOrderNumber, "655803025 1");
  assert.deepEqual(result.issues, []);
});

test("uses an NF filename only as a review-required fallback", () => {
  const result = parseNfePdfIdentity("NF 000123456.pdf", "documento sem chave");
  assert.equal(result.identity.invoiceNumber, "123456");
  assert.equal(result.issues.length, 1);
});
