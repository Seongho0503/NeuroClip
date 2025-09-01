// Injects Save button into each assistant message and supports highlight mode


const BTN_CLASS = "gpt-notion-save-btn";


function createSaveButton() {
const btn = document.createElement("button");
btn.textContent = "💾 Save to Notion";
btn.className = BTN_CLASS;
btn.title = "Save this answer (or current selection) to Notion";
btn.addEventListener("click", onSaveClick);
return btn;
}


async function onSaveClick(e) {
e.stopPropagation();
const selection = window.getSelection()?.toString()?.trim();
const highlighted = selection && selection.length > 0;


const answerNode = findClosestAssistantBlock(e.target);
const answerText = highlighted ? selection : extractAnswerText(answerNode);
const questionText = extractLastUserQuestion(answerNode);
const pageUrl = location.href;


if (!answerText) {
notify("No answer text found");
return;
}


chrome.runtime.sendMessage({
type: "SAVE_TO_NOTION",
payload: {
answerText,
questionText,
pageUrl,
mode: highlighted ? "highlight" : "full"
}
});
}


function extractAnswerText(answerNode) {
if (!answerNode) return null;
// Prefer markdown container text
// This selector may evolve with ChatGPT UI updates
const md = answerNode.querySelector(".markdown, .prose, [data-message-author-role='assistant']");
const text = (md || answerNode).innerText || "";
return text.trim();
}


function extractLastUserQuestion(answerNode) {
// Find the nearest previous user message text
let prev = answerNode?.previousElementSibling;
while (prev) {
const role = prev.getAttribute("data-message-author-role");
if (role === "user") {
const t = prev.innerText?.trim();
if (t) return t;
}
prev = prev.previousElementSibling;
}
return "";
}


function findClosestAssistantBlock(el) {
let node = el.closest?.("[data-message-author-role='assistant']");
if (node) return node;
// fallback: last assistant block in the thread
const candidates = document.querySelectorAll("[data-message-author-role='assistant']");
return candidates[candidates.length - 1] || document.body;
}


function injectButtons() {
const blocks = document.querySelectorAll("[data-message-author-role='assistant']");
blocks.forEach((block) => {
if (block.querySelector(`.${BTN_CLASS}`)) return;
const container = document.createElement("div");
container.style.display = "flex";
container.style.justifyContent = "flex-end";
container.style.marginTop = "8px";
container.appendChild(createSaveButton());
block.appendChild(container);
});
}


// Observe for new messages
const observer = new MutationObserver(() => injectButtons());
observer.observe(document.documentElement, { childList: true, subtree: true });


// Initial
injectButtons();


// Small toast
function notify(msg) {
const t = document.createElement('div');
t.textContent = msg;
t.style.cssText = `position:fixed;right:16px;bottom:16px;padding:10px 14px;background:#111;color:#fff;border-radius:12px;z-index:999999;font-size:12px;opacity:.95`;
document.body.appendChild(t);
setTimeout(() => t.remove(), 2200);
}


// Listen for background confirmations
chrome.runtime.onMessage.addListener((msg) => {
if (msg?.type === 'NOTION_SAVE_RESULT') {
notify(msg.ok ? 'Saved to Notion ✅' : `Save failed ❌: ${msg.error || ''}`);
}
});