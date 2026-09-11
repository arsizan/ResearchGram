/**
 * Verifies the research assistant's LLM key before you run the app.
 *
 *   npm run check:ai
 *
 * Three things, in order, because each one only makes sense if the last passed:
 *   1. the key is loaded and Google accepts it
 *   2. every model in the GEMINI_MODEL chain exists and your key may call it
 *   3. a real structured-output call returns parseable JSON matching a schema
 *
 * Step 2 lists what your key can actually use. Model names change often enough
 * that guessing one out of a blog post is how you get a 404 at runtime.
 */

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const CHAIN = (process.env.GEMINI_MODEL || "gemini-3.5-flash-lite")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const KEY = process.env.GEMINI_API_KEY;

let failures = 0;
const ok = (m) => console.log(`   PASS  ${m}`);
const bad = (m) => {
  failures += 1;
  console.log(`   FAIL  ${m}`);
};
const info = (m) => console.log(`         ${m}`);

console.log("\nResearchGram — AI assistant preflight\n");

// ------------------------------------------------------------- 1. the key
console.log("1. API key");
if (!KEY) {
  bad("GEMINI_API_KEY is empty or .env.local was not loaded");
  info("get a free key at https://aistudio.google.com/apikey (no card needed)");
  info("then put it in .env.local as GEMINI_API_KEY=...");
  process.exit(1);
}
ok(`loaded (${KEY.length} chars, starts ${KEY.slice(0, 6)}...)`);

const headers = { "Content-Type": "application/json", "x-goog-api-key": KEY };

// -------------------------------------------------- 2. models this key can use
console.log("\n2. Models available to this key");
let modelNames = [];
try {
  const res = await fetch(`${BASE_URL}/models?pageSize=200`, { headers });

  if (res.status === 400 || res.status === 403) {
    bad(`Google rejected the key (HTTP ${res.status})`);
    info("check for a stray space or quote around the value in .env.local");
    info(await res.text().then((t) => t.slice(0, 200)));
    process.exit(1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const body = await res.json();
  modelNames = (body.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));

  ok(`key accepted — ${modelNames.length} models support generateContent`);

  const shortlist = modelNames.filter(
    (n) => /flash|pro/.test(n) && !/image|audio|tts|live|embedding|robotics/.test(n),
  );
  info("text models you can use:");
  for (const name of shortlist.slice(0, 15)) info(`  - ${name}`);

  for (const name of CHAIN) {
    if (modelNames.includes(name)) {
      ok(`chain model "${name}" is callable`);
    } else {
      bad(`chain model "${name}" is NOT available to this key`);
      info("fix GEMINI_MODEL in .env.local — every name in the list must exist");
    }
  }

  info("");
  info("Daily limits are per model and differ a lot. Check yours at");
  info("https://aistudio.google.com/rate-limit with 'All models' switched on;");
  info("put the biggest RPD first in GEMINI_MODEL.");
} catch (error) {
  bad(`could not list models: ${error.message}`);
}

// ------------------------------------------- 3. a real structured-output call
console.log("\n3. Structured output (what the assistant actually does)");
for (const MODEL of CHAIN) {
  console.log(`   -- ${MODEL}`);
try {
  const res = await fetch(
    `${BASE_URL}/models/${encodeURIComponent(MODEL)}:generateContent`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "You answer strictly in the given JSON schema." }],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Paper 1 is about graph neural networks for drug discovery. In one sentence, what field is it in? Cite paper 1.",
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["research", "product_help", "unclear"] },
              answer: { type: "string" },
              cited_papers: { type: "array", items: { type: "integer" } },
              related_queries: { type: "array", items: { type: "string" } },
            },
            required: ["kind", "answer", "cited_papers", "related_queries"],
          },
          maxOutputTokens: 4096,
          temperature: 0.2,
        },
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text();
    bad(`HTTP ${res.status}`);
    info(detail.slice(0, 300));
    if (res.status === 404) {
      info(`the model "${MODEL}" does not exist — pick one from section 2`);
    }
    if (res.status === 429) {
      info("this model's free allowance is used up for now. Not fatal: the app");
      info("skips it and moves to the next model in GEMINI_MODEL by itself.");
    }
  } else {
    const body = await res.json();
    const candidate = body.candidates?.[0];
    const text = (candidate?.content?.parts || [])
      .map((p) => p.text || "")
      .join("")
      .trim();

    if (!text) {
      bad(`empty response (finishReason: ${candidate?.finishReason || "none"})`);
      if (candidate?.finishReason === "MAX_TOKENS") {
        info("the model spent its whole budget thinking before answering");
        info("set GEMINI_THINKING_BUDGET=0 in .env.local and run this again");
      }
    } else {
      const parsed = JSON.parse(text);
      ok("model returned valid JSON matching the schema");
      info(`kind:        ${parsed.kind}`);
      info(`answer:      ${String(parsed.answer).slice(0, 68)}`);
      info(`cited:       [${(parsed.cited_papers || []).join(", ")}]`);
      info(`follow-ups:  ${(parsed.related_queries || []).length}`);
      const usage = body.usageMetadata;
      if (usage) {
        info(`tokens:      ${usage.promptTokenCount} in / ${usage.candidatesTokenCount} out`);
      }
    }
  }
} catch (error) {
  bad(`structured call failed: ${error.message}`);
}
}

console.log(
  failures === 0
    ? "\nAll checks passed. The assistant is ready — run npm run dev.\n"
    : `\n${failures} check(s) failed. Fix the FAIL lines above, then run this again.\n`,
);
process.exit(failures === 0 ? 0 : 1);
