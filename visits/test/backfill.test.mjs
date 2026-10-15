import { test } from "node:test";
import assert from "node:assert/strict";
import { rowsOf, reduceExport, hourOf, hostOf } from "../backfill.mjs";

test("the JSON export's hourly hit stats become rows, joined to paths and refs", () => {
  const lines = [
    JSON.stringify({ export_version: "1.0" }),
    JSON.stringify({ path: { id: 1, path: "/", title: "Home" } }),
    JSON.stringify({ path: { id: 2, path: "out-github", title: "", event: true } }),
    JSON.stringify({ ref: { id: 7, ref: "google.com" } }),
    JSON.stringify({ hit_stat: { hour: "2026-10-01T10:00:00Z", path_id: 1, ref_id: 7, count: 3 } }),
    JSON.stringify({ hit_stat: { hour: "2026-10-01T10:00:00Z", path_id: 1, ref_id: 0, count: 2 } }),
    JSON.stringify({ hit_stat: { hour: "2026-10-01T11:00:00Z", path_id: 2, ref_id: 0, count: 1 } }),
  ].join("\n");
  assert.deepEqual(rowsOf(lines), [
    { hour: "2026-10-01T10:00:00Z", path: "/", title: "Home", event: false, ref: "google.com", visits: 3 },
    { hour: "2026-10-01T10:00:00Z", path: "/", title: "Home", event: false, ref: "", visits: 2 },
    { hour: "2026-10-01T11:00:00Z", path: "out-github", title: "", event: true, ref: "", visits: 1 },
  ]);
});

test("the per-hit CSV export is reduced to hourly counts, bots dropped", () => {
  const csv = [
    "2,Path,Title,Event,UserAgent,Browser,System,Session,Bot,Referrer,Referrer scheme,Screen size,Location,FirstVisit,Date",
    '"/","Home","false","","Firefox 128","macOS","s1","0","https://google.com/","h","1920","US","1","2026-10-01 10:05:00"',
    '"/","Home","false","","Firefox 128","macOS","s2","0","https://google.com/","h","1920","US","1","2026-10-01 10:50:00"',
    '"/","Home","false","","bot","","s3","150","","","0","","1","2026-10-01 10:51:00"',
    '"out-github","","true","","Firefox 128","macOS","s1","0","","","1920","US","0","2026-10-01 11:00:00"',
  ].join("\n");
  assert.deepEqual(rowsOf(csv), [
    { hour: "2026-10-01T10:00:00Z", path: "/", title: "Home", event: false, ref: "google.com", visits: 2 },
    { hour: "2026-10-01T11:00:00Z", path: "out-github", title: "", event: true, ref: "", visits: 1 },
  ]);
});

test("hourOf floors both stamp shapes to the UTC hour", () => {
  assert.equal(hourOf("2026-10-01T10:05:00Z"), "2026-10-01T10:00:00Z");
  assert.equal(hourOf("2026-10-01 10:05:00"), "2026-10-01T10:00:00Z");
});

test("hostOf strips scheme, userinfo, port and www, and lowercases", () => {
  assert.equal(hostOf("https://user:pw@WWW.Example.com:8080/a?b#c"), "example.com");
  assert.equal(hostOf("www.Google.com"), "google.com");
  assert.equal(hostOf(""), "");
});

test("JSON lines with none of the three known keys are skipped and counted", () => {
  const text = [
    JSON.stringify({ export_version: "1.0" }),
    JSON.stringify({ mystery: { id: 1 } }),
    JSON.stringify({ path: { id: 1, path: "/", title: "" } }),
    JSON.stringify({ hit_stat: { hour: "2026-10-01T10:00:00Z", path_id: 1, count: 1 } }),
  ].join("\n");
  const { rows, skipped } = reduceExport(text);
  assert.equal(rows.length, 1);
  assert.equal(skipped, 2);
});

test("the CSV is parsed by column name, not position", () => {
  const csv = [
    "Date,Path,Bot,Referrer,Title,Event",
    '"2026-10-01 10:05:00","/a","0","","A","false"',
  ].join("\n");
  assert.deepEqual(rowsOf(csv), [
    { hour: "2026-10-01T10:00:00Z", path: "/a", title: "A", event: false, ref: "", visits: 1 },
  ]);
});

test("a header with the version glued to the first name parses the same", () => {
  const csv = [
    "2Path,Title,Event,UserAgent,Browser,System,Session,Bot,Referrer,Referrer scheme,Screen size,Location,FirstVisit,Date",
    '"/","Home","false","","Firefox 128","macOS","s1","0","https://google.com/","h","1920","US","1","2026-10-01 10:05:00"',
  ].join("\n");
  assert.deepEqual(rowsOf(csv), [
    { hour: "2026-10-01T10:00:00Z", path: "/", title: "Home", event: false, ref: "google.com", visits: 1 },
  ]);
});

test("a header lacking a needed column throws", () => {
  assert.throws(() => rowsOf('Path,Title,Event,Referrer,Date\n"/","","false","","2026-10-01 10:05:00"'), /lacks the column Bot/);
});

test("hostOf reduces scheme-less referrers with a path, query or port", () => {
  assert.equal(hostOf("google.com/search?q=x"), "google.com");
  assert.equal(hostOf("t.co/abc"), "t.co");
  assert.equal(hostOf("WWW.Example.com:8443/x"), "example.com");
});

test("a CRLF CSV leaves no carriage return on the last cell", () => {
  const csv = ["Path,Title,Event,Bot,Referrer,Date", '"/","Home","false","0","","2026-10-01 10:05:00"'].join("\r\n");
  assert.deepEqual(rowsOf(csv), [
    { hour: "2026-10-01T10:00:00Z", path: "/", title: "Home", event: false, ref: "", visits: 1 },
  ]);
});

test("two ref ids with one host give one row", () => {
  const text = [
    { path: { id: 1, path: "/", title: "" } },
    { ref: { id: 7, ref: "google.com" } },
    { ref: { id: 8, ref: "https://www.google.com/" } },
    { hit_stat: { hour: "2026-10-01T10:00:00Z", path_id: 1, ref_id: 7, count: 1 } },
    { hit_stat: { hour: "2026-10-01T10:00:00Z", path_id: 1, ref_id: 8, count: 2 } },
  ].map((o) => JSON.stringify(o)).join("\n");
  assert.deepEqual(rowsOf(text), [
    { hour: "2026-10-01T10:00:00Z", path: "/", title: "", event: false, ref: "google.com", visits: 3 },
  ]);
});
