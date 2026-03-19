// IFS Cloud Toolkit — content.js
// İki görevi var:
// 1. injector.js'i page context'e inject et (fetch/XHR yakalamak için)
// 2. Background ile haberleş, sayfa üzerine UI elementleri ekle

(function () {
  if (window.__ifsToolkitContent) return;
  window.__ifsToolkitContent = true;

  // ─── PAGE → CONTENT BRIDGE ───────────────────────────
  // injector.js ve widget.js MAIN world'de manifest üzerinden yükleniyor
  // Bu bridge onların postMessage'larını dinler
  // injector.js ve widget.js'den gelen mesajları dinle
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || !event.data.type) return;

    // IFS OData verisi yakalandı → background'a ilet
    if (event.data.type === 'IFS_DATA_CAPTURED') {
      try {
        chrome.runtime.sendMessage({ type: 'DATA_CAPTURED', payload: event.data });
      } catch (e) {}
      return;
    }

    // Widget'tan not ekleme
    if (event.data.type === 'AHTAPOT_ADD_NOTE') {
      const { note, pageKey } = event.data;
      try {
        chrome.storage.local.get(['stickyNotes'], (data) => {
          if (chrome.runtime.lastError) return;
          const all = data.stickyNotes || {};
          if (!all[pageKey]) all[pageKey] = [];
          all[pageKey].push(note);
          chrome.storage.local.set({ stickyNotes: all });
          renderStickyNote(note);
        });
      } catch (e) {}
      return;
    }

    // Widget'tan şablon listesi isteği
    if (event.data.type === 'AHTAPOT_GET_TEMPLATES') {
      try {
        chrome.storage.local.get(['templates'], (data) => {
          if (chrome.runtime.lastError) return;
          window.postMessage({
            type: 'AHTAPOT_TEMPLATES_RESPONSE',
            templates: data.templates || [],
          }, '*');
        });
      } catch (e) {}
      return;
    }

    // Widget'tan hızlı rapor isteği
    if (event.data.type === 'AHTAPOT_QUICK_REPORT') {
      const { templateIndex } = event.data;
      try {
        chrome.storage.local.get(['templates'], (tData) => {
          if (chrome.runtime.lastError) return;
          const template = (tData.templates || [])[templateIndex];
          if (!template) {
            window.postMessage({ type: 'AHTAPOT_QUICK_REPORT_DONE', error: 'Şablon bulunamadı' }, '*');
            return;
          }
          // Background'dan veri al
          chrome.runtime.sendMessage({ type: 'GET_CACHE' }, (resp) => {
            if (!resp || !resp.cache || !resp.cache.length) {
              window.postMessage({ type: 'AHTAPOT_QUICK_REPORT_DONE', error: 'Veri yok' }, '*');
              return;
            }
            const headerEnt = resp.cache.find(e =>
              !e.entity.toLowerCase().includes('line') &&
              !e.entity.toLowerCase().includes('part')
            ) || resp.cache[0];
            const lineEnt = resp.cache.find(e => e !== headerEnt);

            // Header ve line verilerini al
            chrome.runtime.sendMessage({ type: 'GET_ENTITY_DATA', entity: headerEnt.entity }, (hResp) => {
              const headerRecord = hResp?.ok ? (hResp.records[0] || {}) : {};
              const getLine = (cb) => {
                if (lineEnt) {
                  chrome.runtime.sendMessage({ type: 'GET_ENTITY_DATA', entity: lineEnt.entity }, cb);
                } else { cb({ ok: false }); }
              };
              getLine((lResp) => {
                const lineRecords = lResp?.ok ? lResp.records : [];
                // content script'ten IFSReportEngine'e erişemeyiz
                // postMessage ile sayfaya gönder, page context'te çalışsın
                window.postMessage({
                  type: 'AHTAPOT_DO_REPORT',
                  template: template,
                  headerRecord: headerRecord,
                  lineRecords: lineRecords,
                  blockName: template.analysis?.blocks?.[0]?.name || 'LINES',
                  hostname: window.location.hostname
                }, '*');
              });
            });
          });
        });
      } catch(e) {}
      return;
    }
  });


  // ─── ORTAM BANNER ─────────────────────────────────────
  function injectEnvBanner(envConfig) {
    if (!envConfig) return;
    if (document.getElementById('ifs-toolkit-env-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'ifs-toolkit-env-banner';
    banner.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0;
      z-index: 999999;
      background: ${envConfig.color};
      color: ${envConfig.textColor || '#fff'};
      text-align: center;
      padding: 4px 8px;
      font-family: 'IBM Plex Sans', sans-serif;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 1px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      cursor: pointer;
    `;
    banner.textContent = `${envConfig.icon || '⚠️'} ${envConfig.label} ORTAMI ${envConfig.icon || '⚠️'}`;
    banner.title = 'IFS Toolkit ortam etiketi — ayarlardan değiştir';

    // Banner'a tıklanınca küçült/büyüt
    banner.addEventListener('click', () => {
      banner.style.display = 'none';
      createMiniDot(envConfig);
    });

    document.body.prepend(banner);

    // IFS header'ının altında kalması için body'ye padding ekle
    document.body.style.paddingTop = (parseInt(document.body.style.paddingTop || '0') + 28) + 'px';
  }

  function createMiniDot(envConfig) {
    const dot = document.createElement('div');
    dot.id = 'ifs-toolkit-env-dot';
    dot.style.cssText = `
      position: fixed;
      top: 8px; right: 8px;
      z-index: 999999;
      background: ${envConfig.color};
      width: 14px; height: 14px;
      border-radius: 50%;
      cursor: pointer;
      box-shadow: 0 0 6px ${envConfig.color};
      title: '${envConfig.label}';
    `;
    dot.title = envConfig.label + ' ortamı';
    dot.addEventListener('click', () => {
      dot.remove();
      document.getElementById('ifs-toolkit-env-banner') &&
        (document.getElementById('ifs-toolkit-env-banner').style.display = 'block');
      if (!document.getElementById('ifs-toolkit-env-banner')) injectEnvBanner(envConfig);
    });
    document.body.appendChild(dot);
  }

  // Ortam konfigürasyonunu kontrol et
  function checkEnvConfig() {
    try {
      const hostname = window.location.hostname;
      chrome.storage.local.get(['envConfigs'], (data) => {
        const configs = data.envConfigs || {};
        const config = configs[hostname];
        if (config && config.enabled !== false) {
          // DOM hazır olana kadar bekle
          if (document.body) {
            injectEnvBanner(config);
          } else {
            document.addEventListener('DOMContentLoaded', () => injectEnvBanner(config));
          }
        }
      });
    } catch (e) {}
  }

  // ─── STICKY NOTES ─────────────────────────────────────
  // Not store: { id, text, color, date, x, y }
  // Sayfa key: window.location.href (hash dahil)
  // IFS SPA olduğu için URL değişimlerini de izliyoruz

  const STICKY_Z = 2147483640; // max z-index
  const activeNotes = new Map(); // id → DOM element

  function getStickyPageKey() {
    // IFS'te kayıt URL'de şöyle görünür:
    // .../PurchaseOrderHandling/PurchaseOrder;$filter=OrderNo eq 'PO-001'
    // Hash veya query bazlı key kullan
    return window.location.href;
  }

  async function loadAndRenderNotes() {
    try {
      const pageKey = getStickyPageKey();
      chrome.storage.local.get(['stickyNotes'], (data) => {
        if (chrome.runtime.lastError) return;
        const allNotes = data.stickyNotes || {};
        const notes = allNotes[pageKey] || [];

        // Mevcut note DOM'larını temizle (URL değişiminde)
        activeNotes.forEach((el) => el.remove());
        activeNotes.clear();

        notes.forEach(note => renderStickyNote(note));
      });
    } catch (e) {}
  }

  // Widget.js'in kullanabilmesi için global'e expose et
  window.__ifsRenderSticky = function(note) { renderStickyNote(note); };

  function renderStickyNote(note) {
    // Zaten varsa güncelle
    if (activeNotes.has(note.id)) {
      activeNotes.get(note.id).remove();
    }

    const el = document.createElement('div');
    el.setAttribute('data-ifs-sticky-id', note.id);

    // Rengin açık/koyu olduğunu belirle
    const isDark = isColorDark(note.color || '#fef08a');
    const textColor = isDark ? '#f9fafb' : '#1f2937';
    const mutedColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.45)';
    const borderColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)';

    el.style.cssText = [
      'position: fixed',
      `left: ${Math.min(note.x || 20, window.innerWidth - 220)}px`,
      `top: ${Math.min(note.y || 200, window.innerHeight - 120)}px`,
      `z-index: ${STICKY_Z}`,
      'width: 220px',
      'min-height: 90px',
      `background: ${note.color || '#fef08a'}`,
      'border-radius: 6px',
      `box-shadow: 0 4px 16px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)`,
      'padding: 0',
      `font-family: 'IBM Plex Sans', 'Segoe UI', Arial, sans-serif`,
      'font-size: 13px',
      'overflow: hidden',
      `border: 1px solid ${borderColor}`,
    ].join('; ');

    el.innerHTML = `
      <div data-sticky-handle style="
        display: flex; align-items: center; justify-content: space-between;
        padding: 6px 8px 5px;
        cursor: grab;
        border-bottom: 1px solid ${borderColor};
        background: rgba(0,0,0,0.06);
      ">
        <span style="font-size: 10px; color: ${mutedColor}; user-select: none; line-height: 1">
          ${note.date || ''}
        </span>
        <div style="display:flex;gap:2px">
          <button data-sticky-edit title="Düzenle" style="
            background: none; border: none; cursor: pointer;
            color: ${mutedColor}; font-size: 12px; padding: 1px 4px;
            border-radius: 3px; line-height: 1;
          ">✏️</button>
          <button data-sticky-close title="Kapat" style="
            background: none; border: none; cursor: pointer;
            color: ${mutedColor}; font-size: 15px; padding: 1px 4px;
            border-radius: 3px; line-height: 1; font-weight: 300;
          ">×</button>
        </div>
      </div>
      <div data-sticky-body style="
        padding: 8px 10px;
        color: ${textColor};
        line-height: 1.5;
        word-break: break-word;
        outline: none;
        min-height: 60px;
        white-space: pre-wrap;
      " contenteditable="false">${escapeHtml(note.text)}</div>
    `;

    // ─── Drag ───────────────────────────────────────────
    const handle = el.querySelector('[data-sticky-handle]');
    handle.style.cursor = 'grab';

    let dragging = false, startX, startY, startL, startT;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      startL = parseInt(el.style.left); startT = parseInt(el.style.top);
      handle.style.cursor = 'grabbing';
      e.preventDefault();

      const onMove = (e2) => {
        if (!dragging) return;
        const newL = Math.max(0, Math.min(startL + e2.clientX - startX, window.innerWidth - 220));
        const newT = Math.max(0, Math.min(startT + e2.clientY - startY, window.innerHeight - 60));
        el.style.left = newL + 'px';
        el.style.top = newT + 'px';
      };

      const onUp = () => {
        dragging = false;
        handle.style.cursor = 'grab';
        const x = parseInt(el.style.left);
        const y = parseInt(el.style.top);
        persistNotePosition(note.id, x, y);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // ─── Close ──────────────────────────────────────────
    el.querySelector('[data-sticky-close]').addEventListener('click', (e) => {
      e.stopPropagation();
      el.style.transition = 'opacity 0.15s, transform 0.15s';
      el.style.opacity = '0';
      el.style.transform = 'scale(0.85)';
      setTimeout(() => {
        el.remove();
        activeNotes.delete(note.id);
        persistDeleteNote(note.id);
      }, 150);
    });

    // ─── Edit ───────────────────────────────────────────
    const editBtn = el.querySelector('[data-sticky-edit]');
    const body = el.querySelector('[data-sticky-body]');
    let editing = false;

    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      editing = !editing;
      body.contentEditable = editing ? 'true' : 'false';
      body.style.background = editing ? 'rgba(0,0,0,0.05)' : '';
      body.style.borderRadius = editing ? '3px' : '';
      editBtn.textContent = editing ? '💾' : '✏️';
      editBtn.title = editing ? 'Kaydet' : 'Düzenle';

      if (editing) {
        body.focus();
        // Cursor'u sona al
        const range = document.createRange();
        range.selectNodeContents(body);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        // Kaydet
        const newText = body.innerText;
        note.text = newText;
        persistNoteUpdate(note.id, newText);
      }
    });

    // ─── Pop animasyonu ─────────────────────────────────
    el.style.opacity = '0';
    el.style.transform = 'scale(0.8) translateY(10px)';
    el.style.transition = 'opacity 0.2s ease-out, transform 0.2s ease-out';
    document.body.appendChild(el);
    activeNotes.set(note.id, el);

    // Animasyonu başlat (bir sonraki frame'de)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'scale(1) translateY(0)';
      });
    });
  }

  // Rengin koyu olup olmadığını hesapla
  function isColorDark(hex) {
    const c = hex.replace('#', '');
    if (c.length !== 6) return false;
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    // Luminance formula
    return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function persistNotePosition(noteId, x, y) {
    try {
      const pageKey = getStickyPageKey();
      chrome.storage.local.get(['stickyNotes'], (data) => {
        if (chrome.runtime.lastError) return;
        const all = data.stickyNotes || {};
        const notes = all[pageKey] || [];
        const note = notes.find(n => n.id === noteId);
        if (note) { note.x = x; note.y = y; }
        all[pageKey] = notes;
        chrome.storage.local.set({ stickyNotes: all });
      });
    } catch (e) {}
  }

  function persistNoteUpdate(noteId, newText) {
    try {
      const pageKey = getStickyPageKey();
      chrome.storage.local.get(['stickyNotes'], (data) => {
        if (chrome.runtime.lastError) return;
        const all = data.stickyNotes || {};
        const notes = all[pageKey] || [];
        const note = notes.find(n => n.id === noteId);
        if (note) note.text = newText;
        all[pageKey] = notes;
        chrome.storage.local.set({ stickyNotes: all });
      });
    } catch (e) {}
  }

  function persistDeleteNote(noteId) {
    try {
      const pageKey = getStickyPageKey();
      chrome.storage.local.get(['stickyNotes'], (data) => {
        if (chrome.runtime.lastError) return;
        const all = data.stickyNotes || {};
        all[pageKey] = (all[pageKey] || []).filter(n => n.id !== noteId);
        chrome.storage.local.set({ stickyNotes: all });
      });
    } catch (e) {}
  }

  // IFS SPA URL değişimlerini izle (popstate + hash change)
  let lastUrl = window.location.href;
  function watchUrlChanges() {
    const observer = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        // Kısa gecikme — IFS Angular routing tamamlansın
        setTimeout(loadAndRenderNotes, 800);
      }
    });
    observer.observe(document.body || document.documentElement, {
      subtree: true, childList: true
    });

    window.addEventListener('popstate', () => setTimeout(loadAndRenderNotes, 800));
    window.addEventListener('hashchange', () => setTimeout(loadAndRenderNotes, 800));
  }

  // ─── MESSAGES FROM POPUP ──────────────────────────────
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

      if (msg.type === 'ADD_STICKY_NOTE') {
        renderStickyNote(msg.note);
        sendResponse({ ok: true });
        return true;
      }

      if (msg.type === 'RELOAD_STICKY_NOTES') {
        loadAndRenderNotes();
        sendResponse({ ok: true });
        return true;
      }

      if (msg.type === 'GET_PAGE_INFO') {
        sendResponse({
          url: window.location.href,
          hostname: window.location.hostname,
          title: document.title,
          isIFS: document.title.toLowerCase().includes('ifs') ||
                 (document.body && document.body.innerHTML.includes('ifsapplications'))
        });
        return true;
      }

      if (msg.type === 'REFRESH_ENV_BANNER') {
        var b1 = document.getElementById('ifs-toolkit-env-banner');
        var b2 = document.getElementById('ifs-toolkit-env-dot');
        if (b1) b1.remove();
        if (b2) b2.remove();
        checkEnvConfig();
        sendResponse({ ok: true });
        return true;
      }
    });
  } catch (e) {}

  // ─── INIT ─────────────────────────────────────────────

  // ─── DOM OBSERVER: LU NAME → OData Fetch ─────────────────
  // IFS her grid/form için DOM'a lu-name attribute koyar
  // Bunu okuyup background'dan direkt API isteği atabiliriz

  const _observedLUs = new Set();

  function fetchLUData(luName, serviceUrl) {
    // LuName → EntitySetName: PurchaseOrderLinePart → PurchaseOrderLinePartSet
    const entitySet = luName + 'Set';
    
    // Mevcut URL'den OrderNo/key değerini çıkar
    const urlPath = window.location.href;
    
    try {
      chrome.runtime.sendMessage({
        type: 'FETCH_LU_ENTITY',
        luName: luName,
        entitySet: entitySet,
        serviceUrl: serviceUrl,
        pageUrl: urlPath
      });
    } catch(e) {}
  }

  function extractServiceUrl() {
    // window.__ifsProjectionBaseUrl injector tarafından set edilmiş olabilir
    // Yoksa sayfanın son fetch'inden çıkarabiliriz
    // En basit: document metasından veya IFS global'den al
    const meta = document.querySelector('meta[name="ifs-projection-base"]');
    if (meta) return meta.content;
    
    // IFS genellikle hostname/main/ifsapplications/projection/v1/ kullanır
    return window.location.origin + '/main/ifsapplications/projection/v1/';
  }

  function scanForLUNames() {
    // IFS DOM'unda lu-name içeren elementler
    // fnd-listbox, fnd-grid, [data-lu-name], [lu-name]
    const selectors = [
      '[lu-name]',
      '[data-lu-name]', 
      'fnd-grid[entity-set]',
      '[entity-set]',
    ];

    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const lu = el.getAttribute('lu-name') || 
                   el.getAttribute('data-lu-name') ||
                   el.getAttribute('entity-set');
        if (!lu || _observedLUs.has(lu)) return;
        
        // Sistem LU'ları atla
        if (/^(Framework|UserProfile|Appearance|Translation)/i.test(lu)) return;
        
        _observedLUs.add(lu);
        console.log('[Ahtapot] DOM LU bulundu:', lu);
        fetchLUData(lu, extractServiceUrl());
      });
    });
  }

  function startDOMObserver() {
    // İlk tarama
    setTimeout(scanForLUNames, 1000);
    setTimeout(scanForLUNames, 3000);

    // MutationObserver ile yeni elementleri izle
    const observer = new MutationObserver(function(mutations) {
      let shouldScan = false;
      for (const m of mutations) {
        if (m.addedNodes.length > 0) { shouldScan = true; break; }
      }
      if (shouldScan) {
        clearTimeout(window._ahtapotScanTimer);
        window._ahtapotScanTimer = setTimeout(scanForLUNames, 500);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }


  function init() {
    checkEnvConfig();
    watchUrlChanges();
    startDOMObserver();
    // IFS Angular SPA: coklu strateji ile note yukle
    var tryLoad = function() { loadAndRenderNotes(); };

    if (document.readyState === 'complete') {
      tryLoad();
    } else {
      document.addEventListener('DOMContentLoaded', function() { setTimeout(tryLoad, 500); });
      window.addEventListener('load', function() { setTimeout(tryLoad, 1000); });
    }
    // Garanti: 3sn sonra tekrar
    setTimeout(tryLoad, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

  // ─── AHTAPOT FLOATING WIDGET ──────────────────────────
  // Sağ alt köşede mini buton — tıklayınca not ekle + raporlar açılır

  function createFloatingWidget() {
    if (document.getElementById('ahtapot-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'ahtapot-widget';
    widget.innerHTML = `
      <button id="ahtapot-fab" title="Ahtapot IFS Toolkit">
        <svg viewBox="0 0 36 36" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
          <!-- Kollar -->
          <g fill="#c084fc" opacity="0.9">
            <ellipse cx="9" cy="27" rx="3" ry="5" transform="rotate(-30 9 27)"/>
            <ellipse cx="14" cy="29" rx="3" ry="5" transform="rotate(-15 14 29)"/>
            <ellipse cx="18" cy="30" rx="3" ry="5"/>
            <ellipse cx="22" cy="29" rx="3" ry="5" transform="rotate(15 22 29)"/>
            <ellipse cx="27" cy="27" rx="3" ry="5" transform="rotate(30 27 27)"/>
          </g>
          <!-- Gövde -->
          <ellipse cx="18" cy="17" rx="11" ry="12" fill="#e9d5ff"/>
          <!-- Gözler -->
          <circle cx="14" cy="15" r="3" fill="#6d28d9"/>
          <circle cx="14.8" cy="14.2" r="1.2" fill="white"/>
          <circle cx="22" cy="15" r="3" fill="#6d28d9"/>
          <circle cx="22.8" cy="14.2" r="1.2" fill="white"/>
          <!-- Gülümseme -->
          <path d="M15 19 Q18 22 21 19" stroke="#6d28d9" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        </svg>
      </button>

      <div id="ahtapot-panel" style="display:none">
        <div class="aw-header">
          <span>🐙 Ahtapot</span>
          <button id="ahtapot-close">×</button>
        </div>

        <div class="aw-section">Not Ekle</div>
        <textarea id="aw-note-text" placeholder="Notunuzu yazın..." rows="3"></textarea>
        <div class="aw-colors">
          <div class="aw-color selected" data-color="#fef08a" style="background:#fef08a" title="Sarı"></div>
          <div class="aw-color" data-color="#bbf7d0" style="background:#bbf7d0" title="Yeşil"></div>
          <div class="aw-color" data-color="#fecaca" style="background:#fecaca" title="Kırmızı"></div>
          <div class="aw-color" data-color="#bae6fd" style="background:#bae6fd" title="Mavi"></div>
          <div class="aw-color" data-color="#e9d5ff" style="background:#e9d5ff" title="Mor"></div>
        </div>
        <button id="aw-add-note" class="aw-btn aw-btn-primary">📌 Not Ekle</button>

        <div class="aw-section" style="margin-top:10px">Kayıtlı Şablonlar</div>
        <div id="aw-templates">
          <div class="aw-empty">Şablon yok</div>
        </div>
      </div>
    `;

    document.body.appendChild(widget);
    injectWidgetStyles();

    // FAB tıklama
    document.getElementById('ahtapot-fab').addEventListener('click', () => {
      const panel = document.getElementById('ahtapot-panel');
      const isOpen = panel.style.display !== 'none';
      panel.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) loadWidgetTemplates();
    });

    document.getElementById('ahtapot-close').addEventListener('click', () => {
      document.getElementById('ahtapot-panel').style.display = 'none';
    });

    // Renk seçimi
    let selectedColor = '#fef08a';
    widget.querySelectorAll('.aw-color').forEach(dot => {
      dot.addEventListener('click', () => {
        widget.querySelectorAll('.aw-color').forEach(d => d.classList.remove('selected'));
        dot.classList.add('selected');
        selectedColor = dot.dataset.color;
      });
    });

    // Not ekle
    document.getElementById('aw-add-note').addEventListener('click', async () => {
      const text = document.getElementById('aw-note-text').value.trim();
      if (!text) return;

      const note = {
        id: Date.now().toString(),
        text,
        color: selectedColor,
        date: new Date().toLocaleDateString('tr-TR'),
        x: window.innerWidth - 260,
        y: 180
      };

      try {
        const pageKey = window.location.href;
        chrome.storage.local.get(['stickyNotes'], data => {
          const all = data.stickyNotes || {};
          if (!all[pageKey]) all[pageKey] = [];
          all[pageKey].push(note);
          chrome.storage.local.set({ stickyNotes: all });
        });
        renderStickyNote(note);
        document.getElementById('aw-note-text').value = '';
        document.getElementById('ahtapot-panel').style.display = 'none';
        showWidgetToast('📌 Not eklendi!');
      } catch (e) {}
    });
  }

  function loadWidgetTemplates() {
    try {
      chrome.storage.local.get(['templates'], data => {
        const templates = data.templates || [];
        const container = document.getElementById('aw-templates');
        if (!container) return;

        if (!templates.length) {
          container.innerHTML = '<div class="aw-empty">Şablon yok — eklentiden şablon yükleyin</div>';
          return;
        }

        container.innerHTML = templates.map((t, i) => `
          <div class="aw-template-item" data-index="${i}">
            <span class="aw-template-name">📊 ${t.name}</span>
            <button class="aw-btn-run" data-index="${i}" title="Çalıştır">▶</button>
          </div>
        `).join('');

        container.querySelectorAll('.aw-btn-run').forEach(btn => {
          btn.addEventListener('click', async () => {
            const idx = parseInt(btn.dataset.index);
            showWidgetToast('Rapor hazırlanıyor...');
            document.getElementById('ahtapot-panel').style.display = 'none';
            // Popup'a mesaj gönder — raporu çalıştır
            try {
              chrome.runtime.sendMessage({ type: 'RUN_TEMPLATE', templateIndex: idx });
            } catch (e) {}
          });
        });
      });
    } catch (e) {}
  }

  function showWidgetToast(msg) {
    const existing = document.getElementById('aw-toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.id = 'aw-toast';
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:90px;right:20px;background:#1f2937;color:#e6edf3;' +
      'padding:8px 14px;border-radius:8px;font-size:12px;z-index:2147483645;' +
      'border:1px solid #30363d;animation:aw-fade 0.2s ease-out;font-family:IBM Plex Sans,sans-serif';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  function injectWidgetStyles() {
    if (document.getElementById('ahtapot-widget-styles')) return;
    const s = document.createElement('style');
    s.id = 'ahtapot-widget-styles';
    s.textContent = `
      #ahtapot-widget {
        position: fixed; bottom: 20px; right: 20px;
        z-index: 2147483640; font-family: 'IBM Plex Sans', 'Segoe UI', sans-serif;
      }
      #ahtapot-fab {
        width: 52px; height: 52px; border-radius: 50%;
        background: linear-gradient(135deg, #7c3aed, #6d28d9);
        border: none; cursor: pointer; display: flex;
        align-items: center; justify-content: center;
        box-shadow: 0 4px 16px rgba(109,40,217,0.5);
        transition: transform 0.2s, box-shadow 0.2s;
      }
      #ahtapot-fab:hover { transform: scale(1.1); box-shadow: 0 6px 20px rgba(109,40,217,0.7); }
      #ahtapot-panel {
        position: absolute; bottom: 60px; right: 0;
        width: 240px; background: #0d1117;
        border: 1px solid #30363d; border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        padding: 0; overflow: hidden;
      }
      .aw-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 12px; background: #161b22;
        border-bottom: 1px solid #30363d;
        font-size: 13px; font-weight: 600; color: #e6edf3;
      }
      .aw-header button {
        background: none; border: none; color: #7d8590;
        cursor: pointer; font-size: 18px; line-height: 1; padding: 0 4px;
      }
      .aw-section {
        font-size: 10px; font-weight: 600; color: #7d8590;
        letter-spacing: 1px; text-transform: uppercase;
        padding: 8px 12px 4px;
      }
      #aw-note-text {
        width: calc(100% - 24px); margin: 0 12px;
        background: #1f2937; border: 1px solid #30363d; border-radius: 6px;
        color: #e6edf3; padding: 8px; font-size: 12px;
        font-family: inherit; resize: none; outline: none;
      }
      #aw-note-text:focus { border-color: #7c3aed; }
      .aw-colors {
        display: flex; gap: 6px; padding: 8px 12px;
      }
      .aw-color {
        width: 22px; height: 22px; border-radius: 50%;
        cursor: pointer; border: 2px solid transparent; transition: all 0.15s;
      }
      .aw-color.selected { border-color: #e6edf3; transform: scale(1.15); }
      .aw-btn {
        display: block; width: calc(100% - 24px); margin: 0 12px 10px;
        padding: 8px; border-radius: 6px; border: none; cursor: pointer;
        font-family: inherit; font-size: 12px; font-weight: 600; text-align: center;
      }
      .aw-btn-primary { background: #7c3aed; color: #fff; }
      .aw-btn-primary:hover { background: #6d28d9; }
      .aw-template-item {
        display: flex; align-items: center; justify-content: space-between;
        padding: 7px 12px; border-bottom: 1px solid #1f2937; color: #e6edf3;
        font-size: 12px;
      }
      .aw-template-item:last-child { border-bottom: none; margin-bottom: 8px; }
      .aw-template-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .aw-btn-run {
        background: rgba(0,194,168,0.15); border: 1px solid #00c2a8;
        color: #00c2a8; border-radius: 4px; padding: 3px 8px;
        cursor: pointer; font-size: 11px; flex-shrink: 0; margin-left: 6px;
      }
      .aw-btn-run:hover { background: rgba(0,194,168,0.3); }
      .aw-empty { padding: 8px 12px 12px; font-size: 11px; color: #7d8590; }
      @keyframes aw-fade { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
    `;
    document.head.appendChild(s);
  }

  // Widget'ı yükle
  function initWidget() {
    try {
      chrome.storage.local.get(['settings'], data => {
        createFloatingWidget();
      });
    } catch (e) {
      createFloatingWidget();
    }
  }

  if (document.readyState === 'complete') {
    setTimeout(initWidget, 1000);
  } else {
    window.addEventListener('load', () => setTimeout(initWidget, 1000));
  }
