// ===== Audio engine (fast start) =====
let itVoice = null;
let audioReady = false;

function pickItalianVoice() {
  const voices = speechSynthesis.getVoices();
  itVoice = voices.find(v => /it-|Italian/i.test(v.lang) || /Italian/i.test(v.name)) || voices[0] || null;
}

function primeAudio() {
  if (audioReady) return;
  pickItalianVoice();
  const u = new SpeechSynthesisUtterance("pronto");
  u.lang = itVoice?.lang || "it-IT";
  u.volume = 0.01;
  u.onend = () => {
    audioReady = true;
    setBadge("Audio prêt", false);
  };
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

window.speechSynthesis.onvoiceschanged = () => pickItalianVoice();
window.addEventListener("pointerdown", primeAudio, { once:true });
window.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") primeAudio(); }, { once:true });

export function speak(text) {
  if (!text) return;
  if (!audioReady) primeAudio();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = itVoice?.lang || "it-IT";
  if (itVoice) u.voice = itVoice;
  u.rate = 0.98;
  u.pitch = 1.0;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  incRevision(1);
}

// ===== Settings & Theme =====
const LS = {
  theme: "it-theme",
  showFR: "it-show-fr",
  quiz: "it-quiz-enabled",
  countTotal: "it-rev-total",
  countPage: (p) => `it-rev-${p}`
};

export const Settings = {
  page: document.body?.dataset?.page || "home",
  get theme(){ return localStorage.getItem(LS.theme) || "dark"; },
  set theme(v){ localStorage.setItem(LS.theme, v); setTheme(v); },
  get showFR(){ return (localStorage.getItem(LS.showFR) ?? "1") === "1"; },
  set showFR(v){ localStorage.setItem(LS.showFR, v?"1":"0"); applyFR(v); },
  get quiz(){ return (localStorage.getItem(LS.quiz) ?? "0") === "1"; },
  set quiz(v){ localStorage.setItem(LS.quiz, v?"1":"0"); }
};

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
}
function applyFR(show) {
  document.body.classList.toggle("hide-fr", !show);
}

// ===== Controls Injection =====
export function injectControls() {
  setTheme(Settings.theme);
  applyFR(Settings.showFR);

  const bar = document.createElement("div");
  bar.className = "controls";
  bar.innerHTML = `
    <button id="toggle-theme" class="ghost">${Settings.theme==="dark"?"☀️ Mode clair":"🌙 Mode sombre"}</button>
    <button id="toggle-fr">${Settings.showFR?"Masquer FR":"Afficher FR"}</button>
    <button id="toggle-quiz" class="${Settings.quiz?"": "ghost"}">🎯 ${Settings.quiz?"Quitter le quiz":"Mode Quiz"}</button>
    <span id="audio-state" class="badge warn">Activer l'audio : touche Entrée / 1er clic</span>
    <span id="rev-badge" class="badge">Révisions : <strong id="rev-count">0</strong></span>
  `;
  document.querySelector("nav")?.after(bar);

  document.getElementById("toggle-theme").onclick = () => {
    Settings.theme = Settings.theme === "dark" ? "light" : "dark";
    document.getElementById("toggle-theme").textContent = Settings.theme==="dark"?"☀️ Mode clair":"🌙 Mode sombre";
  };
  document.getElementById("toggle-fr").onclick = () => {
    Settings.showFR = !Settings.showFR;
    document.getElementById("toggle-fr").textContent = Settings.showFR?"Masquer FR":"Afficher FR";
  };
  document.getElementById("toggle-quiz").onclick = () => {
    Settings.quiz = !Settings.quiz;
    document.getElementById("toggle-quiz").classList.toggle("ghost", !Settings.quiz);
    document.getElementById("toggle-quiz").textContent = Settings.quiz? "🎯 Quitter le quiz" : "Mode Quiz";
    document.dispatchEvent(new CustomEvent("quiz-toggle", {detail:Settings.quiz}));
  };

  // Init counter
  updateCounterUI();
}

function setBadge(text, warn=true){
  const s = document.querySelector("#audio-state");
  if (s){ s.textContent = text; s.className = warn ? "badge warn" : "badge"; }
}

// ===== Revision Counter =====
export function incRevision(n=1){
  const total = (parseInt(localStorage.getItem(LS.countTotal)||"0")+n);
  localStorage.setItem(LS.countTotal, String(total));
  const pageKey = LS.countPage(Settings.page);
  const pv = (parseInt(localStorage.getItem(pageKey)||"0")+n);
  localStorage.setItem(pageKey, String(pv));
  updateCounterUI();
}
export function updateCounterUI(){
  const total = parseInt(localStorage.getItem(LS.countTotal)||"0");
  const el = document.getElementById("rev-count");
  if (el) el.textContent = String(total);
}

// ===== Fetch/helper =====
export async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error("Impossible de charger "+path);
  return await res.json();
}
export function createCard(html) { const div=document.createElement("div"); div.className="card"; div.innerHTML=html; return div; }
export function renderSearch(container, onSearch) {
  const bar = document.createElement("div");
  bar.className = "searchbar";
  bar.innerHTML = `
    <input id="search" placeholder="Filtrer (italien ou français)..." aria-label="Filtrer">
    <button id="clear" class="ghost">Effacer</button>
  `;
  const input = bar.querySelector("#search");
  const clear = bar.querySelector("#clear");
  input.addEventListener("input", () => onSearch(input.value.trim().toLowerCase()));
  clear.addEventListener("click", () => { input.value = ""; onSearch(""); input.focus(); });
  container.appendChild(bar);
}
export function hi(text, q) {
  if (!q) return text;
  try {
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,"ig");
    return text.replace(re, "<mark>$1</mark>");
  } catch { return text; }
}

// ===== Quiz Engine =====
export function setupQuizHost(container, items) {
  let askFR = true;
  let current = null;
  const host = document.createElement("div");
  host.className = "quiz";
  const content = document.createElement("div");
  host.appendChild(content);
  container.prepend(host);

  const draw = () => {
    if (!Settings.quiz){ host.style.display = "none"; return; }
    host.style.display = "";
    content.innerHTML = "";
    if (!current) current = pickQuestion();
    const q = document.createElement("div");
    q.className = "q";
    q.innerHTML = askFR
      ? `Traduire en <strong>italien</strong> : « ${current.fr} »`
      : `Traduire en <strong>français</strong> : « ${current.it} »`;
    const tools = document.createElement("div");
    tools.style.display="flex"; tools.style.gap="8px"; tools.style.marginBottom="8px";
    const bListen = document.createElement("button"); bListen.textContent="🔊 Écouter"; bListen.onclick=()=>speak(current.it);
    const bSwap = document.createElement("button"); bSwap.className="ghost"; bSwap.textContent= askFR ? "Question en IT" : "Question en FR"; bSwap.onclick=()=>{askFR=!askFR; current=null; draw();};
    const bNext = document.createElement("button"); bNext.className="ghost"; bNext.textContent="⏭️ Passer"; bNext.onclick=()=>{current=null; draw();};
    tools.append(bListen,bSwap,bNext);

    const opts = document.createElement("div");
    opts.className = "opts";
    const choices = buildChoices(items, current, 4);
    choices.forEach(choice => {
      const btn = document.createElement("button");
      btn.textContent = askFR ? choice.it : (choice.fr);
      btn.onclick = () => {
        if (choice === current){
          btn.classList.add("correct");
          incRevision(2);
          setTimeout(()=>{ current=null; draw(); }, 500);
        } else {
          btn.classList.add("wrong");
        }
      };
      opts.appendChild(btn);
    });

    content.append(q, tools, opts);
  };

  function pickQuestion(){ return items[Math.floor(Math.random()*items.length)]; }
  function buildChoices(pool, correct, n=4){
    const others = pool.filter(x=>x!==correct);
    const out = [correct];
    while(out.length<n && others.length){
      const i = Math.floor(Math.random()*others.length);
      out.push(others.splice(i,1)[0]);
    }
    for (let i=out.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [out[i],out[j]]=[out[j],out[i]]; }
    return out;
  }

  draw();
  document.addEventListener("quiz-toggle", () => draw());
}

// ===== Event delegation for audio buttons =====
document.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-it]");
  if (b){ speak(b.dataset.it); }
});

