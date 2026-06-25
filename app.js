const form = document.querySelector("#search-form");
const promptInput = document.querySelector("#prompt");
const videoKindInput = document.querySelector("#video-kind");
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

function riskTitle(risk) {
  if (!risk?.reasons?.length) return "No extra details available.";
  return risk.reasons.join(". ");
}

function renderMoments(container, item, payload) {
  container.replaceChildren();

  if (payload.commentsUnavailable) {
    const warning = document.createElement("p");
    warning.className = "moments-note";
    warning.textContent = "Comments were unavailable, so this used the video description only.";
    container.append(warning);
  }

  if (!payload.moments?.length) {
    const empty = document.createElement("p");
    empty.className = "moments-note";
    empty.textContent = "No timestamped moments were found in the public description or top comments.";
    container.append(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "moments-list";

  payload.moments.forEach((moment) => {
    const link = document.createElement("a");
    link.href = moment.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.className = "moment-link";
    const time = document.createElement("strong");
    const note = document.createElement("span");
    const source = document.createElement("em");
    time.textContent = moment.timestamp;
    note.textContent = cleanText(moment.note);
    source.textContent = moment.source;
    link.append(time, note, source);
    list.append(link);
  });

  const copy = document.createElement("button");
  copy.className = "copy-moments";
  copy.type = "button";
  copy.textContent = "Copy moments";
  copy.addEventListener("click", async () => {
    const text = payload.moments.map((moment) => `${moment.timestamp} - ${cleanText(moment.note)} - ${moment.url}`).join("\n");
    await navigator.clipboard.writeText(`${item.title}\n${text}`);
    copy.textContent = "Copied";
    setTimeout(() => {
      copy.textContent = "Copy moments";
    }, 1400);
  });

  container.append(list, copy);
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
    const typeBadge = card.querySelector(".type-badge");
    const riskBadge = card.querySelector(".risk-badge");
    const duration = card.querySelector(".duration");
    const watch = card.querySelector(".watch-link");
    const copyUrl = card.querySelector(".copy-url");
    const toggle = card.querySelector(".embed-toggle");
    const momentsToggle = card.querySelector(".moments-toggle");
    const embed = card.querySelector(".embed-wrap");
    const moments = card.querySelector(".moments-wrap");

    thumb.href = item.url;
    img.src = item.thumbnail;
    img.alt = `${item.title} thumbnail`;
    heading.textContent = cleanText(item.title);
    meta.textContent = `${item.channelTitle} | ${item.viewsLabel} | ${formatDate(item.publishedAt)}`;
    description.textContent = cleanText(item.description) || "No description available.";
    score.textContent = item.score.toFixed(1);
    typeBadge.textContent = item.videoKind === "shorts" ? "Short" : "Video";
    riskBadge.textContent = item.rightsRisk?.label || "Unknown";
    riskBadge.classList.add(`risk-${item.rightsRisk?.level || "unknown"}`);
    riskBadge.title = riskTitle(item.rightsRisk);
    duration.textContent = item.duration;
    watch.href = item.url;

    copyUrl.addEventListener("click", async () => {
      await navigator.clipboard.writeText(item.url);
      copyUrl.textContent = "Copied";
      setTimeout(() => {
        copyUrl.textContent = "Copy URL";
      }, 1400);
    });

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

    momentsToggle.addEventListener("click", async () => {
      const showing = !moments.hidden;
      moments.hidden = showing;
      momentsToggle.textContent = showing ? "Find moments" : "Hide moments";

      if (showing || moments.dataset.loaded) return;

      moments.dataset.loaded = "true";
      moments.innerHTML = `<p class="moments-note">Scanning public timestamps in the description and top comments...</p>`;

      try {
        const response = await fetch(`/.netlify/functions/moments?videoId=${encodeURIComponent(item.id)}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Moment search failed.");
        renderMoments(moments, item, payload);
      } catch (error) {
        moments.replaceChildren();
        const problem = document.createElement("p");
        problem.className = "moments-note error-text";
        problem.textContent = cleanText(error.message);
        moments.append(problem);
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
    videoKind: videoKindInput.value,
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
