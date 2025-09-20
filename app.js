// App global — version classique (Web Speech pur)
// Un appui sur 🔊 -> prononce la phrase. Pas de bouton d’activation, pas de bip, pas de lib externe.
(function(){
  var App = window.App = {};

  /* ------------------------------ Utils ------------------------------ */
  App.hi = function(text, q){
    if(!q) return text;
    try{
      var safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return text.replace(new RegExp("("+safe+")","ig"), "<mark>$1</mark>");
    }catch(e){ return text; }
  };
  App.createCard = function(html){
    var d = document.createElement("div"); d.className="card"; d.innerHTML=html; return d;
  };
  App.renderSearch = function(container, onSearch){
    var bar = document.createElement("div"); bar.className="searchbar";
    bar.innerHTML = '<input id="search" placeholder="Filtrer (italien ou français)..." aria-label="Filtrer">'
                  + '<button id="clear" class="ghost">Effacer</button>';
    var input = bar.querySelector("#search"); var clear = bar.querySelector("#clear");
    input.addEventListener("input", function(){ onSearch((input.value||"").trim().toLowerCase()); });
    clear.addEventListener("click", function(){ input.value=""; onSearch(""); input.focus(); });
    container.appendChild(bar);
  };
  App.loadJSON = function(path){
    if (window.fetch){
      return fetch(path, {cache:"no-store"}).then(function(r){
        if(!r.ok) throw new Error("HTTP "+r.status+" pour "+path);
        return r.json();
      });
    } else {
      return new Promise(function(res,rej){
        var x=new XMLHttpRequest(); x.open("GET", path, true);
        x.setRequestHeader("Cache-Control","no-cache");
        x.onreadystatechange=function(){
          if(x.readyState===4){
            if(x.status>=200&&x.status<300) res(JSON.parse(x.responseText));
            else rej(new Error("XHR "+x.status));
          }
        };
        x.send();
      });
    }
  };

  /* --------------------------- Audio (Web Speech) --------------------------- */
  // Objectif: comportement “comme au début”. On:
  // - utilise uniquement speechSynthesis
  // - choisit une voix italienne quand dispo
  // - lit sur pointerdown (mieux accepté mobile) + click en secours
  // - pas de cancel() pour éviter les annulations iOS
  var itVoice = null;
  function pickVoice(){
    try{
      var vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
      itVoice = null;
      for (var i=0;i<vs.length;i++){
        if (/^it(-|_|$)/i.test(vs[i].lang) || /ital/i.test(vs[i].name)) { itVoice = vs[i]; break; }
      }
      // si aucune italienne trouvée, on laissera u.lang='it-IT' sans voice
    }catch(e){ itVoice = null; }
  }
  if ("speechSynthesis" in window){
    speechSynthesis.onvoiceschanged = pickVoice;
    // première tentative de sélection (certains navigateurs remplissent plus tard)
    setTimeout(pickVoice, 0);
  }

  function speakNow(text){
    try{
      if (!("speechSynthesis" in window)) return;
      var u = new SpeechSynthesisUtterance(text);
      if (itVoice){ u.voice = itVoice; u.lang = itVoice.lang; }
      else { u.lang = "it-IT"; }
      u.rate = 1.0; u.pitch = 1.0;
      speechSynthesis.speak(u);
      App.incRevision(1);
    }catch(e){}
  }

  // Si les voix ne sont pas encore prêtes, on attend un peu (max ~1s) puis on parle.
  function speak(text){
    if (!text) return;
    if (!("speechSynthesis" in window)) return; // rien à faire si non supporté
    var tries = 0;
    (function waitAndSpeak(){
      var ready = (speechSynthesis.getVoices()||[]).length > 0;
      if (!ready && tries < 10){ tries++; return setTimeout(waitAndSpeak, 100); }
      if (!itVoice) pickVoice();
      speakNow(text);
    })();
  }

  // Déclenchement sur pointerdown (mobile) + click (desktop/secours)
  function handleSpeakEvent(e){
    var n = e.target;
    // closest poly simple
    while(n && n!==document){
      if (n.tagName==="BUTTON" && n.hasAttribute("data-it")){
        // éviter double déclenchement pointerdown + click
        if (handleSpeakEvent._armed){
          handleSpeakEvent._armed = false;
          return;
        }
        handleSpeakEvent._armed = true;
        setTimeout(function(){ handleSpeakEvent._armed = false; }, 250);
        e.preventDefault();
        speak(n.getAttribute("data-it"));
        break;
      }
      n = n.parentNode;
    }
  }
  document.addEventListener("pointerdown", handleSpeakEvent, {passive:false});
  document.addEventListener("click",       handleSpeakEvent, {passive:false});

  /* --------------------- Settings / Toggles / Compteur --------------------- */
  var LS = { theme:"it-theme", showFR:"it-show-fr", quiz:"it-quiz-enabled", countTotal:"it-rev-total" };
  App.settings = {
    get theme(){ return localStorage.getItem(LS.theme) || "dark"; },
    set theme(v){ localStorage.setItem(LS.theme, v); setTheme(v); },
    get showFR(){ return (localStorage.getItem(LS.showFR)||"1")==="1"; },
    set showFR(v){ localStorage.setItem(LS.showFR, v?"1":"0"); applyFR(v); },
    get quiz(){ return (localStorage.getItem(LS.quiz)||"0")==="1"; },
    set quiz(v){ localStorage.setItem(LS.quiz, v?"1":"0"); document.dispatchEvent(new CustomEvent("quiz-toggle",{detail:v})); }
  };
  function setTheme(t){ document.documentElement.setAttribute("data-theme", t==="light"?"light":"dark"); }
  function applyFR(show){ document.body.classList.toggle("hide-fr", !show); }

  App.injectControls = function(){
    setTheme(App.settings.theme); applyFR(App.settings.showFR);
    var bar = document.createElement("div"); bar.className="controls";
    bar.innerHTML = ''
      + '<button id="toggle-theme" class="ghost">'+(App.settings.theme==="dark"?"☀️ Mode clair":"🌙 Mode sombre")+'</button>'
      + '<button id="toggle-fr">'+(App.settings.showFR?"Masquer FR":"Afficher FR")+'</button>'
      + '<button id="toggle-quiz" class="'+(App.settings.quiz?"":"ghost")+'">🎯 '+(App.settings.quiz?"Quitter le quiz":"Mode Quiz")+'</button>'
      + '<span id="rev-badge" class="badge">Révisions : <strong id="rev-count">0</strong></span>';
    var nav=document.querySelector("nav"); if(nav) nav.parentNode.insertBefore(bar, nav.nextSibling);

    document.getElementById("toggle-theme").onclick=function(){
      App.settings.theme = App.settings.theme==="dark"?"light":"dark";
      this.textContent = App.settings.theme==="dark"?"☀️ Mode clair":"🌙 Mode sombre";
    };
    document.getElementById("toggle-fr").onclick=function(){
      App.settings.showFR = !App.settings.showFR;
      this.textContent = App.settings.showFR?"Masquer FR":"Afficher FR";
    };
    document.getElementById("toggle-quiz").onclick=function(){
      App.settings.quiz = !App.settings.quiz;
      this.classList.toggle("ghost", !App.settings.quiz);
      this.textContent = App.settings.quiz ? "🎯 Quitter le quiz" : "Mode Quiz";
    };

    App.updateCounterUI();
  };
  App.incRevision = function(n){
    n=n||1;
    var total = parseInt(localStorage.getItem(LS.countTotal)||"0") + n;
    localStorage.setItem(LS.countTotal, String(total));
    App.updateCounterUI();
  };
  App.updateCounterUI = function(){
    var el=document.getElementById("rev-count"); if(el) el.textContent = String(parseInt(localStorage.getItem(LS.countTotal)||"0"));
  };

  /* --------------------------------- Quiz --------------------------------- */
  App.setupQuizHost = function(container, items){
    var askFR = true, current=null;
    var host=document.createElement("div"); host.className="quiz";
    var content=document.createElement("div"); host.appendChild(content);
    container.prepend(host);

    function pick(){ return items[Math.floor(Math.random()*items.length)]; }
    function choices(pool, correct
