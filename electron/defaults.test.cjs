const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const defaultsDirectory = path.join(__dirname, "defaults");
const referenceData = require("./defaults/reference-data.json");

test("packaged defaults contain shared catalog data without private CRM fields", () => {
  assert.equal(referenceData.formatVersion, 1);
  assert.ok(referenceData.products.length > 0);
  assert.ok(referenceData.priceTable.items.length > 0);
  assert.ok(referenceData.salesPriceTable.products.length > 0);

  const forbiddenKeys = new Set([
    "address",
    "client",
    "clients",
    "contact",
    "contacts",
    "document",
    "email",
    "phone",
    "purchases",
    "quotation",
    "quotations",
    "settings",
  ]);
  const foundKeys = [];
  const emailValues = [];

  function inspect(value, location = "root") {
    if (Array.isArray(value)) {
      value.forEach((item, index) => inspect(item, `${location}[${index}]`));
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (forbiddenKeys.has(key)) foundKeys.push(`${location}.${key}`);
        inspect(child, `${location}.${key}`);
      }
      return;
    }
    if (typeof value === "string" && value.includes("@")) {
      emailValues.push(location);
    }
  }

  inspect(referenceData);
  assert.deepEqual(foundKeys, []);
  assert.deepEqual(emailValues, []);
});

test("packaged defaults include the corporate letterhead image", () => {
  const letterhead = path.join(defaultsDirectory, "letterhead.png");
  assert.ok(fs.statSync(letterhead).size > 1000);
});
