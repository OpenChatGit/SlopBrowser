import { marked } from "../../node_modules/marked/lib/marked.esm.js";
import DOMPurify from "../../node_modules/dompurify/dist/purify.es.mjs";

marked.setOptions({
  gfm: true,
  breaks: true,
});

const PURIFY_OPTS = {
  ADD_ATTR: ["target", "rel", "checked", "disabled", "align", "start"],
  ADD_TAGS: ["input"],
};

export function renderMarkdown(text) {
  if (!text) return "";
  const raw = marked.parse(String(text), { async: false });
  return DOMPurify.sanitize(raw, PURIFY_OPTS);
}

export function enhanceMarkdown(root) {
  if (!root) return;
  root.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#")) return;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });
}
