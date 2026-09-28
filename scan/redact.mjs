// Scraped axe HTML fragments (and any history row built from them) can carry
// Zoom join links with an embedded passcode (?pwd=...) — for zoom.us and its
// Zoom for Government counterpart, zoomgov.com, on any subdomain. Blank the
// passcode before it lands anywhere persisted. Shared by scan/run.mjs (fresh
// results) and scan/update-history.mjs (rows retained from earlier runs), so
// a single implementation covers every place a passcode could otherwise slip
// through.
//
// This LOCATES two kinds of candidates: (a) any absolute or protocol-relative
// URL, and (b) a scheme-less bare host (zoom.us/... or *.zoomgov.com/...).
// (a) is checked against the WHATWG-parsed, lower-cased, percent-DECODED
// hostname, so a host spelled with a percent-escape (e.g. "%7Aoom.us") is
// still recognized as zoom.us even though the raw text doesn't literally
// contain it. (b) is Zoom by construction, since the pattern already pins
// the literal host. Either way, the query string is then redacted by
// hand-splitting on "&"/"&amp;" and percent-decoding each parameter name, so
// every "pwd" — repeated, encoded, or separated by "&amp;" — is caught, not
// just the first literal one a single regex could see. The ORIGINAL matched
// text is never round-tripped through URL/URLSearchParams: only the pwd
// value text is swapped in place, so archived JSON stays byte-identical
// apart from that swap.
const CANDIDATE_RE =
  /(?:[a-z][a-z0-9+.-]*:)?\/\/[^\s"'<>\\`]*|(?:[a-z0-9-]+\.)*(?:zoom\.us|zoomgov\.com)(?::\d+)?\/[^\s"'<>\\`]*/gi;

// Matches only candidates of kind (a): an absolute ("scheme://...") or
// protocol-relative ("//...") URL.
const ABSOLUTE_OR_PROTOCOL_RELATIVE_RE = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;

const isZoomHostname = (hostname) =>
  hostname === "zoom.us" ||
  hostname === "zoomgov.com" ||
  hostname.endsWith(".zoom.us") ||
  hostname.endsWith(".zoomgov.com");

// A (b)-shaped candidate is Zoom by construction. A (a)-shaped candidate is
// Zoom only if its parsed hostname says so — an unparsable candidate is
// treated as not Zoom.
const isZoomCandidate = (candidate) => {
  if (!ABSOLUTE_OR_PROTOCOL_RELATIVE_RE.test(candidate)) return true;
  try {
    const url = new URL(candidate.startsWith("//") ? `https:${candidate}` : candidate);
    // A fully qualified name may end in one dot ("zoom.us.") and still resolve.
    return isZoomHostname(url.hostname.replace(/\.$/, ""));
  } catch {
    return false;
  }
};

// A percent-encoded parameter name (e.g. "p%77d") names "pwd" once decoded.
// Falls back to the raw lower-cased name if it isn't validly encoded.
const isPwdName = (name) => {
  try {
    return decodeURIComponent(name).toLowerCase() === "pwd";
  } catch {
    return name.toLowerCase() === "pwd";
  }
};

// A single "name=value" query segment: only the value is replaced, so the
// (possibly percent-encoded) name is preserved as-is.
const redactParam = (part) => {
  const eq = part.indexOf("=");
  if (eq === -1) return part;
  const name = part.slice(0, eq);
  return isPwdName(name) ? `${name}=REDACTED` : part;
};

// A query string, split on "&"/"&amp;" with the separators kept as their own
// array entries so the join below reproduces them verbatim.
const redactQuery = (query) =>
  query
    .split(/(&amp;|&)/)
    .map((part) => (part === "&amp;" || part === "&" ? part : redactParam(part)))
    .join("");

export const redactZoomPasscodes = (text) =>
  String(text).replace(CANDIDATE_RE, (candidate) => {
    if (!isZoomCandidate(candidate)) return candidate;
    const queryStart = candidate.indexOf("?");
    if (queryStart === -1) return candidate;
    const before = candidate.slice(0, queryStart + 1);
    let query = candidate.slice(queryStart + 1);
    let fragment = "";
    const hashIndex = query.indexOf("#");
    if (hashIndex !== -1) {
      fragment = query.slice(hashIndex);
      query = query.slice(0, hashIndex);
    }
    return before + redactQuery(query) + fragment;
  });

// Same redaction for a whole object, via a JSON round trip. Operates on the
// serialized JSON, so it covers every field regardless of shape.
export const sanitizeResult = (result) => JSON.parse(redactZoomPasscodes(JSON.stringify(result)));
