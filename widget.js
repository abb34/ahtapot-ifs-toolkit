// Ahtapot ERP Toolkit — widget.js v2
// Page context'te calisir (content script degil)
// chrome.storage yok — postMessage ile content.js ile haberlesir

(function () {
  if (window.__ahtapotWidget) return;
  window.__ahtapotWidget = true;

  var NOTE_COLORS = [
    { hex: '#fef08a', name: 'Sari' },
    { hex: '#bbf7d0', name: 'Yesil' },
    { hex: '#fecaca', name: 'Kirmizi' },
    { hex: '#bae6fd', name: 'Mavi' },
    { hex: '#e9d5ff', name: 'Mor' },
  ];

  var selectedColor = '#fef08a';
  var panelOpen = false;
  var wakeLockActive = false;
  var wakeLockSentinel = null;

  // ── CSS enjeksiyonu ─────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('ahtapot-widget-css')) return;
    var s = document.createElement('style');
    s.id = 'ahtapot-widget-css';
    s.textContent = [
      '#ahtapot-widget{position:fixed;bottom:20px;right:20px;z-index:2147483640;display:flex;align-items:flex-end;gap:10px;font-family:IBM Plex Sans,Segoe UI,Arial,sans-serif}',
      '#ahtapot-panel{display:none;width:270px;background:#0d1117;border:1px solid #30363d;border-radius:14px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.7);position:relative}',
      '#ahtapot-panel::after{content:"";position:absolute;right:-8px;bottom:24px;width:0;height:0;border-top:8px solid transparent;border-bottom:8px solid transparent;border-left:8px solid #30363d}',
      '#ahtapot-panel.open{animation:aht-pop 0.25s cubic-bezier(0.34,1.56,0.64,1)}',
      '@keyframes aht-pop{from{opacity:0;transform:scale(0.85) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}',
      '#ahtapot-fab{position:relative;width:64px;height:74px;cursor:pointer;flex-shrink:0}',
      '#ahtapot-fab-body{animation:aht-float 3s ease-in-out infinite}',
      '#ahtapot-fab.active #ahtapot-fab-body{animation:aht-float-active 1.4s ease-in-out infinite}',
      '@keyframes aht-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}',
      '@keyframes aht-float-active{0%,100%{transform:translateY(0) scale(1.05)}50%{transform:translateY(-10px) scale(1.05)}}',
      '.aht-leg{transform-box:fill-box;transform-origin:center top;animation:aht-wave 2.5s ease-in-out infinite}',
      '.aht-leg:nth-child(1){animation-delay:0s}.aht-leg:nth-child(2){animation-delay:0.2s}.aht-leg:nth-child(3){animation-delay:0.4s}.aht-leg:nth-child(4){animation-delay:0.6s}.aht-leg:nth-child(5){animation-delay:0.8s}',
      '@keyframes aht-wave{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}',
      '#ahtapot-fab.active .aht-leg{animation:aht-wave-fast 0.7s ease-in-out infinite}',
      '#ahtapot-fab.active .aht-leg:nth-child(1){animation-delay:0s}#ahtapot-fab.active .aht-leg:nth-child(2){animation-delay:0.14s}#ahtapot-fab.active .aht-leg:nth-child(3){animation-delay:0.28s}#ahtapot-fab.active .aht-leg:nth-child(4){animation-delay:0.42s}#ahtapot-fab.active .aht-leg:nth-child(5){animation-delay:0.56s}',
      '@keyframes aht-wave-fast{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(14deg)}}',
      '#aht-wl-badge{position:absolute;top:0;right:0;width:16px;height:16px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px rgba(34,197,94,0.7);display:flex;align-items:center;justify-content:center;font-size:8px;opacity:0;transition:opacity 0.3s;color:#fff;font-weight:700}',
      '#aht-wl-badge.visible{opacity:1}',
      '#aht-aura{position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);width:50px;height:14px;background:#8b5cf6;filter:blur(18px);opacity:0.15;transition:all 0.5s;pointer-events:none}',
      '#ahtapot-fab.active #aht-aura{background:#22c55e;opacity:0.5;width:70px}',
      '.aht-header{display:flex;align-items:center;gap:8px;padding:10px 14px;background:linear-gradient(135deg,rgba(107,45,139,0.2),rgba(155,77,200,0.1));border-bottom:1px solid #1f2937}',
      '.aht-wl-row{display:flex;align-items:center;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #1f2937}',
      '.aht-wl-label{display:flex;align-items:center;gap:7px;font-size:12px;color:#e6edf3}',
      '.aht-wl-dot{width:7px;height:7px;border-radius:50%;background:#484f58;transition:background 0.3s,box-shadow 0.3s}',
      '.aht-wl-dot.on{background:#22c55e;box-shadow:0 0 6px rgba(34,197,94,0.7)}',
      '.aht-wl-pill{width:36px;height:20px;background:#30363d;border-radius:10px;position:relative;cursor:pointer;transition:background 0.25s;flex-shrink:0;border:none;padding:0}',
      '.aht-wl-pill::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;background:#fff;border-radius:50%;transition:left 0.25s}',
      '.aht-wl-pill.on{background:#22c55e}.aht-wl-pill.on::after{left:18px}',
      '.aht-sec{padding:10px 14px;border-bottom:1px solid #1f2937}.aht-sec:last-child{border-bottom:none}',
      '.aht-lbl{font-size:10px;font-weight:600;color:#7d8590;letter-spacing:.8px;text-transform:uppercase;margin-bottom:7px}',
      '.aht-ta{width:100%;background:#161b22;border:1px solid #30363d;border-radius:6px;color:#e6edf3;padding:7px 9px;font-size:12px;font-family:inherit;resize:none;height:58px;outline:none;box-sizing:border-box;line-height:1.4;transition:border-color .15s}',
      '.aht-ta:focus{border-color:#9B4DC8}',
      '.aht-colors{display:flex;gap:4px;margin-top:6px}',
      '.aht-color{width:15px;height:15px;border-radius:3px;cursor:pointer;border:2px solid transparent;flex-shrink:0;transition:border-color .1s}',
      '.aht-btn{background:#6B2D8B;border:none;color:#fff;border-radius:6px;padding:5px 12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:background .15s}',
      '.aht-btn:hover{background:#9B4DC8}',
      '.aht-btn-row{display:flex;align-items:center;gap:6px;margin-top:7px}',
      '.aht-tmpl{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:7px;background:#161b22;border:1px solid #30363d;margin-bottom:5px;cursor:default;transition:border-color .15s,background .15s}',
      '.aht-tmpl:hover{border-color:#9B4DC8;background:#1a0d2e}',
      '.aht-run{background:rgba(0,194,168,0.15);border:1px solid rgba(0,194,168,0.4);color:#00c2a8;border-radius:5px;padding:4px 9px;font-size:10px;cursor:pointer;font-family:inherit;font-weight:600;white-space:nowrap;flex-shrink:0;transition:background .15s}',
      '.aht-run:hover{background:rgba(0,194,168,0.28)}',
      '#ahtapot-feedback{position:fixed;bottom:100px;right:20px;z-index:2147483641;background:#161b22;border:1px solid #9B4DC8;border-radius:8px;padding:8px 14px;font-size:12px;color:#e9d5ff;font-family:IBM Plex Sans,Segoe UI,Arial,sans-serif;box-shadow:0 4px 14px rgba(107,45,139,0.45);pointer-events:none}',
    ].join('');
    document.head.appendChild(s);
  }

  // ── Widget inşa et ──────────────────────────────────────
  function buildWidget() {
    if (document.getElementById('ahtapot-widget')) return;
    injectStyles();

    var wrap = document.createElement('div');
    wrap.id = 'ahtapot-widget';
    document.body.appendChild(wrap);

    var panel = document.createElement('div');
    panel.id = 'ahtapot-panel';
    wrap.appendChild(panel);
    buildPanel(panel);

    var fab = buildFAB();
    wrap.appendChild(fab);

    document.addEventListener('click', function(e) {
      var w = document.getElementById('ahtapot-widget');
      if (w && !w.contains(e.target)) closePanel();
    }, true);

    document.addEventListener('mousemove', function(e) {
      var pl = document.getElementById('aht-pupil-l');
      var pr = document.getElementById('aht-pupil-r');
      var sv = document.getElementById('aht-body-svg');
      if (!pl || !pr || !sv) return;
      var rect = sv.getBoundingClientRect();
      var dx = e.clientX - (rect.left + rect.width / 2);
      var dy = e.clientY - (rect.top + rect.height / 2);
      var mx = Math.max(-3, Math.min(3, dx / 20));
      var my = Math.max(-3, Math.min(3, dy / 20));
      pl.setAttribute('transform', 'translate(' + mx + ',' + my + ')');
      pr.setAttribute('transform', 'translate(' + mx + ',' + my + ')');
    });
  }

  // ── SVG Ahtapot FAB ────────────────────────────────────
  function buildFAB() {
    var fab = document.createElement('div');
    fab.id = 'ahtapot-fab';
    fab.title = 'Ahtapot — ERP Toolkit';
    fab.innerHTML = [
      '<div id="aht-aura"></div>',
      '<div id="aht-wl-badge">&#128274;</div>',
      '<div id="ahtapot-fab-body">',
      '<svg id="aht-body-svg" viewBox="0 0 64 74" width="64" height="74" xmlns="http://www.w3.org/2000/svg">',
      '<ellipse class="aht-leg" cx="10" cy="58" rx="5" ry="11" fill="#c084fc" opacity="0.9"/>',
      '<ellipse class="aht-leg" cx="21" cy="63" rx="5" ry="11" fill="#c084fc" opacity="0.9"/>',
      '<ellipse class="aht-leg" cx="32" cy="65" rx="5" ry="11" fill="#c084fc" opacity="0.9"/>',
      '<ellipse class="aht-leg" cx="43" cy="63" rx="5" ry="11" fill="#c084fc" opacity="0.9"/>',
      '<ellipse class="aht-leg" cx="54" cy="58" rx="5" ry="11" fill="#c084fc" opacity="0.9"/>',
      '<ellipse cx="32" cy="33" rx="22" ry="24" fill="#e9d5ff" id="aht-body-el"/>',
      '<circle cx="23" cy="29" r="5" fill="#6d28d9"/>',
      '<g id="aht-pupil-l"><circle cx="23" cy="29" r="2.2" fill="white"/></g>',
      '<circle cx="41" cy="29" r="5" fill="#6d28d9"/>',
      '<g id="aht-pupil-r"><circle cx="41" cy="29" r="2.2" fill="white"/></g>',
      '<path id="aht-mouth" d="M26 38 Q32 44 38 38" stroke="#6d28d9" stroke-width="2" fill="none" stroke-linecap="round"/>',
      '</svg></div>',
    ].join('');
    fab.onclick = togglePanel;
    return fab;
  }

  // ── Panel içeriği ───────────────────────────────────────
  function buildPanel(panel) {
    var hdr = document.createElement('div');
    hdr.className = 'aht-header';
    hdr.innerHTML = [
      '<svg viewBox="0 0 22 22" width="20" height="20"><ellipse cx="11" cy="10" rx="8" ry="8" fill="#e9d5ff"/><circle cx="8" cy="9" r="2.2" fill="#6d28d9"/><circle cx="14" cy="9" r="2.2" fill="#6d28d9"/><path d="M8 12.5 Q11 15.5 14 12.5" stroke="#6d28d9" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>',
      '<div style="flex:1"><div style="font-size:12px;font-weight:600;color:#e6edf3">Ahtapot</div>',
      '<div id="ahtapot-page-info" style="font-size:10px;color:#7d8590;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px">' + document.title.slice(0,30) + '</div></div>',
      '<button onclick="(function(){var p=document.getElementById(\'ahtapot-panel\');if(p){p.style.display=\'none\';p.classList.remove(\'open\')}window.__ahtapotPanelOpen=false})()" style="background:none;border:none;color:#7d8590;cursor:pointer;font-size:18px;line-height:1;padding:2px 4px">&#215;</button>',
    ].join('');
    panel.appendChild(hdr);

    var wlRow = document.createElement('div');
    wlRow.className = 'aht-wl-row';
    wlRow.innerHTML = [
      '<div class="aht-wl-label">',
      '<div class="aht-wl-dot" id="aht-wl-dot"></div>',
      '<span id="aht-wl-text">Ekran kilidi kapalı</span>',
      '</div>',
      '<button class="aht-wl-pill" id="aht-wl-pill" title="Ekran kilidini engelle"></button>',
    ].join('');
    panel.appendChild(wlRow);
    wlRow.querySelector('#aht-wl-pill').onclick = toggleWakeLock;

    var noteSec = document.createElement('div');
    noteSec.className = 'aht-sec';
    noteSec.innerHTML = '<div class="aht-lbl">&#128204; Hızlı Not</div>';
    var ta = document.createElement('textarea');
    ta.className = 'aht-ta';
    ta.id = 'ahtapot-note-text';
    ta.placeholder = 'Bu sayfa için not ekle...';
    noteSec.appendChild(ta);

    var btnRow = document.createElement('div');
    btnRow.className = 'aht-btn-row';
    var colorRow = document.createElement('div');
    colorRow.className = 'aht-colors';
    NOTE_COLORS.forEach(function(c) {
      var dot = document.createElement('div');
      dot.className = 'aht-color';
      dot.dataset.color = c.hex;
      dot.title = c.name;
      dot.style.background = c.hex;
      dot.style.borderColor = (c.hex === selectedColor) ? '#9B4DC8' : 'transparent';
      dot.onclick = function() {
        selectedColor = c.hex;
        colorRow.querySelectorAll('.aht-color').forEach(function(d) {
          d.style.borderColor = d.dataset.color === selectedColor ? '#9B4DC8' : 'transparent';
        });
      };
      colorRow.appendChild(dot);
    });
    btnRow.appendChild(colorRow);
    var addBtn = document.createElement('button');
    addBtn.className = 'aht-btn';
    addBtn.style.marginLeft = 'auto';
    addBtn.textContent = '+ Not Ekle';
    addBtn.onclick = function() { addNote(ta); };
    btnRow.appendChild(addBtn);
    noteSec.appendChild(btnRow);
    panel.appendChild(noteSec);

    var rptSec = document.createElement('div');
    rptSec.className = 'aht-sec';
    rptSec.innerHTML = '<div class="aht-lbl">&#128202; Kayıtlı Raporlar</div>';
    var listEl = document.createElement('div');
    listEl.id = 'ahtapot-templates-list';
    listEl.innerHTML = '<div style="font-size:11px;color:#7d8590;padding:4px 0">Yükleniyor...</div>';
    rptSec.appendChild(listEl);
    panel.appendChild(rptSec);
  }

  // ── Wake Lock ───────────────────────────────────────────
  function toggleWakeLock() {
    if (wakeLockActive) { releaseWakeLock(); } else { requestWakeLock(); }
  }

  function requestWakeLock() {
    if (!('wakeLock' in navigator)) {
      showFeedback('⚠️ Bu tarayıcı Wake Lock desteklemiyor');
      return;
    }
    navigator.wakeLock.request('screen').then(function(sentinel) {
      wakeLockSentinel = sentinel;
      wakeLockActive = true;
      updateWakeLockUI(true);
      showFeedback('🔒 Ekran kilidi aktif');
      sentinel.addEventListener('release', function() {
        wakeLockActive = false;
        wakeLockSentinel = null;
        updateWakeLockUI(false);
      });
    }).catch(function(err) {
      showFeedback('⚠️ Wake Lock: ' + err.message);
    });
  }

  function releaseWakeLock() {
    if (wakeLockSentinel) {
      wakeLockSentinel.release().then(function() {
        wakeLockActive = false;
        wakeLockSentinel = null;
        updateWakeLockUI(false);
        showFeedback('🔓 Ekran kilidi kaldırıldı');
      }).catch(function() {});
    }
  }

  function updateWakeLockUI(on) {
    var pill   = document.getElementById('aht-wl-pill');
    var dot    = document.getElementById('aht-wl-dot');
    var text   = document.getElementById('aht-wl-text');
    var badge  = document.getElementById('aht-wl-badge');
    var fab    = document.getElementById('ahtapot-fab');
    var bodyEl = document.getElementById('aht-body-el');
    var mouth  = document.getElementById('aht-mouth');
    if (on) {
      pill   && pill.classList.add('on');
      dot    && dot.classList.add('on');
      text   && (text.textContent = 'Ekran kilidi aktif');
      badge  && badge.classList.add('visible');
      fab    && fab.classList.add('active');
      bodyEl && bodyEl.setAttribute('fill', '#bbf7d0');
      mouth  && mouth.setAttribute('d', 'M25 37 Q32 44 39 37');
    } else {
      pill   && pill.classList.remove('on');
      dot    && dot.classList.remove('on');
      text   && (text.textContent = 'Ekran kilidi kapalı');
      badge  && badge.classList.remove('visible');
      fab    && fab.classList.remove('active');
      bodyEl && bodyEl.setAttribute('fill', '#e9d5ff');
      mouth  && mouth.setAttribute('d', 'M26 38 Q32 44 38 38');
    }
  }

  document.addEventListener('visibilitychange', function() {
    if (wakeLockActive && document.visibilityState === 'visible' && !wakeLockSentinel) {
      requestWakeLock();
    }
  });

  // ── Not ekleme ──────────────────────────────────────────
  function addNote(ta) {
    var text = ta.value.trim();
    if (!text) {
      ta.style.borderColor = '#f85149';
      setTimeout(function() { ta.style.borderColor = '#30363d'; }, 1000);
      return;
    }
    var note = {
      id: String(Date.now()), text: text, color: selectedColor,
      date: new Date().toLocaleDateString('tr-TR'),
      x: 20 + Math.floor(Math.random() * 60),
      y: 180 + Math.floor(Math.random() * 80),
    };
    window.postMessage({ type: 'AHTAPOT_ADD_NOTE', note: note, pageKey: window.location.href }, '*');
    ta.value = '';
    showFeedback('📌 Not eklendi!');
  }

  // ── Şablon listesi ──────────────────────────────────────
  function renderTemplateList(templates) {
    var listEl = document.getElementById('ahtapot-templates-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!templates.length) {
      listEl.innerHTML = '<div style="font-size:11px;color:#7d8590;padding:4px 0">Kayıtlı şablon yok<br><span style="font-size:10px;color:#484f58">Popup arayüzünden şablon yükleyin</span></div>';
      return;
    }
    templates.forEach(function(tmpl, i) {
      var row = document.createElement('div');
      row.className = 'aht-tmpl';
      var icon = document.createElement('span');
      icon.style.fontSize = '14px';
      icon.textContent = '📊';
      row.appendChild(icon);
      var info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0';
      var nm = document.createElement('div');
      nm.style.cssText = 'font-size:11px;font-weight:600;color:#e6edf3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      nm.textContent = tmpl.name || ('Şablon ' + (i + 1));
      var mt = document.createElement('div');
      mt.style.cssText = 'font-size:10px;color:#7d8590;margin-top:1px';
      var pc = (tmpl.analysis && tmpl.analysis.headerPlaceholders) ? tmpl.analysis.headerPlaceholders.length : 0;
      var bc = (tmpl.analysis && tmpl.analysis.blocks) ? tmpl.analysis.blocks.length : 0;
      mt.textContent = pc + ' alan, ' + bc + ' blok';
      info.appendChild(nm); info.appendChild(mt);
      row.appendChild(info);
      var runBtn = document.createElement('button');
      runBtn.className = 'aht-run';
      runBtn.textContent = '▶ Çalıştır';
      runBtn.onclick = function(e) {
        e.stopPropagation();
        closePanel();
        showFeedback('Rapor hazırlanıyor...');
        window.postMessage({ type: 'AHTAPOT_QUICK_REPORT', templateIndex: i, pageUrl: window.location.href }, '*');
      };
      row.appendChild(runBtn);
      listEl.appendChild(row);
    });
  }

  // ── Panel aç/kapat ──────────────────────────────────────
  function togglePanel() {
    panelOpen = !panelOpen;
    var panel = document.getElementById('ahtapot-panel');
    if (!panel) return;
    if (panelOpen) {
      panel.style.display = 'block';
      panel.classList.add('open');
      var pi = document.getElementById('ahtapot-page-info');
      if (pi) pi.textContent = document.title.slice(0, 30);
      window.postMessage({ type: 'AHTAPOT_GET_TEMPLATES' }, '*');
    } else {
      panel.style.display = 'none';
      panel.classList.remove('open');
    }
  }

  function closePanel() {
    panelOpen = false;
    var panel = document.getElementById('ahtapot-panel');
    if (panel) { panel.style.display = 'none'; panel.classList.remove('open'); }
  }

  // ── Feedback toast ──────────────────────────────────────
  function showFeedback(msg) {
    var existing = document.getElementById('ahtapot-feedback');
    if (existing) existing.remove();
    var fb = document.createElement('div');
    fb.id = 'ahtapot-feedback';
    fb.textContent = msg;
    document.body.appendChild(fb);
    setTimeout(function() { if (fb.parentNode) fb.remove(); }, 2200);
  }

  // ── Mesaj dinleyicileri ─────────────────────────────────
  // Widget dil stringleri
  var wStrings = {
    wakeLockOn: 'Ekran kilidi aktif', wakeLockOff: 'Ekran kilidi kapalı',
    note: 'Hızlı Not', notePlaceholder: 'Bu sayfa için not ekle...',
    addNote: '+ Not Ekle', reports: 'Kayıtlı Raporlar',
    run: '▶ Çalıştır', noTemplate: 'Kayıtlı şablon yok',
    noTemplateHint: 'Popup arayüzünden şablon yükleyin',
    loading: 'Yükleniyor...',
  };

  window.addEventListener('message', function(ev) {
    if (!ev.data || ev.source !== window) return;
    if (ev.data.type === 'AHTAPOT_TEMPLATES_RESPONSE') {
      renderTemplateList(ev.data.templates || []);
    }
    // Dil güncelleme
    if (ev.data.type === 'AHTAPOT_SET_LANG' && ev.data.strings) {
      Object.assign(wStrings, ev.data.strings);
      applyWidgetLang();
    }
  });

  function applyWidgetLang() {
    var wlText = document.getElementById('aht-wl-text');
    if (wlText) {
      wlText.textContent = wlText.textContent.includes('aktif') || wlText.textContent.includes('active') || wlText.textContent.includes('attivo')
        ? wStrings.wakeLockOn : wStrings.wakeLockOff;
    }
    var ta = document.getElementById('ahtapot-note-text');
    if (ta) ta.placeholder = wStrings.notePlaceholder;
    // Section labellar
    document.querySelectorAll('.aht-lbl').forEach(function(el) {
      if (el.textContent.includes('Not') || el.textContent.includes('Note') || el.textContent.includes('Nota')) {
        el.textContent = '📌 ' + wStrings.note;
      } else if (el.textContent.includes('Rapor') || el.textContent.includes('Report')) {
        el.textContent = '📊 ' + wStrings.reports;
      }
    });
    // Add note button
    document.querySelectorAll('.aht-btn').forEach(function(btn) {
      if (btn.textContent.includes('Not') || btn.textContent.includes('Note') || btn.textContent.includes('Nota')) {
        btn.textContent = wStrings.addNote;
      }
    });
    // Run buttons
    document.querySelectorAll('.aht-run').forEach(function(btn) {
      btn.textContent = wStrings.run;
    });
  }

  window.addEventListener('message', function(ev) {
    if (!ev.data || ev.data.type !== 'AHTAPOT_DO_REPORT') return;
    var d = ev.data;
    if (!window.IFSReportEngine || !window.XLSXWriter) {
      showFeedback('Rapor motoru hazır değil');
      return;
    }
    window.IFSReportEngine.generateReport({
      templateBuffer: new Uint8Array(d.template.buffer).buffer,
      headerData: d.headerRecord,
      lineData: d.lineRecords && d.lineRecords.length ? d.lineRecords : null,
      blockName: d.blockName,
      envName: d.hostname
    }).then(function(buf) {
      var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = (d.template.name || 'rapor') + '-' + new Date().toISOString().slice(0,10) + '.xlsx';
      a.click();
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
      showFeedback('Rapor indirildi!');
    }).catch(function(err) {
      showFeedback('Hata: ' + err.message);
    });
  });

  // ── Init ────────────────────────────────────────────────
  if (document.body) {
    buildWidget();
  } else {
    document.addEventListener('DOMContentLoaded', buildWidget);
  }

  setInterval(function() {
    var pi = document.getElementById('ahtapot-page-info');
    if (pi) pi.textContent = document.title.slice(0, 30);
  }, 2000);

})();
