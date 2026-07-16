import { marked } from "../../node_modules/marked/lib/marked.esm.js";
import DOMPurify from "../../node_modules/dompurify/dist/purify.es.mjs";
import hljs from "../../node_modules/highlight.js/es/common.js";

marked.setOptions({
  gfm: true,
  breaks: true,
});

const PURIFY_OPTS = {
  ADD_ATTR: [
    "target",
    "rel",
    "checked",
    "disabled",
    "align",
    "start",
    "class",
    "title",
  ],
  ADD_TAGS: ["input"],
};

const LANG_ALIASES = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
  md: "markdown",
  plaintext: "text",
  text: "text",
};

function normalizeLang(lang) {
  const raw = String(lang || "")
    .trim()
    .toLowerCase()
    .replace(/^language-/, "");
  if (!raw) return "";
  return LANG_ALIASES[raw] || raw;
}

function langFromClass(className) {
  const m = String(className || "").match(/(?:^|\s)language-([\w+#-]+)/i);
  return normalizeLang(m?.[1] || "");
}

function displayLang(lang) {
  if (!lang || lang === "text" || lang === "plaintext") return "text";
  return lang;
}

function highlightCode(code, lang) {
  const source = String(code ?? "").replace(/\n$/, "");
  try {
    if (lang && lang !== "text" && hljs.getLanguage(lang)) {
      return {
        html: hljs.highlight(source, { language: lang, ignoreIllegals: true })
          .value,
        lang,
      };
    }
    const auto = hljs.highlightAuto(source);
    return {
      html: auto.value,
      lang: normalizeLang(auto.language) || lang || "text",
    };
  } catch (_) {
    return {
      html: escapeHtml(source),
      lang: lang || "text",
    };
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMarkdown(text) {
  if (!text) return "";
  const raw = marked.parse(String(text), { async: false });
  return DOMPurify.sanitize(raw, PURIFY_OPTS);
}

function ensureCodeChrome(pre, code) {
  if (!pre || !code) return;
  if (pre.parentElement?.classList?.contains("md-code")) return;

  let lang = langFromClass(code.className);
  const highlighted = highlightCode(code.textContent || "", lang);
  lang = highlighted.lang || lang || "text";

  code.innerHTML = highlighted.html;
  code.classList.add("hljs");
  if (lang) {
    code.classList.add(`language-${lang}`);
    code.setAttribute("data-lang", lang);
  }

  const wrap = document.createElement("div");
  wrap.className = "md-code";

  const head = document.createElement("div");
  head.className = "md-code-head";

  const langEl = document.createElement("span");
  langEl.className = "md-code-lang";
  langEl.textContent = displayLang(lang);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "md-code-copy";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const plain = code.textContent || "";
    try {
      await navigator.clipboard.writeText(plain);
      copyBtn.textContent = "Copied";
      window.setTimeout(() => {
        if (copyBtn.isConnected) copyBtn.textContent = "Copy";
      }, 1400);
    } catch (_) {
      copyBtn.textContent = "Failed";
      window.setTimeout(() => {
        if (copyBtn.isConnected) copyBtn.textContent = "Copy";
      }, 1400);
    }
  });

  head.appendChild(langEl);
  head.appendChild(copyBtn);

  const parent = pre.parentNode;
  if (!parent) return;
  parent.insertBefore(wrap, pre);
  wrap.appendChild(head);
  wrap.appendChild(pre);
}

export function enhanceMarkdown(root) {
  if (!root) return;
  root.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#")) return;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });

  root.querySelectorAll("pre > code").forEach((code) => {
    ensureCodeChrome(code.parentElement, code);
  });
}
