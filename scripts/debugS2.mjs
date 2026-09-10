/**
 * One-off diagnostic for the Semantic Scholar key. Delete when it has done its job.
 *
 *   node --env-file=.env.local scripts/debugS2.mjs
 *
 * Makes exactly two requests to the same endpoint — one with the key, one without —
 * and prints the raw status, the rate-limit headers and the response body, so we can
 * see whether the key is being sent, whether it is accepted, and what S2 actually says.
 */

const key = process.env.SEMANTIC_SCHOLAR_API_KEY || "";
const URL = "https://api.semanticscholar.org/graph/v1/paper/batch?fields=tldr,influentialCitationCount";
const BODY = JSON.stringify({ ids: ["DOI:10.1038/s42256-020-0186-1"] });

console.log("\n================ KEY ================");
if (!key) {
  console.log("NOT LOADED — process.env.SEMANTIC_SCHOLAR_API_KEY is empty.");
  console.log("Did you run this with:  node --env-file=.env.local scripts/debugS2.mjs ?");
} else {
  console.log(`loaded      : yes`);
  console.log(`length      : ${key.length}`);
  console.log(`starts with : ${key.slice(0, 7)}...`);
  console.log(`ends with   : ...${key.slice(-4)}`);
  if (key !== key.trim()) console.log("WARNING     : leading or trailing whitespace");
  if (/^["']|["']$/.test(key)) console.log("WARNING     : value is wrapped in quotes");
  if (/\s/.test(key)) console.log("WARNING     : contains a space or newline inside");
}

async function attempt(label, useKey) {
  const headers = { "Content-Type": "application/json" };
  if (useKey && key) headers["x-api-key"] = key;

  console.log(`\n================ ${label} ================`);
  console.log(`x-api-key sent: ${Boolean(headers["x-api-key"])}`);

  try {
    const res = await fetch(URL, { method: "POST", headers, body: BODY });
    console.log(`status        : ${res.status} ${res.statusText}`);

    const interesting = [];
    res.headers.forEach((value, name) => {
      if (/rate|retry|limit|quota/i.test(name)) interesting.push(`  ${name}: ${value}`);
    });
    if (interesting.length) {
      console.log("headers       :");
      console.log(interesting.join("\n"));
    }

    const text = await res.text();
    console.log(`body          : ${text.slice(0, 300)}`);

    if (res.ok) {
      try {
        const paper = JSON.parse(text)?.[0];
        console.log(`tldr          : ${paper?.tldr?.text?.slice(0, 90) || "(none for this paper)"}`);
      } catch {
        /* body was not the shape we expected; the raw text above is enough */
      }
    }
  } catch (error) {
    console.log(`network error : ${error.message}`);
  }
}

await attempt("WITH KEY", true);

// A second later, so the 1-request-per-second limit cannot explain a difference.
await new Promise((resolve) => setTimeout(resolve, 2000));

await attempt("WITHOUT KEY (control)", false);

console.log("\nSend both blocks to Claude.\n");
