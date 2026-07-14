export const PAGE_CONTEXT_MAX_CHARS = 8000;

export const PAGE_CONTEXT_EXTRACTOR = `(function(){try{
function norm(s){return String(s||"").replace(/\\s+/g," ").trim()}
var url=location.href;
var title=norm(document.title);
var desc=norm((document.querySelector('meta[name="description"]')||{}).content||(document.querySelector('meta[property="og:description"]')||{}).content||"");
var root=document.querySelector("article")||document.querySelector("main")||document.querySelector('[role="main"]')||document.body;
if(!root)return{url:url,title:title,description:desc,text:"",truncated:false};
var clone=root.cloneNode(true);
clone.querySelectorAll("script,style,noscript,svg,canvas,nav,footer,header,aside,form,button,input,iframe,[hidden],[aria-hidden=true]").forEach(function(el){el.remove()});
var text=norm(clone.innerText||clone.textContent||"");
var max=${PAGE_CONTEXT_MAX_CHARS};
var truncated=text.length>max;
if(truncated)text=text.slice(0,max)+"\u2026";
return{url:url,title:title,description:desc,text:text,truncated:truncated};
}catch(e){return{url:location.href,title:"",description:"",text:"",truncated:false}}
})()`;

export function formatPageContextPrompt(ctx) {
  if (!ctx?.url) return "";
  const lines = [
    "You are SlopAI, the assistant built into SlopBrowser.",
    "The user is currently viewing a web page in their browser. Use the page context below to answer questions about what they see, summarize content, or help with tasks related to this page.",
    "When asked to summarize, produce a clear, structured summary of the page content.",
    "If a question is unrelated to the page, answer normally using your general knowledge.",
    "",
    "Current page:",
    `- Title: ${ctx.title || "Untitled"}`,
    `- URL: ${ctx.url}`,
  ];
  if (ctx.description) lines.push(`- Description: ${ctx.description}`);
  if (ctx.text) {
    lines.push("", "Page content (extracted text):", ctx.text);
    if (ctx.truncated) lines.push("", "(Note: page content was truncated due to length.)");
  } else {
    lines.push("", "(No readable page text could be extracted.)");
  }
  return lines.join("\n");
}

export function buildSlopAiApiMessages(chatMessages, pageContext) {
  const out = [];
  const prompt = formatPageContextPrompt(pageContext);
  if (prompt) out.push({ role: "system", content: prompt });
  for (const m of chatMessages) {
    if ((m.role === "user" || m.role === "assistant") && !m.error && m.text) {
      out.push({ role: m.role, content: m.text });
    }
  }
  return out;
}
