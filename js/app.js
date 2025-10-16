// Random Fun Generator (BoredAPI + Giphy)

const $ = (s) => document.querySelector(s);

// Simple debounce
const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// Offline banner
const offlineBanner = document.createElement("div");
offlineBanner.textContent = "You’re offline — using cached data when possible.";
offlineBanner.style.cssText = "display:none;background:#fde68a;color:#5b3a00;padding:.5rem;text-align:center;font-size:.9rem;";
document.body.prepend(offlineBanner);
window.addEventListener("offline", () => (offlineBanner.style.display = "block"));
window.addEventListener("online",  () => (offlineBanner.style.display = "none"));

// DOM
const form = $("#filters");
const statusEl = $("#status");
const resultSection = document.querySelector(".result");
const activityCard = $("#activityCard");
const activityText = $("#activityText");
const activityMeta = $("#activityMeta");
const gifCaptionEl = $("#gifCaption");
const favoritesList = $("#favoritesList");
const clearFavsBtn = $("#clearFavs");
const saveBtn = $("#saveBtn");
const anotherBtn = $("#anotherBtn");

const gifImg = document.getElementById("gif");
const shareBtn = document.getElementById("shareBtn");
const themeToggle = document.getElementById("themeToggle");
const quoteEl = document.getElementById("quote");
const authorEl = document.getElementById("author");
const typeInput = document.getElementById("type");
const participantsInput = document.getElementById("participants");
const maxpriceInput = document.getElementById("maxprice");

let currentQuote = null;
let currentActivity = null;
let currentGif = null;

// Env
const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY?.trim();

// Utils
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

// Fetch with timeout + error handling
async function fetchJSONWithTimeout(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const body = await res.text();
    if (!body) throw new Error("Empty response");
    return JSON.parse(body);
  } finally {
    clearTimeout(t);
  }
}

function deriveTag(text) {
  const words = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const vocab = [
    "music","dance","game","gaming","exercise","workout","cook","cooking","draw","art",
    "outdoors","nature","learn","coding","cat","dog","funny","meme","travel","study",
    "chill","relax","party","movie","sports","basketball","football","volleyball"
  ];
  return words.find((w) => vocab.includes(w)) || "funny";
}

// API
const PROXY = "https://api.allorigins.win/raw";

// BoredAPI (Activity)
async function fetchActivity(filters = {}) {
  const direct = new URL("https://www.boredapi.com/api/activity");
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== "" && v !== null && v !== undefined) direct.searchParams.set(k, v);
  });
  direct.searchParams.set("_", Date.now().toString());

  try {
    return await fetchJSONWithTimeout(direct.toString(), 12000);
  } catch (e) {
    console.warn("[BoredAPI direct failed]", e);
  }

  try {
    const proxy = new URL(PROXY);
    proxy.searchParams.set("url", encodeURIComponent(direct.toString()));
    return await fetchJSONWithTimeout(proxy.toString(), 12000);
  } catch (e) {
    console.error("[BoredAPI proxy failed]", e);
    throw new Error("Activity source unavailable.");
  }
}

// Giphy (GIF)
async function fetchGif(tag) {
  if (!GIPHY_API_KEY) {
    console.warn("Missing VITE_GIPHY_API_KEY — using fallback GIF.");
    return {
      images: { original: { url: "https://media.giphy.com/media/ASd0Ukj0y3qMM/giphy.gif" } },
      title: "Fallback GIF"
    };
  }

  // Direct request
  const base = new URL("https://api.giphy.com/v1/gifs/random");
  base.searchParams.set("api_key", GIPHY_API_KEY);
  base.searchParams.set("tag", tag || "funny");
  base.searchParams.set("rating", "pg");
  base.searchParams.set("_", Date.now().toString());

  try {
    const json = await fetchJSONWithTimeout(base.toString(), 12000);
    const d = json?.data;
    if (d?.images?.original?.url) return d;
    throw new Error("No GIF in response");
  } catch (e) {
    console.warn("[Giphy direct failed]", e);
  }

  // Proxy request
  try {
    const prox = new URL(PROXY);
    prox.searchParams.set("url", encodeURIComponent(base.toString()));
    const json = await fetchJSONWithTimeout(prox.toString(), 12000);
    const d = json?.data;
    if (d?.images?.original?.url) return d;
    throw new Error("No GIF in response (proxy)");
  } catch (e) {
    console.error("[Giphy proxy failed]", e);
  }

  // Final fallback
  return {
    images: { original: { url: "https://media.giphy.com/media/ASd0Ukj0y3qMM/giphy.gif" } },
    title: "Fallback GIF"
  };
}

// Quote fetch
async function fetchQuote() {
  try {
    const res = await fetchJSONWithTimeout("https://api.quotable.io/random", 8000);
    return { text: res.content, author: res.author };
  } catch {
    return { text: "Do something today that your future self will thank you for.", author: "Unknown" };
  }
}

function renderQuote(q) {
  if (!quoteEl || !authorEl) return;
  quoteEl.textContent = `"${q.text}"`;
  authorEl.textContent = `- ${q.author}`;
  currentQuote = q;
  localStorage.setItem("rfg-last-quote", JSON.stringify(q));
}


// Renderers
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
  const url = gif?.images?.original?.url || "";
  const alt = caption || gif?.title || "Random GIF";

  if (gifImg) { gifImg.src = url; gifImg.alt = alt; }

  if (gifCaptionEl) {
    const metaBits = [];
    if (gif?.username) metaBits.push(`by @${gif.username}`);
    if (gif?.rating) metaBits.push(`rating: ${gif.rating}`);
    if (gif?.import_datetime) metaBits.push(`added: ${gif.import_datetime.slice(0,10)}`);
    gifCaptionEl.textContent = [alt, metaBits.join(" • ")].filter(Boolean).join(" — ");
  }
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

function saveFilters() {
  const obj = {
    type: typeInput.value || "",
    participants: participantsInput.value || "",
    maxprice: maxpriceInput.value || ""
  };
  localStorage.setItem("rfg-filters", JSON.stringify(obj));
}
function restoreFilters() {
  try {
    const obj = JSON.parse(localStorage.getItem("rfg-filters") || "{}");
    if (obj.type !== undefined) typeInput.value = obj.type;
    if (obj.participants !== undefined) participantsInput.value = obj.participants;
    if (obj.maxprice !== undefined) maxpriceInput.value = obj.maxprice;
  } catch {}
}

// Main generation
async function generate() {

  const participantsVal = parseInt(participantsInput.value, 10);
  const participantsFilter = Number.isFinite(participantsVal) && participantsVal > 0 ? participantsVal : "";

  const filters = {
    type: typeInput.value,
    participants: participantsFilter,          
    maxprice: maxpriceInput.value || ""
  };

  try {
    setStatus("Finding something fun…");
    setBusy(true);

    let activity;
    try {
      activity = await fetchActivity(filters);
    } catch {
      const fallbackIdeas = [
        "Try a new drawing style",
        "Do 20 push-ups",
        "Learn a quick card trick",
        "Cook a 3-ingredient snack",
        "Clean one drawer",
        "Stretch for 10 minutes"
      ];
      const text = fallbackIdeas[Math.floor(Math.random() * fallbackIdeas.length)];
      activity = { 
        activity: text, 
        type: "random", 
        participants: participantsFilter || 1, 
        price: 0 
      };
      console.warn("[Activity warning] Using a quick idea while source is unavailable.");
    }

    renderActivity(activity);
    currentActivity = activity;

    const tag = deriveTag(activity.activity) || "funny";
    const gif = await fetchGif(tag);
    renderGif(gif);
    currentGif = gif;

    const quote = await fetchQuote();
    renderQuote(quote);

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

// Share text
function getShareText() {
  const activity = currentActivity?.activity || "A fun activity";
  const quote = currentQuote?.text ? `\n${currentQuote.text} -${currentQuote.author}` : "";
  return `${activity}${quote}\n\n${location.href}`;
}

// Theme
const THEME_KEY = "theme";
function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.classList.toggle("dark", isDark);
  localStorage.setItem(THEME_KEY, theme);
}
function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored) return applyTheme(stored);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
}
function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY) || "light";
  applyTheme(current === "dark" ? "light" : "dark");
}

// Events
themeToggle?.addEventListener("click", toggleTheme);

shareBtn?.addEventListener("click", async () => {
  const text = getShareText();
  try {
    if (navigator.share) {
      await navigator.share({ title: "Random Fun Generator", text, url: location.href });
    } else {
      await navigator.clipboard.writeText(text);
      alert("Copied to clipboard!");
    }
  } catch {
    await navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  }
});

initTheme();
restoreFilters();

form.addEventListener("submit", (e) => { 
  e.preventDefault(); 
  saveFilters(); 
  generate(); 
});

anotherBtn.addEventListener("click", (e) => { e.preventDefault(); generate(); });
saveBtn.addEventListener("click", (e) => { e.preventDefault(); saveFavorite(); });
clearFavsBtn.addEventListener("click", () => {
  localStorage.removeItem("rfg-favs");
  renderFavorites();
  setStatus("Favorites cleared.");
});
renderFavorites();
