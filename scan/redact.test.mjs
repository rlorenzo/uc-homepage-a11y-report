import { test } from "node:test";
import assert from "node:assert/strict";
import { redactZoomPasscodes } from "./redact.mjs";

test("redacts a zoom.us join-link passcode", () => {
  const input = "Join: https://ucsf.zoom.us/j/123456?pwd=abcDEF123";
  assert.equal(redactZoomPasscodes(input), "Join: https://ucsf.zoom.us/j/123456?pwd=REDACTED");
});

// Regression: Zoom for Government uses the same join-link shape on a
// different host; the redactor originally only matched zoom.us.
test("redacts a zoomgov.com join-link passcode", () => {
  const input = "Join: https://agency.zoomgov.com/j/987654?pwd=xyz789";
  assert.equal(
    redactZoomPasscodes(input),
    "Join: https://agency.zoomgov.com/j/987654?pwd=REDACTED",
  );
});

// Regression: hostnames are case-insensitive, so an upper-cased link must
// still be redacted.
test("redacts a mixed-case Zoom host", () => {
  const input =
    "Join: https://UCSF.ZOOM.US/j/123?pwd=SECRET and https://Agency.ZoomGov.com/j/9?PWD=abc";
  assert.equal(
    redactZoomPasscodes(input),
    "Join: https://UCSF.ZOOM.US/j/123?pwd=REDACTED and https://Agency.ZoomGov.com/j/9?PWD=REDACTED",
  );
});

// Regression: an explicit port between the host and the path must not
// defeat the match.
test("redacts a Zoom link with an explicit port", () => {
  const input = "Join: https://zoom.us:443/j/123?pwd=SECRET";
  assert.equal(redactZoomPasscodes(input), "Join: https://zoom.us:443/j/123?pwd=REDACTED");
});

// Regression: a fully qualified hostname with a trailing dot still resolves.
test("redacts a Zoom link whose host ends in a dot", () => {
  const input = "Join: https://zoom.us./j/1?pwd=SECRET";
  assert.equal(redactZoomPasscodes(input), "Join: https://zoom.us./j/1?pwd=REDACTED");
});

test("leaves text with no Zoom passcode untouched", () => {
  const input = "No links here.";
  assert.equal(redactZoomPasscodes(input), input);
});

// Regression: a regex anchored on the first "pwd=" only redacted the first
// occurrence when the parameter repeated.
test("redacts every repeated pwd parameter", () => {
  const input = "Join: https://zoom.us/j/1?pwd=a&x=1&pwd=b";
  assert.equal(
    redactZoomPasscodes(input),
    "Join: https://zoom.us/j/1?pwd=REDACTED&x=1&pwd=REDACTED",
  );
});

// Regression: a percent-encoded parameter name ("pwd" spelled with %77 for
// "w") still names the pwd parameter once decoded.
test("redacts a percent-encoded pwd parameter name", () => {
  const input = "Join: https://zoom.us/j/1?p%77d=secret";
  assert.equal(redactZoomPasscodes(input), "Join: https://zoom.us/j/1?p%77d=REDACTED");
});

// Regression: HTML-escaped query strings use "&amp;" between parameters
// instead of a bare "&".
test("redacts a pwd parameter separated by &amp;", () => {
  const input = "Join: https://zoom.us/j/1?x=1&amp;pwd=secret&amp;y=2";
  assert.equal(
    redactZoomPasscodes(input),
    "Join: https://zoom.us/j/1?x=1&amp;pwd=REDACTED&amp;y=2",
  );
});

// Regression: a fragment after the query string must survive untouched.
test("redacts a pwd parameter while preserving a trailing fragment", () => {
  const input = "Join: https://zoom.us/j/1?pwd=secret#top";
  assert.equal(redactZoomPasscodes(input), "Join: https://zoom.us/j/1?pwd=REDACTED#top");
});

// Regression: the redactor is host-anchored, so a non-Zoom URL's pwd
// parameter must be left alone.
test("leaves a non-Zoom URL's pwd parameter untouched", () => {
  const input = "Join: https://example.com/j/1?pwd=secret";
  assert.equal(redactZoomPasscodes(input), input);
});

// Regression: a percent-encoded host ("%7Aoom.us" decodes to "zoom.us")
// must not defeat detection, even though the raw text never literally
// contains "zoom.us". The original (encoded) text is preserved.
test("redacts a Zoom host spelled with a percent-escape", () => {
  const input = "Join: https://%7Aoom.us/j/123?pwd=SECRET";
  assert.equal(redactZoomPasscodes(input), "Join: https://%7Aoom.us/j/123?pwd=REDACTED");
});

// Regression: "zoom.us" appearing only in the URL's path, not its host,
// must not be mistaken for a Zoom link.
test("leaves a non-Zoom URL with zoom.us in its path untouched", () => {
  const input = "Join: https://evil.example/zoom.us/j/1?pwd=keep";
  assert.equal(redactZoomPasscodes(input), input);
});
