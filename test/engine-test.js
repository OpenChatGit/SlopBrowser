const E = require("../blocker/slop-engine.js");

const slop =
  "In today's fast-paced digital age, it's important to note that harnessing the power of synergy can truly unlock the potential of your business. As we delve into the ever-evolving landscape of innovation, we must foster a sense of collaboration. In conclusion, this is a testament to the rich tapestry of modern enterprise, and it's worth noting that we should embark on a journey to revolutionize the way we work.";

const real =
  "The function returns null when the cache is empty. We added a guard clause on line 42 to avoid a null pointer exception. Tested on Chrome 120 and it passed all 14 unit tests. The PR is linked in the ticket by my colleague yesterday afternoon.";

const s = E.scoreText(slop);
const r = E.scoreText(real);

console.log("THRESHOLD:", E.THRESHOLD);
console.log("=== TEXT ===");
console.log("SLOP  -> score", s.score, "| blocked:", s.score >= E.THRESHOLD);
console.log("        reasons:", s.reasons.join(" | "));
console.log("REAL  -> score", r.score, "| blocked:", r.score >= E.THRESHOLD);

// --- Video / media metadata detection ---
const videoCases = [
  {
    name: "data-attr + caption 'AI-generated'",
    meta: { attrs: "video-card ai-generated", text: "AI-generated" },
    slop: true,
  },
  {
    name: "YouTube 'Altered or synthetic content'",
    meta: { attrs: "", text: "Altered or synthetic content" },
    slop: true,
  },
  {
    name: "caption 'made with OpenAI Sora'",
    meta: { attrs: "", text: "Cinematic dragon flyover made with OpenAI Sora" },
    slop: true,
  },
  {
    name: "AI media host in src",
    meta: { attrs: "https://videos.openai.com/sora/abc123.mp4", text: "" },
    slop: true,
  },
  {
    name: "real handheld footage",
    meta: { attrs: "video-card", text: "Raw handheld footage of our hiking trip in the Alps" },
    slop: false,
  },
];

console.log("\n=== VIDEO ===");
let videoPass = true;
for (const c of videoCases) {
  const res = E.scoreVideo(c.meta);
  const blocked = res.score >= E.THRESHOLD;
  const ok = blocked === c.slop;
  if (!ok) videoPass = false;
  console.log(
    (ok ? "OK  " : "FAIL") +
      " | score " + res.score +
      " | blocked " + blocked +
      " | " + c.name
  );
}

const pass =
  s.score >= E.THRESHOLD && r.score < E.THRESHOLD && videoPass;
console.log(pass ? "\nRESULT: PASS" : "\nRESULT: FAIL");
process.exit(pass ? 0 : 1);
