/*
 * SlopBrowser - Slop Detection Engine
 *
 * Pure logic, no DOM dependency. Scores text snippets and returns a
 * "slop score" with reasons. Used both by the webview preload (Node
 * context) and potentially in the browser, hence the UMD-style export.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = mod;
  } else {
    root.SlopEngine = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Domains notorious for AI-generated bulk content / content farms.
  // Kept deliberately conservative (can be extended via a filter list).
  const SLOP_DOMAINS = [
    // Examples of known AI content farm patterns (placeholder, extendable)
    "content-farm.example",
  ];

  // Typical phrases from LLM output. Weight: higher number = more suspicious.
  const PHRASES = [
    [/\bas an ai language model\b/i, 10],
    [/\bas a large language model\b/i, 10],
    [/\bi(?:'| a)m sorry,? but\b/i, 6],
    [/\bi cannot fulfill (?:this|that) request\b/i, 8],
    [/\bit(?:'| i)s (?:important|worth|essential|crucial) to note that\b/i, 3],
    [/\bin (?:today's|the) (?:digital|modern|fast-paced) (?:age|world|landscape)\b/i, 4],
    [/\bwhen it comes to\b/i, 1],
    [/\bat the end of the day\b/i, 1],
    [/\bnavigat(?:e|ing) the (?:complex|ever-changing|intricate)\b/i, 3],
    [/\bin the realm of\b/i, 3],
    [/\bin conclusion,?\b/i, 2],
    [/\bto sum(?: it)? up,?\b/i, 2],
    [/\bunlock(?:ing)? (?:the )?(?:potential|power|secrets)\b/i, 3],
    [/\bharness(?:ing)? the power of\b/i, 4],
    [/\bdive(?:s)? (?:deep )?into\b/i, 1],
    [/\bdelv(?:e|ing) into\b/i, 3],
    [/\ba testament to\b/i, 3],
    [/\brich tapestry\b/i, 5],
    [/\bvibrant tapestry\b/i, 5],
    [/\bever-(?:evolving|changing) (?:landscape|world)\b/i, 3],
    [/\bgame-?changer\b/i, 2],
    [/\bit's worth noting\b/i, 2],
    [/\bfoster(?:ing)? (?:a sense of|innovation|collaboration)\b/i, 2],
    [/\bcertainly!/i, 3],
    [/\bgreat question!/i, 3],
    [/\bi hope this helps\b/i, 4],
    [/\blet's (?:delve|explore|dive) (?:in|into)\b/i, 2],
    [/\bunderscore(?:s|d)? the importance\b/i, 3],
    [/\bplays? a (?:crucial|vital|pivotal|key) role\b/i, 2],
    [/\bmoreover,?\b/i, 1],
    [/\bfurthermore,?\b/i, 1],
    [/\bnestled\b/i, 2],
    [/\bbustling\b/i, 2],
    [/\ba myriad of\b/i, 2],
    [/\bseamless(?:ly)? (?:integrat|blend|combin)/i, 2],
    [/\bcutting-edge\b/i, 1],
    [/\bstate-of-the-art\b/i, 1],
    [/\brevolutioniz(?:e|ing|es)\b/i, 2],
    [/\belevate your\b/i, 2],
    [/\bembark on (?:a|this) journey\b/i, 3],
  ];

  // "Listicle" / SEO slop patterns
  const STRUCTURE = [
    [/\b(?:top|best) \d+ (?:ways|tips|tricks|reasons|things|tools)\b/i, 2],
    [/\byou (?:won't|wont) believe\b/i, 3],
    [/\bhere are \d+ (?:ways|tips|reasons)\b/i, 2],
    [/\bkeep reading to (?:find out|learn|discover)\b/i, 2],
  ];

  // Emoji bullet-point spam (typical of LLM marketing text)
  const BULLET_EMOJI = /(?:^|\n)\s*(?:[\u2705\u2728\ud83d\ude80\ud83d\udca1\ud83d\udd25\u2b50\ud83c\udfaf\ud83d\udccc\ud83d\udd11\ud83d\udca5\u27a1\ufe0f\ud83d\udc49])/gmu;

  function countMatches(re, text) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    const m = text.match(g);
    return m ? m.length : 0;
  }

  /**
   * Scores a text block.
   * @param {string} text
   * @returns {{score:number, reasons:string[]}}
   */
  function scoreText(text) {
    const reasons = [];
    let score = 0;
    if (!text) return { score, reasons };

    const clean = String(text).replace(/\s+/g, " ").trim();
    const words = clean.split(/\s+/).filter(Boolean).length;

    // Ignore very short texts (navigation, buttons, etc.)
    if (words < 20) return { score, reasons };

    for (const [re, weight] of PHRASES) {
      if (re.test(clean)) {
        score += weight;
        reasons.push("Phrase: " + re.source.slice(0, 40));
      }
    }
    for (const [re, weight] of STRUCTURE) {
      if (re.test(clean)) {
        score += weight;
        reasons.push("SEO structure: " + re.source.slice(0, 30));
      }
    }

    // Emoji bullet spam
    const emojiBullets = countMatches(BULLET_EMOJI, "\n" + clean);
    if (emojiBullets >= 3) {
      score += Math.min(emojiBullets, 6);
      reasons.push("Emoji bullet points: " + emojiBullets);
    }

    // Excessive em-dash usage (LLM marker)
    const emDashes = countMatches(/\u2014/, clean);
    if (words > 60 && emDashes / words > 0.02) {
      score += 2;
      reasons.push("Many em-dashes");
    }

    // Monotone sentence openers are too expensive to detect here;
    // instead: very uniform sentence lengths suggest generation.
    const sentences = clean.split(/[.!?]+\s/).filter((s) => s.split(/\s+/).length > 3);
    if (sentences.length >= 5) {
      const lens = sentences.map((s) => s.split(/\s+/).length);
      const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
      const variance = lens.reduce((a, b) => a + (b - avg) ** 2, 0) / lens.length;
      const stddev = Math.sqrt(variance);
      if (avg > 12 && stddev < 4) {
        score += 2;
        reasons.push("Very uniform sentence lengths");
      }
    }

    return { score, reasons };
  }

  // Explicit AI-disclosure phrases. These are deliberately specific multi-word
  // markers used by platforms/creators, so a single hit is a strong signal.
  const AI_MEDIA_MARKERS = [
    "ai-generated",
    "ai generated",
    "generated with ai",
    "generated by ai",
    "made with ai",
    "made using ai",
    "created with ai",
    "created using ai",
    "ai-created",
    "generative ai",
    "synthetic media",
    "synthetic content",
    "altered or synthetic content",
    "content credentials",
    "deepfake",
    "creator labeled as ai",
    "labeled as ai-generated",
    "may be ai-generated",
    "sound and visuals may be ai-generated",
    "this content was generated with",
    "imagined with ai",
  ];

  // Known video/image generation tools. Matched with word boundaries to keep
  // false positives (random text) low. Stronger weight when found in metadata.
  const AI_GENERATORS = [
    "openai sora",
    "sora",
    "runwayml",
    "runway gen",
    "gen-3 alpha",
    "pika labs",
    "kling ai",
    "dream machine",
    "google veo",
    "veo 3",
    "synthesia",
    "heygen",
    "stable video diffusion",
    "hailuo",
    "seedance",
    "midjourney",
  ];

  // CDNs / hosts that serve generated media.
  const AI_MEDIA_HOSTS =
    /videos\.openai|sora\.com|cdn\.openai|replicate\.delivery|runwayml|pika\.art|klingai|dream-machine|lumalabs/i;

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Scores a video (or any media element) from its metadata and surrounding
   * text. `attrs` is deliberate metadata (src, poster, class, id, title,
   * aria-label, data-* values); `text` is the visible context around it.
   * @param {{attrs?:string, text?:string}} meta
   */
  function scoreVideo(meta) {
    const reasons = [];
    let score = 0;
    const attrs = (meta.attrs || "").toLowerCase();
    const text = (meta.text || "").toLowerCase();
    const all = attrs + " \n " + text;

    for (const m of AI_MEDIA_MARKERS) {
      if (all.includes(m)) {
        score += 6;
        reasons.push("AI video marker: " + m);
      }
    }

    for (const g of AI_GENERATORS) {
      const re = new RegExp("\\b" + escapeRe(g) + "\\b", "i");
      if (re.test(attrs)) {
        score += 5;
        reasons.push("AI generator (metadata): " + g);
      } else if (re.test(text)) {
        score += 3;
        reasons.push("AI generator: " + g);
      }
    }

    if (AI_MEDIA_HOSTS.test(attrs)) {
      score += 6;
      reasons.push("AI media host");
    }

    return { score, reasons };
  }

  function isSlopDomain(hostname) {
    if (!hostname) return false;
    const h = hostname.toLowerCase();
    return SLOP_DOMAINS.some((d) => h === d || h.endsWith("." + d));
  }

  /**
   * Scores an image based on attributes (no pixel access).
   * @param {{alt?:string, src?:string, className?:string}} img
   */
  function scoreImage(img) {
    const reasons = [];
    let score = 0;
    const alt = (img.alt || "").toLowerCase();
    const src = (img.src || "").toLowerCase();
    const cls = (img.className || "").toLowerCase();

    const aiMarkers = [
      "ai-generated",
      "ai generated",
      "midjourney",
      "stable-diffusion",
      "stable diffusion",
      "dall-e",
      "dalle",
      "generated by ai",
      "made with ai",
    ];
    for (const m of aiMarkers) {
      if (alt.includes(m) || src.includes(m) || cls.includes(m)) {
        score += 6;
        reasons.push("AI image marker: " + m);
      }
    }
    // Known AI image CDNs
    if (/oaidalleapiprodscus|cdn\.midjourney|replicate\.delivery/.test(src)) {
      score += 6;
      reasons.push("AI image CDN");
    }
    return { score, reasons };
  }

  return {
    scoreText,
    scoreImage,
    scoreVideo,
    isSlopDomain,
    SLOP_DOMAINS,
    AI_MEDIA_MARKERS,
    AI_GENERATORS,
    // Threshold at which a block counts as slop
    THRESHOLD: 5,
  };
});
