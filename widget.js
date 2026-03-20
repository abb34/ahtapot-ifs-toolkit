// Ahtapot Widget — widget.js
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

  // content.js'den cevap dinle
  window.addEventListener('message', function(ev) {
    if (!ev.data || ev.source !== window) return;

    if (ev.data.type === 'AHTAPOT_TEMPLATES_RESPONSE') {
      renderTemplateList(ev.data.templates || []);
    }
  });

  function buildWidget() {
    if (document.getElementById('ahtapot-widget')) return;

    var wrap = ce('div');
    wrap.id = 'ahtapot-widget';
    css(wrap, 'position:fixed;bottom:20px;right:20px;z-index:2147483640;display:flex;flex-direction:column;align-items:flex-end;gap:8px');
    document.body.appendChild(wrap);

    // Trigger
    var btn = ce('button');
    btn.id = 'ahtapot-btn';
    btn.title = 'Ahtapot — ERP Toolkit';
    btn.textContent = String.fromCodePoint(0x1F419); // 🐙
    css(btn, [
      'width:44px','height:44px','border-radius:50%',
      'background:linear-gradient(135deg,#6B2D8B,#9B4DC8)',
      'border:none','cursor:pointer','font-size:22px',
      'box-shadow:0 4px 16px rgba(107,45,139,0.55)',
      'transition:transform 0.15s,box-shadow 0.15s',
      'line-height:1','padding:0',
    ].join(';'));

    btn.onmouseenter = function() {
      btn.style.transform = 'scale(1.1)';
      btn.style.boxShadow = '0 6px 22px rgba(107,45,139,0.75)';
    };
    btn.onmouseleave = function() {
      btn.style.transform = '';
      btn.style.boxShadow = '0 4px 16px rgba(107,45,139,0.55)';
    };
    btn.onclick = togglePanel;
    wrap.appendChild(btn);

    // Panel
    var panel = ce('div');
    panel.id = 'ahtapot-panel';
    css(panel, [
      'display:none','width:290px',
      'background:#0d1117',
      'border:1px solid #30363d',
      'border-radius:12px',
      'box-shadow:0 8px 32px rgba(0,0,0,0.65)',
      'overflow:hidden',
      'font-family:IBM Plex Sans,Segoe UI,Arial,sans-serif',
    ].join(';'));
    wrap.insertBefore(panel, btn);

    buildHeader(panel);
    buildNoteSection(panel);
    buildReportSection(panel);

    document.addEventListener('click', function(e) {
      var w = document.getElementById('ahtapot-widget');
      if (w && !w.contains(e.target)) closePanel();
    }, true);
  }

  function buildHeader(panel) {
    var h = ce('div');
    css(h, 'display:flex;align-items:center;gap:8px;padding:10px 14px;background:linear-gradient(135deg,rgba(107,45,139,0.2),rgba(155,77,200,0.1));border-bottom:1px solid #1f2937');

    var oct = ce('span');
    oct.textContent = String.fromCodePoint(0x1F419);
    oct.style.fontSize = '20px';
    h.appendChild(oct);

    var info = ce('div');
    info.style.flex = '1';

    var t = ce('div');
    t.style.cssText = 'font-size:12px;font-weight:600;color:#e6edf3';
    t.textContent = 'Ahtapot';
    info.appendChild(t);

    var pi = ce('div');
    pi.id = 'ahtapot-page-info';
    pi.style.cssText = 'font-size:10px;color:#7d8590;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px';
    pi.textContent = document.title.slice(0, 32);
    info.appendChild(pi);

    h.appendChild(info);

    var closeBtn = ce('button');
    css(closeBtn, 'background:none;border:none;color:#7d8590;cursor:pointer;font-size:20px;line-height:1;padding:2px 4px;border-radius:4px');
    closeBtn.textContent = 'x';
    closeBtn.onclick = closePanel;
    h.appendChild(closeBtn);

    panel.appendChild(h);
  }

  function buildNoteSection(panel) {
    var sec = ce('div');
    css(sec, 'padding:10px 14px;border-bottom:1px solid #1f2937');

    var lbl = ce('div');
    css(lbl, 'font-size:10px;font-weight:600;color:#7d8590;letter-spacing:.8px;text-transform:uppercase;margin-bottom:7px');
    lbl.textContent = String.fromCodePoint(0x1F4CC) + ' Hizli Not';
    sec.appendChild(lbl);

    var ta = ce('textarea');
    ta.id = 'ahtapot-note-text';
    ta.placeholder = 'Bu sayfa icin not ekle...';
    css(ta, [
      'width:100%','background:#161b22',
      'border:1px solid #30363d','border-radius:6px',
      'color:#e6edf3','padding:7px 9px',
      'font-size:12px','font-family:inherit',
      'resize:none','height:62px','outline:none',
      'box-sizing:border-box','line-height:1.4',
      'transition:border-color .15s',
    ].join(';'));
    ta.onfocus = function() { ta.style.borderColor = '#9B4DC8'; };
    ta.onblur = function() { ta.style.borderColor = '#30363d'; };
    sec.appendChild(ta);

    // Renk + buton satiri
    var row = ce('div');
    css(row, 'display:flex;align-items:center;gap:6px;margin-top:7px');

    var colorRow = ce('div');
    css(colorRow, 'display:flex;gap:4px');

    NOTE_COLORS.forEach(function(c) {
      var dot = ce('div');
      dot.dataset.color = c.hex;
      dot.title = c.name;
      css(dot, [
        'width:16px','height:16px','border-radius:3px',
        'background:' + c.hex,
        'cursor:pointer',
        'border:2px solid ' + (c.hex === selectedColor ? '#9B4DC8' : 'transparent'),
        'flex-shrink:0','transition:border-color .1s',
      ].join(';'));
      dot.onclick = function() {
        selectedColor = c.hex;
        colorRow.querySelectorAll('[data-color]').forEach(function(d) {
          d.style.borderColor = d.dataset.color === selectedColor ? '#9B4DC8' : 'transparent';
        });
      };
      colorRow.appendChild(dot);
    });
    row.appendChild(colorRow);

    var addBtn = ce('button');
    css(addBtn, [
      'margin-left:auto','background:#6B2D8B',
      'border:none','color:#fff',
      'border-radius:6px','padding:5px 12px',
      'font-size:11px','font-weight:600',
      'cursor:pointer','font-family:inherit',
      'transition:background .15s',
    ].join(';'));
    addBtn.textContent = '+ Not Ekle';
    addBtn.onmouseenter = function() { addBtn.style.background = '#9B4DC8'; };
    addBtn.onmouseleave = function() { addBtn.style.background = '#6B2D8B'; };
    addBtn.onclick = function() { addNote(ta); };
    row.appendChild(addBtn);

    sec.appendChild(row);
    panel.appendChild(sec);
  }

  function addNote(ta) {
    var text = ta.value.trim();
    if (!text) {
      ta.style.borderColor = '#f85149';
      setTimeout(function() { ta.style.borderColor = '#30363d'; }, 1000);
      return;
    }

    var note = {
      id: String(Date.now()),
      text: text,
      color: selectedColor,
      date: new Date().toLocaleDateString('tr-TR'),
      x: 20 + Math.floor(Math.random() * 60),
      y: 180 + Math.floor(Math.random() * 80),
    };

    // postMessage ile content.js'e ilet
    window.postMessage({
      type: 'AHTAPOT_ADD_NOTE',
      note: note,
      pageKey: window.location.href,
    }, '*');

    ta.value = '';
    showFeedback(String.fromCodePoint(0x1F4CC) + ' Not eklendi!');
  }

  function buildReportSection(panel) {
    var sec = ce('div');
    css(sec, 'padding:10px 14px');

    var lbl = ce('div');
    css(lbl, 'font-size:10px;font-weight:600;color:#7d8590;letter-spacing:.8px;text-transform:uppercase;margin-bottom:7px');
    lbl.textContent = String.fromCodePoint(0x1F4CA) + ' Kayitli Raporlar';
    sec.appendChild(lbl);

    var listEl = ce('div');
    listEl.id = 'ahtapot-templates-list';
    var empty = ce('div');
    css(empty, 'font-size:11px;color:#7d8590;padding:4px 0;line-height:1.5');
    empty.textContent = 'Yukleniyor...';
    listEl.appendChild(empty);
    sec.appendChild(listEl);

    panel.appendChild(sec);
  }

  function renderTemplateList(templates) {
    var listEl = document.getElementById('ahtapot-templates-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!templates.length) {
      var empty = ce('div');
      css(empty, 'font-size:11px;color:#7d8590;padding:4px 0;line-height:1.5');
      empty.textContent = 'Kayitli sablon yok';
      var sub = ce('div');
      css(sub, 'font-size:10px;color:#484f58;margin-top:2px');
      sub.textContent = 'Popup arayuzunden sablon yukleyin';
      empty.appendChild(sub);
      listEl.appendChild(empty);
      return;
    }

    templates.forEach(function(tmpl, i) {
      var row = ce('div');
      css(row, [
        'display:flex','align-items:center','gap:8px',
        'padding:7px 9px','border-radius:7px',
        'background:#161b22','border:1px solid #30363d',
        'margin-bottom:5px','cursor:pointer',
        'transition:border-color .15s,background .15s',
      ].join(';'));

      row.onmouseenter = function() {
        row.style.borderColor = '#9B4DC8';
        row.style.background = '#1a0d2e';
      };
      row.onmouseleave = function() {
        row.style.borderColor = '#30363d';
        row.style.background = '#161b22';
      };

      var icon = ce('span');
      icon.style.fontSize = '15px';
      icon.textContent = String.fromCodePoint(0x1F4CA);
      row.appendChild(icon);

      var info = ce('div');
      css(info, 'flex:1;min-width:0');

      var nameEl = ce('div');
      css(nameEl, 'font-size:11px;font-weight:600;color:#e6edf3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
      nameEl.textContent = tmpl.name || 'Sablon ' + (i + 1);
      info.appendChild(nameEl);

      var meta = ce('div');
      css(meta, 'font-size:10px;color:#7d8590;margin-top:1px');
      var pc = (tmpl.analysis && tmpl.analysis.headerPlaceholders) ? tmpl.analysis.headerPlaceholders.length : 0;
      var bc = (tmpl.analysis && tmpl.analysis.blocks) ? tmpl.analysis.blocks.length : 0;
      meta.textContent = pc + ' alan, ' + bc + ' blok';
      info.appendChild(meta);
      row.appendChild(info);

      var runBtn = ce('button');
      css(runBtn, [
        'background:rgba(0,194,168,0.15)',
        'border:1px solid rgba(0,194,168,0.4)',
        'color:#00c2a8','border-radius:5px',
        'padding:4px 9px','font-size:10px',
        'cursor:pointer','font-family:inherit',
        'font-weight:600','white-space:nowrap',
        'flex-shrink:0',
      ].join(';'));
      runBtn.textContent = String.fromCodePoint(0x25B6) + ' Calistir';
      runBtn.onmouseenter = function() { runBtn.style.background = 'rgba(0,194,168,0.28)'; };
      runBtn.onmouseleave = function() { runBtn.style.background = 'rgba(0,194,168,0.15)'; };
      runBtn.onclick = function(e) {
        e.stopPropagation();
        closePanel();
        showFeedback('Rapor hazirlaniyor...');
        // Popup açmadan direkt rapor oluştur ve indir
        window.postMessage({
          type: 'AHTAPOT_QUICK_REPORT',
          templateIndex: i,
          pageUrl: window.location.href
        }, '*');
      };
      row.appendChild(runBtn);

      listEl.appendChild(row);
    });
  }

  function togglePanel() {
    panelOpen = !panelOpen;
    var panel = document.getElementById('ahtapot-panel');
    if (!panel) return;

    if (panelOpen) {
      panel.style.display = 'block';
      var pi = document.getElementById('ahtapot-page-info');
      if (pi) pi.textContent = document.title.slice(0, 32);
      // Sablonlari iste
      window.postMessage({ type: 'AHTAPOT_GET_TEMPLATES' }, '*');
    } else {
      panel.style.display = 'none';
    }
  }

  function closePanel() {
    panelOpen = false;
    var panel = document.getElementById('ahtapot-panel');
    if (panel) panel.style.display = 'none';
  }

  function showFeedback(msg) {
    var existing = document.getElementById('ahtapot-feedback');
    if (existing) existing.remove();
    var fb = ce('div');
    fb.id = 'ahtapot-feedback';
    css(fb, [
      'position:fixed','bottom:72px','right:20px',
      'z-index:2147483641',
      'background:#161b22','border:1px solid #9B4DC8',
      'border-radius:8px','padding:8px 14px',
      'font-size:12px','color:#e9d5ff',
      'font-family:IBM Plex Sans,Segoe UI,Arial,sans-serif',
      'box-shadow:0 4px 14px rgba(107,45,139,0.45)',
      'pointer-events:none',
    ].join(';'));
    fb.textContent = msg;
    document.body.appendChild(fb);
    setTimeout(function() { if (fb.parentNode) fb.remove(); }, 2200);
  }

  // Yardimci: element olustur
  function ce(tag) { return document.createElement(tag); }
  function css(el, s) { el.style.cssText = s; }

  // AHTAPOT_DO_REPORT - content.js'den gelen rapor isteğini işle
  window.addEventListener('message', function(ev) {
    if (!ev.data || ev.data.type !== 'AHTAPOT_DO_REPORT') return;
    var d = ev.data;
    if (!window.IFSReportEngine || !window.XLSXWriter) {
      showFeedback('Rapor motoru hazir degil');
      return;
    }
    window.IFSReportEngine.generateReport({
      templateBuffer: new Uint8Array(d.template.buffer).buffer,
      headerData: d.headerRecord,
      lineData: d.lineRecords && d.lineRecords.length ? d.lineRecords : null,
      blockName: d.blockName,
      envName: d.hostname
    }).then(function(buf) {
      var blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
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

  // Init
  if (document.body) {
    buildWidget();
  } else {
    document.addEventListener('DOMContentLoaded', buildWidget);
  }

  // URL degisiminde baslik guncelle
  setInterval(function() {
    var pi = document.getElementById('ahtapot-page-info');
    if (pi) pi.textContent = document.title.slice(0, 32);
  }, 2000);

})();
