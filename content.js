// Ahtapot ERP Toolkit — content.js
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
    banner.title = 'Ahtapot ortam etiketi — ayarlardan değiştir';

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

      if (msg.type === 'AHTAPOT_SET_LANG') {
        window.postMessage({ type: 'AHTAPOT_SET_LANG', lang: msg.lang, strings: msg.strings }, '*');
        sendResponse({ ok: true });
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
