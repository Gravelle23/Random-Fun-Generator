// js/app.js — Resilient Random Fun Generator (BoredAPI + Giphy)
// Uses VITE_GIPHY_API_KEY from .env (restart Vite after editing .env)

const $ = (s) => document.querySelector(s);

// DOM
const form = $("#filters");
const statusEl = $("#status");
const resultSection = document.querySelector(".result");
const activityCard = $("#activityCard");
const activityText = $("#activityText");
const activityMeta = $("#activityMeta");
const gifImg = $("#gif");
const gifCaption = $("#gifCaption");
const favoritesList = $("#favoritesList");
const clearFavsBtn = $("#clearFavs");
const saveBtn = $("#saveBtn");
const anotherBtn = $("#anotherBtn");

// Inputs
const typeInput = $("#type");
const participantsInput = $("#participants");
const maxpriceInput = $("#maxprice");

// Env
const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY?.trim();

// State
let currentActivity = null;
let currentGif = null;

//  Utils 
function priceLabel(p) {
  if (p === 0) return "Free";
  if (p < 0.3) return "Low";
  if (p < 0.6) return "Medium";
  return "High";
}
function setBusy(b) { resultSection?.setAttribute("aria-busy", String(b)); }
function setStatus(msg) { statusEl.textContent = msg || ""; }
function show(el) { if (el) el.hidden = false; }
function hide(el) { if (el) el.hidden = true; }

async function fetchJSONWithTimeout(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function deriveTag(text) {
  const words = (text || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  const vocab = [
    "music","dance","game","gaming","exercise","workout","cook","cooking","draw","art",
    "outdoors","nature","learn","coding","cat","dog","funny","meme","travel","study",
    "chill","relax","party","movie","sports","basketball","football","volleyball"
  ];
  return words.find((w) => vocab.includes(w)) || "funny";
}

// APIs with fallbacks 
async function fetchActivity(filters = {}) {
  const buildUrl = (base) => {
    const u = new URL(`${base}/api/activity`);
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== "" && v !== null && v !== undefined) u.searchParams.set(k, v);
    });
    return u.toString();
  };

  const candidates = [
    "https://www.boredapi.com",
    "http://www.boredapi.com" // fallback if https/DNS blocked
  ];

  for (const base of candidates) {
    try {
      const url = buildUrl(base);
      console.log("[BoredAPI try] →", url);
      return await fetchJSONWithTimeout(url, 12000);
    } catch (e) {
      console.warn(`[BoredAPI fail @ ${base}]`, e);
    }
  }

  // Local fallback list so UI still works
  console.warn("[BoredAPI] using local fallback");
  const local = [
    { activity: "Go for a 30-minute walk and take 5 photos", type: "recreational", participants: 1, price: 0 },
    { activity: "Learn a new card trick", type: "education", participants: 1, price: 0 },
    { activity: "Cook a new recipe with 5 ingredients", type: "cooking", participants: 1, price: 0.2 },
    { activity: "Host a quick trivia game with friends", type: "social", participants: 3, price: 0 },
    { activity: "Do a 15-minute stretch routine", type: "relaxation", participants: 1, price: 0 }
  ];
  return local[Math.floor(Math.random() * local.length)];
}

async function fetchGif(tag) {
  // live Giphy 
  if (GIPHY_API_KEY) {
    try {
      const url = new URL("https://api.giphy.com/v1/gifs/random");
      url.searchParams.set("api_key", GIPHY_API_KEY);
      url.searchParams.set("tag", tag);
      url.searchParams.set("rating", "pg");
      console.log("[Giphy] →", url.toString());
      const json = await fetchJSONWithTimeout(url.toString(), 12000);
      const d = json?.data;
      if (d?.images?.original?.url) return d;
      throw new Error("No GIF in response");
    } catch (e) {
      console.warn("[Giphy live failed]", e);
    }
  } else {
    console.warn("Missing VITE_GIPHY_API_KEY — using fallback GIF.");
  }

  // Fallback GIF (always works)
  return {
    images: { original: { url: "https://media.giphy.com/media/ASd0Ukj0y3qMM/giphy.gif" },
              fixed_height_small: { url: "https://media.giphy.com/media/ASd0Ukj0y3qMM/giphy.gif" } },
    title: "Fallback GIF"
  };
}

// Quote feature
async function fetchQuote() {
  const url = "https://api.quotable.io/random";
  try {
    const res = await fetchJSONWithTimeout(url, 8000);
    return { text: res.content, author: res.author };
  } catch (e) {
    console.warn("[Quote fetch failed]", e);
    return { text: "Do something today that your future self will thank you for.", author: "Unknown" };
  }
}

function renderQuote(q) {
  if (!quoteEl || !authorEl) return 
  quoteEl.textContent = `"{q.text}"`;
  authorEl.textContent = `-${q.author}`;
  currentQuote = q;
}

// Rendering 
function renderActivity(a) {
  activityText.textContent = a.activity;
  activityMeta.innerHTML = `
    <li><strong>Type:</strong> ${a.type}</li>
    <li><strong>Participants:</strong> ${a.participants}</li>
    <li><strong>Price:</strong> ${priceLabel(a.price)}</li>
  `;
  show(activityCard);
}

function renderGif(gif, caption = "") {
  const url = gif.images?.original?.url || "";
  gifImg.src = url;
  gifImg.alt = caption || gif.title || "Random GIF";
  gifCaption.textContent = caption || gif.title || "Random GIF";
}

// Favorites 
function readFavs() { try { return JSON.parse(localStorage.getItem("rfg-favs") || "[]"); } catch { return []; } }
function writeFavs(f) { localStorage.setItem("rfg-favs", JSON.stringify(f)); }
function renderFavorites() {
  const favs = readFavs();
  favoritesList.innerHTML = favs.map(f => `
    <li>
      <p>${f.activityText}</p>
      <img src="${f.gifUrl}" alt="Saved GIF" />
      <button class="btn" data-id="${f.id}">Remove</button>
    </li>
  `).join("");
  favoritesList.querySelectorAll("button[data-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      writeFavs(readFavs().filter(x => x.id !== id));
      renderFavorites();
    });
  });
}

//  Actions 
async function generate() {
  const filters = {
    type: typeInput.value,
    participants: participantsInput.value || "",
    maxprice: maxpriceInput.value || ""
  };

  try {
    setStatus("Finding something fun…");
    setBusy(true);

    // Activity (with fallbacks)
    const activity = await fetchActivity(filters);
    renderActivity(activity);
    currentActivity = activity;

    // GIF (with fallback)
    const tag = deriveTag(activity.activity);
    const gif = await fetchGif(tag);
    renderGif(gif);
    currentGif = gif;

    setStatus("Here you go!");
  } catch (e) {
    console.error("[Generate error]", e);
    setStatus(e.message || "Something went wrong.");
    hide(activityCard);
  } finally {
    setBusy(false);
  }
}

function saveFavorite() {
  if (!currentActivity || !currentGif) return;
  const favs = readFavs();
  favs.unshift({
    id: crypto.randomUUID(),
    activityText: currentActivity.activity,
    gifUrl: currentGif.images?.fixed_height_small?.url || currentGif.images?.original?.url || ""
  });
  writeFavs(favs);
  renderFavorites();
  setStatus("Saved to favorites.");
}

// Share feature
function getShareText() {
  const activity = currentActivity?.activity || "A fun activity";
  const quote = currentQuote?.text ? `\n${currentQuote.text} -${currentQuote.author}` : "";
  return `${activity}${quote}\n\n${location.href}`;
}

async function shareCurrent() {
  const text = getShareText();
  const shareData = { title: "Random Fun Generator", text, url: location.href };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
  } else {
    await navigator.clipboard.writeText(text);
    alert("copied to clipboard!");
    }
  } catch (e) {
    console.error("[Share failed]", e);
    await navigator.clipboard.writeText(text);
    alert("copied to clipboard instead!");
  }
}


// Dark mode feature
const THEME_KEY = "theme";

function applyTheme(theme) {
  const html = document.documentElement;
  const isDark = theme === "dark";
  html.classList.toggle("dark", isDark);
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
}

function initTheme() {
  const stored = local.Storage.getItem(THEME_KEY);
  if (stored) 
    return applyTheme(stored);
  const prefersDark = window.matchMedia("(prefers-colorscheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
}

function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY) || "light";
  (document.documentElement.classList.contains ("dark") ? "dark" : "light");
  applyTheme(current === "dark" ? "light" : "dark");
}

// Events
themeToggle?.addEventListener("click", toggleTheme);
shareBtn?.addEventListener("click", shareCurrent); 
form.addEventListener("submit", (e) => { e.preventDefault(); generate(); });
anotherBtn.addEventListener("click", (e) => { e.preventDefault(); generate(); });
saveBtn.addEventListener("click", (e) => { e.preventDefault(); saveFavorite(); });
clearFavsBtn.addEventListener("click", () => { localStorage.removeItem("rfg-favs"); renderFavorites(); setStatus("Favorites cleared."); });


renderFavorites();
initTheme();