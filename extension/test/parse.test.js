const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSearchResults } = require("../parse.js");
const sample = require("./fixtures/search-page-1.json");

test("extracts project number, title and agency from the recorded page", () => {
  const rows = parseSearchResults(sample);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    projectCode: "69099314442",
    title: sample.data[0].projectName,
    agency: "สำนักงานพัฒนาระบบสารสนเทศดิจิทัล",
  });
});

test("returns [] for anything that is not the expected shape, never throws", () => {
  for (const bad of [undefined, null, 5, "x", [], {}, { data: null }, { data: "x" }, { data: [null, 5, "x"] }]) {
    assert.deepEqual(parseSearchResults(bad), []);
  }
});

test("skips rows whose projectId is not an 11-digit number and keeps the good ones", () => {
  const rows = parseSearchResults({ data: [{ projectId: "123", projectName: "a" }, { projectId: "69099314442", projectName: "b", deptSubName: "c" }] });
  assert.deepEqual(rows, [{ projectCode: "69099314442", title: "b", agency: "c" }]);
});

test("tolerates missing title/agency", () => {
  assert.deepEqual(parseSearchResults({ data: [{ projectId: "69099314442" }] }), [{ projectCode: "69099314442", title: "", agency: "" }]);
});

test("truncates title to 200 and agency to 100 chars and still returns the row", () => {
  const rows = parseSearchResults({ data: [{ projectId: "69099314442", projectName: "ก".repeat(600), deptSubName: "ข".repeat(700) }] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title.length, 200);
  assert.equal(rows[0].agency.length, 100);
});
