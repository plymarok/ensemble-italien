// App global (sans modules) — version mobile-safe
(function(){
  var App = window.App = {};

  /* ===================== Utils ===================== */
  App.hi = function(text, q){
    if(!q) return text;
    try{
      var safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return text.replace(new RegExp('('+safe+')','ig'), '<mark>$1</mark>');
    }catch(e){ return text; }
  };
  App.createCard = function(html){
    var d = document.createElement('div'); d.className='card'; d.innerHTML=html; return d;
  };
  App.renderSearch = function(container, onSearch){
    var bar = document.createElement('div'); bar.className='searchbar';
    bar.innerHTML = '<input id="search" placeholder="Filtrer (italien ou français)..." aria-label="Filtrer">'
                  + '<button id="clear" class="ghost">Effacer</button>';
    var input = bar.querySelector('#search'); var clear = bar.querySelector('#clear');
    input.addEventListener('input', function(){ onSearch((input.value||'').trim().toLowerCase()); });
    clear.addEventListener('click', function(){ input.value=''; onSearch(''); input.focus(); });
    container.appendChild(bar);
  };
  App.loadJSON = function(path){
    if (window.fetch){
      return fetch(path, {cache:'no-store'}).then(function(r){
        if(!r.ok) throw new Error('HTTP '+r.status+' pour '+path);
        return r.json();
      });
    } else {
      return new Promise(function(res,rej){
        var x=new XMLHttpRequest(); x.open('GET', path, true);
        x.setRequestHeader('Cache-Control','no-cache');
        x.onreadystatechange=function(){
          if(x.readyState===4){
            if(x.status>=200 && x.status<300){ res(JSON.parse(x.responseText)); }
            else { rej(new Error('XHR '+x.status)); }
          }
        };
        x.send();
      });
    }
  };

  /* ================== Speech Synthesis ================== */
  var itVoice=null, audioReady=false, primingPromise=null, queue=[];
  function setBadge(text, warn){
    var s=document.querySelector('#audio-state');
    if(s){ s.textContent=text; s.className = warn===false ? 'badge' : 'badge warn'; }
  }

  function getVoicesSafe(){ try { return speechSynthesis.getVoices() || []; } catch(e){ return []; } }
  function pickItalianVoice(){
    var voices = getVoicesSafe();
    itVoice = null;
    for(var i=0;i<voices.length;i++){
      if(/it-|Italian/i.test(voices[i].lang) || /Italian/i.test(voices[i].name)){ itVoice=voices[i]; break; }
    }
    if(!itVoice) itVoice = voices[0] || null;
  }
  function waitForVoices(timeoutMs){
    return new Promise(function(resolve){
      var start=Date.now();
      (function loop(){
        var v = getVoicesSafe();
        if (v && v.length){ return resolve(); }
        if (Date.now()-start > (timeoutMs||2000)) return resolve();
        setTimeout(loop, 100);
      })();
    });
  }

  function primeAudio(){
    if (audioReady) return Promise.resolve();
    if (primingPromise) return primingPromise;

    primingPromise = (async function(){
      if (!window.speechSynthesis) return;
      await waitForVoices(2500);
      pickItalianVoice();

      return new Promise(function(resolve){
        try{
          var u = new SpeechSynthesisUtterance('pronto');
          u.lang = (itVoice && itVoice.lang) ? itVoice.lang : 'it-IT';
          u.volume = 0.01;
          u.onend = function(){ resolve(); };
          u.onerror = function(){ resolve(); };
          // ⚠️ Ne PAS cancel ici (iOS annule tout si on cancel trop tôt)
          speechSynthesis.speak(u);
        }catch(e){ resolve(); }
      }).then(function(){
        audioReady = true;
        setBadge('Audio prêt', false);
        // Lire la dernière phrase demandée pendant le prime
        if (queue.length){
          var last = queue[queue.length-1];
          queue.length = 0;
          speakNow(last);
        }
        primingPromise = null;
      });
    })();

    return primingPromise;
  }

  function speakNow(text){
    try{
      var u=new SpeechSynthesisUtterance(text);
      u.lang=(itVoice&&itVoice.lang)?itVoice.lang:'it-IT';
      if(itVoice) u.voice=itVoice;
      u.rate=0.98; u.pitch=1.0;
      // Ici, un seul cancel juste avant la vraie lecture (pas pendant le prime)
      try { speechSynthesis.cancel(); } catch(e){}
      speechSynthesis.speak(u);
      App.incRevision(1);
    }catch(e){}
  }

  App.speak = function(text){
    if(!text) return;
    if (!window.speechSynthesis){
      alert('La synthèse vocale n’est pas disponible sur ce navigateur.');
      return;
    }
    if (!audioReady){
      // Met en file d’attente et lance un prime unique
      queue.push(text);
      primeAudio();
      return;
    }
    speakNow(text);
  };

  // Déclencheurs “gestes utilisateur” multiples pour maximiser le support mobile
  function onFirstGesture(){
    primeAudio();
    var btn=document.getElementById('activate-audio');
    if(btn){ btn.disabled=true; btn.textContent='🔊 Audio prêt'; }
  }
  ['pointerdown','click','touchstart','keydown'].forEach(function(evt){
    window.addEventListener(evt, onFirstGesture, { once:true });
  });
  if (window.speechSynthesis){
    window.speechSynthesis.onvoiceschanged = function(){ if(!audioReady) pickItalianVoice(); };
  }

  // Délégation clic boutons data-it (fallback sans .closest)
  document.addEventListener('click', function(e){
    var el=e.target;
    while(el && el!==document){
      if(el.tagName==='BUTTON' && el.hasAttribute('data-it')){
        App.speak(el.getAttribute('data-it'));
        break;
      }
      el=el.parentNode;
    }
  });

  /* ============= Settings / Toggles / Compteur ============= */
  var LS = { theme:'it-theme', showFR:'it-show-fr', quiz:'it-quiz-enabled', countTotal:'it-rev-total' };
  App.settings = {
    get theme(){ return localStorage.getItem(LS.theme) || 'dark'; },
    set theme(v){ localStorage.setItem(LS.theme, v); setTheme(v); },
    get showFR(){ return (localStorage.getItem(LS.showFR)||'1')==='1'; },
    set showFR(v){ localStorage.setItem(LS.showFR, v?'1':'0'); applyFR(v); },
    get quiz(){ return (localStorage.getItem(LS.quiz)||'0')==='1'; },
    set quiz(v){ localStorage.setItem(LS.quiz, v?'1':'0'); document.dispatchEvent(new CustomEvent('quiz-toggle',{detail:v})); }
  };
  function setTheme(t){ document.documentElement.setAttribute('data-theme', t==='light'?'light':'dark'); }
  function applyFR(show){ document.body.classList.toggle('hide-fr', !show); }

  App.injectControls = function(){
    setTheme(App.settings.theme); applyFR(App.settings.showFR);
    var bar = document.createElement('div'); bar.className='controls';
    bar.innerHTML = ''
      + '<button id="toggle-theme" class="ghost">'+(App.settings.theme==='dark'?'☀️ Mode clair':'🌙 Mode sombre')+'</button>'
      + '<button id="toggle-fr">'+(App.settings.showFR?'Masquer FR':'Afficher FR')+'</button>'
      + '<button id="toggle-quiz" class="'+(App.settings.quiz?'':'ghost')+'">🎯 '+(App.settings.quiz?'Quitter le quiz':'Mode Quiz')+'</button>'
      + '<button id="activate-audio">🔊 Activer l’audio</button>'
      + '<span id="audio-state" class="badge warn">En attente d’un appui…</span>'
      + '<span id="rev-badge" class="badge">Révisions : <strong id="rev-count">0</strong></span>';
    var nav=document.querySelector('nav'); if(nav) nav.parentNode.insertBefore(bar, nav.nextSibling);

    document.getElementById('toggle-theme').onclick=function(){
      App.settings.theme = App.settings.theme==='dark'?'light':'dark';
      this.textContent = App.settings.theme==='dark'?'☀️ Mode clair':'🌙 Mode sombre';
    };
    document.getElementById('toggle-fr').onclick=function(){
      App.settings.showFR = !App.settings.showFR;
      this.textContent = App.settings.showFR?'Masquer FR':'Afficher FR';
    };
    document.getElementById('toggle-quiz').onclick=function(){
      App.settings.quiz = !App.settings.quiz;
      this.classList.toggle('ghost', !App.settings.quiz);
      this.textContent = App.settings.quiz ? '🎯 Quitter le quiz' : 'Mode Quiz';
    };
    document.getElementById('activate-audio').onclick=function(){
      primeAudio().then(function(){
        var b=document.getElementById('activate-audio');
        if(b){ b.disabled=true; b.textContent='🔊 Audio prêt'; }
      });
    };

    App.updateCounterUI();
  };

  App.incRevision = function(n){
    n=n||1;
    var total = parseInt(localStorage.getItem(LS.countTotal)||'0') + n;
    localStorage.setItem(LS.countTotal, String(total));
    App.updateCounterUI();
  };
  App.updateCounterUI = function(){
    var el=document.getElementById('rev-count'); if(el) el.textContent = String(parseInt(localStorage.getItem(LS.countTotal)||'0'));
  };

  /* ======================= Quiz ======================= */
  App.setupQuizHost = function(container, items){
    var askFR = true, current=null;
    var host=document.createElement('div'); host.className='quiz';
    var content=document.createElement('div'); host.appendChild(content);
    container.prepend(host);

    function pick(){ return items[Math.floor(Math.random()*items.length)]; }
    function choices(pool, correct, n){
      n=n||4; var others=pool.filter(function(x){return x!==correct;});
      var out=[correct]; while(out.length<n && others.length){ out.push(others.splice(Math.floor(Math.random()*others.length),1)[0]); }
      for(var i=out.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=out[i]; out[i]=out[j]; out[j]=t; }
      return out;
    }
    function draw(){
      if(!App.settings.quiz){ host.style.display='none'; return; }
      host.style.display='';
      content.innerHTML='';
      if(!current) current=pick();
      var q=document.createElement('div'); q.className='q';
      q.innerHTML = askFR ? 'Traduire en <strong>italien</strong> : « '+current.fr+' »'
                          : 'Traduire en <strong>français</strong> : « '+current.it+' »';
      var tools=document.createElement('div'); tools.style.display='flex'; tools.style.gap='8px'; tools.style.marginBottom='8px';
      var bListen=document.createElement('button'); bListen.textContent='🔊 Écouter'; bListen.onclick=function(){ App.speak(current.it); };
      var bSwap=document.createElement('button'); bSwap.className='ghost'; bSwap.textContent=askFR?'Question en IT':'Question en FR';
      bSwap.onclick=function(){ askFR=!askFR; current=null; draw(); };
      var bNext=document.createElement('button'); bNext.className='ghost'; bNext.textContent='⏭️ Passer'; bNext.onclick=function(){ current=null; draw(); };
      tools.appendChild(bListen); tools.appendChild(bSwap); tools.appendChild(bNext);

      var opts=document.createElement('div'); opts.className='opts';
      choices(items, current, 4).forEach(function(choice){
        var btn=document.createElement('button'); btn.textContent = askFR ? choice.it : choice.fr;
        btn.onclick=function(){
          if(choice===current){ btn.classList.add('correct'); App.incRevision(2); setTimeout(function(){ current=null; draw(); }, 500); }
          else { btn.classList.add('wrong'); }
        };
        opts.appendChild(btn);
      });

      content.appendChild(q); content.appendChild(tools); content.appendChild(opts);
    }
    draw();
    document.addEventListener('quiz-toggle', draw);
  };
})();
