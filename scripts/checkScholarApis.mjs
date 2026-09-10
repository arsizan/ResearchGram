/**
 * Verifies the two scholarly APIs before you rely on them.
 *
 *   node scripts/checkScholarApis.mjs
 *   node scripts/checkScholarApis.mjs "your own search terms"
 *
 * Reads OPENALEX_MAILTO and SEMANTIC_SCHOLAR_API_KEY from the environment if set,
 * but works without either. Nothing here touches your database.
 */

const query = process.argv[2] || "federated learning medical imaging";
const mailto = process.env.OPENALEX_MAILTO || "";
const s2Key = process.env.SEMANTIC_SCHOLAR_API_KEY || "";

const ok = (m) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const bad = (m) => console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`);
const info = (m) => console.log(`        ${m}`);

let failures = 0;

console.log(`\nSearching for: "${query}"\n`);

// ---------------------------------------------------------------- OpenAlex
console.log("1. OpenAlex — works search");
let firstWork = null;
try {
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", query);
  url.searchParams.set("per-page", "3");
  url.searchParams.set("filter", "has_abstract:true");
  if (mailto) url.searchParams.set("mailto", mailto);

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  firstWork = data.results?.[0];
  if (!firstWork) throw new Error("no results returned");

  ok(`${data.meta.count.toLocaleString()} works match`);
  info(`title:      ${firstWork.title?.slice(0, 68)}`);
  info(`doi:        ${firstWork.doi || "(none)"}`);
  info(`year:       ${firstWork.publication_year}`);
  info(`citations:  ${firstWork.cited_by_count}`);
  info(`journal:    ${firstWork.primary_location?.source?.display_name || "(none)"}`);
  info(`abstract:   ${firstWork.abstract_inverted_index ? "present (inverted index)" : "MISSING"}`);
  info(`open access:${firstWork.open_access?.is_oa ? " yes" : " no"}`);
  if (!mailto) info("note:       set OPENALEX_MAILTO to join the polite pool");
} catch (error) {
  failures++;
  bad(`OpenAlex works: ${error.message}`);
}

// -------------------------------------------------- OpenAlex journal metrics
console.log("\n2. OpenAlex — journal metrics (the impact numbers)");
try {
  const sourceId = firstWork?.primary_location?.source?.id?.split("/").pop();
  if (!sourceId) throw new Error("first result has no journal to look up");

  const url = new URL("https://api.openalex.org/sources");
  url.searchParams.set("filter", `ids.openalex:${sourceId}`);
  if (mailto) url.searchParams.set("mailto", mailto);

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const source = (await res.json()).results?.[0];
  if (!source) throw new Error("batch id filter returned nothing — tell Claude, the filter syntax needs changing");

  const stats = source.summary_stats || {};
  ok(`metrics for "${source.display_name}"`);
  info(`2yr_mean_citedness: ${stats["2yr_mean_citedness"] ?? "(none)"}   <- the open Impact-Factor equivalent`);
  info(`h_index:            ${stats.h_index ?? "(none)"}`);
  info(`i10_index:          ${stats.i10_index ?? "(none)"}`);
  info(`issn_l:             ${source.issn_l || "(none)"}`);
} catch (error) {
  failures++;
  bad(`OpenAlex sources: ${error.message}`);
}

// -------------------------------------------------------- Semantic Scholar
console.log("\n3. Semantic Scholar — tldr summaries");
try {
  const doi = firstWork?.doi?.replace(/^https?:\/\/doi\.org\//, "");
  if (!doi) throw new Error("first result has no DOI to look up");

  const headers = { "Content-Type": "application/json" };
  if (s2Key) headers["x-api-key"] = s2Key;

  const res = await fetch(
    "https://api.semanticscholar.org/graph/v1/paper/batch?fields=tldr,influentialCitationCount,openAccessPdf",
    { method: "POST", headers, body: JSON.stringify({ ids: [`DOI:${doi}`] }) },
  );

  if (res.status === 429) {
    bad("rate limited (429) — this is normal without a key, and the app degrades gracefully");
    info("request a free key at https://www.semanticscholar.org/product/api");
  } else if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  } else {
    const paper = (await res.json())?.[0];
    if (!paper) {
      bad("no match for that DOI (not an error — coverage differs from OpenAlex)");
    } else {
      ok("enrichment reachable");
      info(`tldr:        ${paper.tldr?.text?.slice(0, 68) || "(none for this paper)"}`);
      info(`influential: ${paper.influentialCitationCount ?? "(none)"}`);
      info(`oa pdf:      ${paper.openAccessPdf?.url ? "yes" : "no"}`);
    }
    if (!s2Key) info("note:        no API key set — you share a rate limit with everyone");
  }
} catch (error) {
  bad(`Semantic Scholar: ${error.message}`);
  info("this step is optional — the app works without it");
}

console.log(
  failures === 0
    ? "\n\x1b[32mAll required checks passed. Safe to run the app.\x1b[0m\n"
    : `\n\x1b[31m${failures} required check(s) failed — send the output to Claude before continuing.\x1b[0m\n`,
);
process.exit(failures === 0 ? 0 : 1);
