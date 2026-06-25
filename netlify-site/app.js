const form = document.querySelector("#search-form");
const promptInput = document.querySelector("#prompt");
const durationInput = document.querySelector("#duration");
const orderInput = document.querySelector("#order");
const maxResultsInput = document.querySelector("#maxResults");
const results = document.querySelector("#results");
const message = document.querySelector("#message");
const title = document.querySelector("#result-title");
const copyButton = document.querySelector("#copy-list");
const template = document.querySelector("#result-card-template");

let currentItems = [];

function setMessage(text, kind = "info") {
  message.textContent = text;
  message.classList.toggle("error", kind === "error");
  message.hidden = !text;
}

function formatDate(value) {
  if (!value) return "Unknown date";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

function cleanText(text) {
  const parser = new DOMParser();
  return parser.parseFromString(text || "", "text/html").documentElement.textContent || "";
}

function renderResults(items) {
  results.replaceChildren();
  currentItems = items;
  copyButton.disabled = items.length === 0;

  items.forEach((item) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const thumb = card.querySelector(".thumb-link");
    const img = card.querySelector("img");
    const heading = card.querySelector("h3");
    const meta = card.querySelector(".meta");
    const description = card.querySelector(".description");
    const score = card.querySelector(".score");
    const duration = card.querySelector(".duration");
    const watch = card.querySelector(".watch-link");
    const toggle = card.querySelector(".embed-toggle");
    const embed = card.querySelector(".embed-wrap");

    thumb.href = item.url;
    img.src = item.thumbnail;
    img.alt = `${item.title} thumbnail`;
    heading.textContent = cleanText(item.title);
    meta.textContent = `${item.channelTitle} | ${item.viewsLabel} | ${formatDate(item.publishedAt)}`;
    description.textContent = cleanText(item.description) || "No description available.";
    score.textContent = item.score.toFixed(1);
    duration.textContent = item.duration;
    watch.href = item.url;

    toggle.addEventListener("click", () => {
      const showing = !embed.hidden;
      embed.hidden = showing;
      toggle.textContent = showing ? "Preview" : "Hide";

      if (!showing && !embed.firstElementChild) {
        const iframe = document.createElement("iframe");
        iframe.src = item.embedUrl;
        iframe.title = item.title;
        iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        iframe.allowFullscreen = true;
        embed.append(iframe);
      }
    });

    results.append(card);
  });
}

async function runSearch() {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    setMessage("Enter a prompt first.", "error");
    promptInput.focus();
    return;
  }

  const params = new URLSearchParams({
    q: prompt,
    duration: durationInput.value,
    order: orderInput.value,
    maxResults: maxResultsInput.value
  });

  form.querySelector("button").disabled = true;
  title.textContent = "Gathering clips...";
  setMessage("Searching YouTube and ranking likely matches.");
  renderResults([]);

  try {
    const response = await fetch(`/.netlify/functions/search?${params}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Search failed.");

    renderResults(payload.items || []);
    title.textContent = payload.items?.length ? `${payload.items.length} clips found` : "No clips found";
    setMessage(payload.items?.length ? "" : "Try a broader prompt or switch clip length to any length.");
  } catch (error) {
    title.textContent = "Search paused";
    setMessage(error.message, "error");
  } finally {
    form.querySelector("button").disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch();
});

copyButton.addEventListener("click", async () => {
  const list = currentItems.map((item, index) => `${index + 1}. ${cleanText(item.title)} - ${item.url}`).join("\n");
  await navigator.clipboard.writeText(list);
  copyButton.textContent = "Copied";
  setTimeout(() => {
    copyButton.textContent = "Copy list";
  }, 1400);
});
