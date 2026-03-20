// Ahtapot ERP Toolkit — injector.js v4
// MAIN world content script — fetch/XHR override

(function () {
  if (window.__ifsToolkitInjected) return;
  window.__ifsToolkitInjected = true;
  console.log('[Ahtapot] injector v4 aktif');

  function isIFS(url) {
    return url && (url.includes('/projection/v1/') || url.includes('ifsapplications/projection'));
  }

  const SKIP_SERVICES = new Set([
    'appearanceconfiguration','frameworkservices','userprofileservice',
    'translations','clientcontext','systemservice','navigationservice',
    'getpartytypewidgetinfo','aurenapagedesigner','usersettings',
    'recentdocumentswidgethandling','recentfaultreportswidgethandling',
    'streamsubscriptions','crmaccountsearchwidgethandling',
    'crmcontactsearchwidgethandling','peopleshubwidgethandling',
    'projecttimereportingwidgethandling','worktasktimereportingwidgethandling',
  ]);

  const SKIP_ENTITY = [
    /^getall/i, /^getcontact/i, /^bookmark/i,
    /^gettranslation/i, /^getprofile/i, /^getcurrentuser/i,
    /^getbasicsupplier/i, /^isuser/i, /^getattachment/i,
    /^companycontext/i, /^clientcontext/i, /^getprofilesection/i,
    /^translations$/i, /^checkauth/i, /^getdebuginfo/i,
    /^baseline/i, /^publishconfig/i, /^currentperson$/i,
    /^enumeratelanguages$/i, /^gettimezones$/i, /^reference_language/i,
    /^docactivity/i, /^activeseparates/i, /^fnd/i,
  ];

  function shouldSkip(entity, service) {
    if (!entity) return true;
    if (service && SKIP_SERVICES.has(service.toLowerCase())) return true;
    if (SKIP_ENTITY.some(p => p.test(entity))) return true;
    return false;
  }

  // URL → { entity, service, key }
  function parseUrl(url) {
    try {
      const u = new URL(url, window.location.href);
      const path = u.pathname;

      // aggregate skip
      const apply = u.searchParams.get('$apply') || '';
      if (apply.toLowerCase().includes('aggregate')) return null;
      if (path.includes('/$count') || path.includes('/$metadata')) return null;

      // /Service.svc/Entity veya /Service.svc/Parent('key')/NavProp
      const m = path.match(/\/([^/]+)\.svc\/([^(/]+)(?:\([^)]*\))?(?:\/([^?(/]+))?/);
      if (!m) return null;

      const service = m[1];
      const entity  = m[3] || m[2].replace(/\(.*/, '');

      if (shouldSkip(entity, service)) return null;

      const keyM = path.match(/\(([^)]+)\)/);
      return { entity, service, key: keyM ? keyM[1] : null, url };
    } catch(e) { return null; }
  }

  // Veriyi background'a gönder
  function capture(info, records) {
    if (!info || !records || !records.length) return;

    const keys = Object.keys(records[0]).filter(k => !k.startsWith('@'));
    if (keys.length && keys.every(k => k.includes('_aggr_'))) return;

    console.log('[Ahtapot] CAPTURE:', info.entity, records.length, 'kayıt |', keys.slice(0,4).join(', '));

    const payload = {
      type: 'IFS_DATA_CAPTURED',
      entity: info.entity,
      service: info.service,
      url: info.url,
      key: info.key,
      records: records,
      capturedAt: Date.now()
    };

    // MAIN world'den direkt chrome.runtime.sendMessage
    // postMessage + content.js bridge yerine doğrudan background'a
    try {
      chrome.runtime.sendMessage({ type: 'DATA_CAPTURED', payload });
    } catch(e) {
      // Fallback: postMessage ile content.js üzerinden
      window.postMessage(payload, '*');
    }
  }

  // ── $batch body'sinden GET URL'lerini çıkar ──────────────
  function parseBatchBody(body, baseUrl) {
    if (!body || typeof body !== 'string') return [];
    const urls = [];
    // Her GET satırını bul
    const re = /^GET ([^\r\n]+)/gm;
    let m;
    while ((m = re.exec(body)) !== null) {
      const rel = m[1].trim();
      // Tam URL oluştur
      const svcMatch = baseUrl.match(/(https?:\/\/[^/]+\/[^?]+\.svc\/)/);
      if (svcMatch) {
        urls.push(svcMatch[1] + rel);
      }
    }
    return urls;
  }

  // ── $batch response'unu parse et ────────────────────────
  async function processBatch(requestBody, responseText, baseUrl) {
    // Batch içindeki GET URL'lerini al
    const getUrls = parseBatchBody(requestBody, baseUrl);

    // Response multipart veya JSON array olabilir
    // IFS genellikle JSON response döner: { responses: [{ id, status, body }] }
    try {
      const json = JSON.parse(responseText);
      const responses = json.responses || json.value || [];

      responses.forEach((r, i) => {
        const body = r.body || r;
        if (!body || !body.value) return;
        const url = getUrls[i] || '';
        const info = url ? parseUrl(url) : null;
        if (info) capture(info, body.value);
      });
      return;
    } catch(e) {}

    // Multipart format: --boundary\r\nHTTP/1.1 200\r\n\r\n{json}
    const parts = responseText.split(/--[a-f0-9-]{20,}/);
    parts.forEach((part, i) => {
      try {
        const jsonStart = part.indexOf('{');
        if (jsonStart < 0) return;
        const json = JSON.parse(part.slice(jsonStart));
        if (!json.value || !json.value.length) return;
        const url = getUrls[i] || '';
        const info = url ? parseUrl(url) : null;
        if (info) {
          capture(info, json.value);
        } else {
          // URL yoksa context'ten entity adını tahmin et
          const ctxMatch = (json['@odata.context'] || '').match(/#(\w+)/);
          if (ctxMatch) {
            capture({ entity: ctxMatch[1], service: 'Batch', key: null, url }, json.value);
          }
        }
      } catch(e) {}
    });
  }

  // ── FETCH OVERRIDE ────────────────────────────────────
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const req = args[0];
    const url = req instanceof Request ? req.url : String(req || '');
    const opts = args[1] || {};
    const method = (req instanceof Request ? req.method : opts.method || 'GET').toUpperCase();

    const response = await origFetch.apply(this, args);

    if (!isIFS(url)) return response;

    try {
      if (method === 'POST' && url.includes('$batch')) {
        // $batch: request body'den GET URL'lerini al, response'u parse et
        let reqBody = '';
        if (req instanceof Request) {
          reqBody = await req.clone().text();
        } else {
          reqBody = String(opts.body || '');
        }

        response.clone().text().then(respText => {
          processBatch(reqBody, respText, url);
        }).catch(() => {});

      } else if (method === 'GET') {
        const info = parseUrl(url);
        if (info) {
          response.clone().json().then(data => {
            if (data.value && Array.isArray(data.value)) {
              capture(info, data.value);
            } else if (data['@odata.context'] !== undefined && !data.value) {
              // Tek kayıt
              capture(info, [data]);
            }
          }).catch(() => {});
        }
      }
    } catch(e) {}

    return response;
  };

  // ── XHR OVERRIDE ────────────────────────────────────
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._url = url;
    this._method = method;
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    const url = this._url || '';
    const method = (this._method || 'GET').toUpperCase();

    if (isIFS(url)) {
      this.addEventListener('load', function() {
        try {
          if (method === 'POST' && url.includes('$batch')) {
            processBatch(String(body || ''), this.responseText, url);
          } else {
            const info = parseUrl(url);
            if (info) {
              const data = JSON.parse(this.responseText);
              if (data.value && Array.isArray(data.value)) {
                capture(info, data.value);
              } else if (data['@odata.context'] !== undefined && !data.value) {
                capture(info, [data]);
              }
            }
          }
        } catch(e) {}
      });
    }
    return origSend.apply(this, arguments);
  };

})();
