// Ahtapot ERP Toolkit — background.js
// dataCache artık chrome.storage.local'da tutuluyor
// Service worker restart'ta kaybolmuyor


// ── İlgili satır entity'lerini çek ──────────────────────
// Header yakalandığında aynı servis'teki "line" entity'lerini dene
async function fetchRelatedLines(tabId, headerEntity, headerUrl, cache) {
  try {
    // Tab'dan origin al
    let origin = '';
    try {
      const tab = await chrome.tabs.get(tabId);
      origin = new URL(tab.url).origin;
    } catch(e) {
      console.log('[Ahtapot BG] Tab alınamadı:', e.message);
      return;
    }

    // Relative URL → absolute
    const absUrl = headerUrl.startsWith('http') ? headerUrl : origin + headerUrl;

    // Key çıkar: PurchaseOrderSet(OrderNo='1') → OrderNo='1'
    // .svc/ sonrasındaki EntitySet adını ve key'i al
    const svcIdx = absUrl.indexOf('.svc/');
    if (svcIdx < 0) { console.log('[Ahtapot BG] .svc/ yok'); return; }

    const svcBase = absUrl.slice(0, svcIdx + 5); // https://...PurchaseOrderHandling.svc/
    const afterSvc = absUrl.slice(svcIdx + 5);    // PurchaseOrderSet(OrderNo='1')?...

    // EntitySet(key) formatını parse et
    const parenIdx = afterSvc.indexOf('(');
    const closeIdx = afterSvc.indexOf(')');
    if (parenIdx < 0 || closeIdx < 0) {
      console.log('[Ahtapot BG] Key parantez yok:', afterSvc.slice(0,60));
      return;
    }
    const entityKey = afterSvc.slice(parenIdx + 1, closeIdx); // OrderNo='1'
    console.log('[Ahtapot BG] svcBase:', svcBase, '| key:', entityKey);

    console.log('[Ahtapot BG] fetchRelatedLines | key:', entityKey, '| svcBase:', svcBase);

    const navProps = [
      { nav: 'LinePartArray',       entity: 'LinePartSet'       },
      { nav: 'LineNopartArray',     entity: 'LineNopartSet'     },
      { nav: 'LineRentalPartArray', entity: 'LineRentalPartSet' },
    ];

    for (const { nav, entity: lineEntity } of navProps) {
      // Cache'de zaten varsa atla
      const freshCache = await getCache();
      if (freshCache[tabId] && freshCache[tabId][lineEntity] &&
          !freshCache[tabId][lineEntity].stale) continue;

      // $select olmadan IFS sadece meta field'ları döndürür
      // HAR'dan bilinen LinePartArray field'ları
      const LINE_PART_FIELDS = [
        'OrderNo','LineNo','ReleaseNo','PartNo','Description','BuyQtyDue','BuyUnitMeas',
        'BuyUnitPrice','BuyUnitPriceInclTax','FbuyUnitPrice','NetAmtCurr','NetAmountBase',
        'TaxAmount','TaxAmountBase','GrossAmtCurr','GrossAmtBase','Discount',
        'PlannedReceiptDate','PlannedDeliveryDate','WantedDeliveryDate','PromisedDeliveryDate',
        'PlannedArrivalDate','LatestOrderDate','DateEntered',
        'VendorPartNo','VendorPartDescription','VendorNo','Contract','PurchaseSite',
        'CurrencyCode','PriceUnitMeas','ConvFactor','PriceConvFactor',
        'ProjectId','ProjectName','SubProjectId','ActivitySeq','ActivityNo',
        'CodeA','CodeB','CodeC','CodeD','CodeE','CodeF','CodeG','CodeH','CodeI','CodeJ',
        'Objstate','StatGrp','DemandCode','RequisitionNo','RouteId',
        'TaxLiability','FeeCode','InvoicingSupplier','InvoicingSupplierName',
        'NoteText','BlanketOrder','BlanketLine','ServiceType','ProcessType',
        'AddrFlag','DefaultAddrFlag','AddressId','DestinationWarehouseId',
        'SerialNo','LotBatchNo','ConditionCode','ConfigurationId',
        'WeightNet','WeightUom','VolumeNet','VolumeUom',
        'CloseCode','CloseTolerance','OverDeliveryTolerance','ReceiveCase',
        'InspectionCode','QtyOnOrder','DespatchQty','QtyScrappedSupplier',
        'CustomerOrderNo','RevisedQty','UnitMeas','EngChgLevel',
        'Cf_Satinalmaci_Notu','Cf_Arge_Gkk',
        'luname','keyref','Objstate'
      ].join(',');

      const LINE_NOPART_FIELDS = [
        'OrderNo','LineNo','ReleaseNo','Description','BuyQtyDue','BuyUnitMeas',
        'BuyUnitPrice','BuyUnitPriceInclTax','FbuyUnitPrice','NetAmtCurr','NetAmtBase',
        'TaxAmount','TaxAmountBase','GrossAmtCurr','GrossAmtBase','Discount',
        'PlannedReceiptDate','PlannedDeliveryDate','WantedDeliveryDate','PromisedDeliveryDate',
        'VendorPartNo','VendorPartDescription','VendorNo','Contract',
        'CurrencyCode','ProjectId','SubProjectId','ActivitySeq','ActivityNo',
        'CodeA','CodeB','CodeC','CodeD','CodeE','CodeF','CodeG','CodeH','CodeI','CodeJ',
        'Objstate','TaxLiability','FeeCode','InvoicingSupplier','NoteText',
        'AddrFlag','DefaultAddrFlag','RequisitionNo','CloseCode','ReceiveCase',
        'luname','keyref'
      ].join(',');

      const selectMap = {
        'LinePartArray':       LINE_PART_FIELDS,
        'LineNopartArray':     LINE_NOPART_FIELDS,
        'LineRentalPartArray': LINE_PART_FIELDS,
      };

      const selectParam = selectMap[nav] || '';
      const navUrl = svcBase + headerEntity + '(' + entityKey + ')/' + nav +
        '?$top=200' + (selectParam ? '&$select=' + selectParam : '');
      console.log('[Ahtapot BG] Fetching:', navUrl);

      try {
        const r = await fetch(navUrl, {
          credentials: 'include',
          headers: { 'Accept': 'application/json' }
        });

        console.log('[Ahtapot BG]', nav, 'status:', r.status);
        if (!r.ok) continue;

        const data = await r.json();
        const records = data.value || [];
        if (!records.length) {
          console.log('[Ahtapot BG]', nav, 'boş');
          continue;
        }

        // Cache'e yaz
        const c2 = await getCache();
        if (!c2[tabId]) c2[tabId] = {};
        c2[tabId][lineEntity] = {
          records,
          service: svcBase.match(/\/([^/]+)\.svc\//)?.[1] || 'Unknown',
          url: navUrl,
          key: entityKey,
          capturedAt: Date.now(),
          stale: false
        };
        await setCache(c2);

        console.log('[Ahtapot BG] Yakalandı:', lineEntity, records.length, 'kayıt |',
          Object.keys(records[0]).filter(k => !k.startsWith('@')).slice(0,4).join(', '));

        chrome.runtime.sendMessage({
          type: 'CACHE_UPDATED',
          tabId,
          entity: lineEntity,
          recordCount: records.length
        }).catch(() => {});

      } catch(e) {
        console.log('[Ahtapot BG]', nav, 'hata:', e.message);
      }
    }
  } catch(e) {
    console.log('[Ahtapot BG] fetchRelatedLines error:', e.message);
  }
}


// ─── HELPERS ──────────────────────────────────────────────
async function getCache() {
  const r = await chrome.storage.local.get(['dataCache']);
  return r.dataCache || {};
}

async function setCache(cache) {
  await chrome.storage.local.set({ dataCache: cache });
}

// F-16 Faz 1.8/1.9: OData $metadata endpoint'inden service'in EntitySet'lerini ve
// EntityType'ların NavigationProperty'lerini parse et. Sadece NavigationProperty
// (Type="Collection(...)") olanlar gerçek child tablolardır (page'deki tab içerikleri).
// Reference olanlar (single-record) lookup'tır — dropdown'a girmez.
const _metadataInFlight = new Set();
async function fetchServiceMetadata(tabId, svcBase) {
  if (!svcBase || !svcBase.includes('.svc/')) return;
  const key = tabId + '|' + svcBase;
  if (_metadataInFlight.has(key)) return;
  _metadataInFlight.add(key);
  try {
    const resp = await fetch(svcBase + '$metadata', {
      credentials: 'include',
      headers: { 'Accept': 'application/xml, text/xml' }
    });
    if (!resp.ok) {
      console.log('[Ahtapot BG] $metadata fetch failed:', resp.status, svcBase);
      return;
    }
    const xml = await resp.text();

    // ── 1. EntitySet adları + display name + EntityType mapping ──
    // <EntitySet Name="PurchaseRequisitionSet" EntityType="IFS.PurchaseRequisition"/>
    const entitySets = [];
    const entitySetToType = {};   // EntitySet name → EntityType FQN
    const typeToEntitySet = {};   // EntityType FQN → EntitySet name
    const seenSet = new Set();
    const setRe = /<EntitySet\s+Name="([^"]+)"\s+EntityType="([^"]+)"[^>]*\/?>/g;
    let m;
    while ((m = setRe.exec(xml)) !== null) {
      if (seenSet.has(m[1])) continue;
      seenSet.add(m[1]);
      const setName = m[1];
      const typeFqn = m[2];
      entitySetToType[setName] = typeFqn;
      typeToEntitySet[typeFqn] = setName;
      // Display name (Common.Label annotation veya sap:label)
      const blockEnd = xml.indexOf('</EntitySet>', m.index);
      const block = blockEnd >= 0 ? xml.slice(m.index, blockEnd) : xml.slice(m.index, m.index + 600);
      const lblMatch = block.match(/Annotation[^>]*Term="(?:[^"]*\.)?(?:Label|Heading)"[^>]*String="([^"]+)"|sap:label="([^"]+)"/i);
      const displayName = lblMatch ? (lblMatch[1] || lblMatch[2]) : null;
      entitySets.push({ entity: setName, type: typeFqn, displayName });
    }

    // ── 2. EntityType'ların NavigationProperty'leri ──
    // <EntityType Name="PurchaseRequisition">
    //   <NavigationProperty Name="PartRequisitionLines" Type="Collection(IFS.PurchaseReqLinePart)"/>
    //   <NavigationProperty Name="RequisitionerCodeRef" Type="IFS.Reference_Requisitioner"/>
    // </EntityType>
    const typeNavProps = {};  // EntityType FQN → [{ name, targetType, isCollection }]
    const typeRe = /<EntityType\s+Name="([^"]+)"[^>]*>([\s\S]*?)<\/EntityType>/g;
    while ((m = typeRe.exec(xml)) !== null) {
      const typeName = m[1];
      const body = m[2];
      const fqn = Object.values(entitySetToType).find(t => t.endsWith('.' + typeName)) || typeName;
      const navs = [];
      const navRe = /<NavigationProperty\s+Name="([^"]+)"\s+(?:Type="([^"]+)"|[\s\S]*?Type="([^"]+)")[^>]*\/?>/g;
      let n;
      while ((n = navRe.exec(body)) !== null) {
        const navName = n[1];
        const navType = n[2] || n[3] || '';
        const isCollection = /^Collection\(/.test(navType);
        const targetType = navType.replace(/^Collection\(/, '').replace(/\)$/, '');
        navs.push({ name: navName, targetType, isCollection });
      }
      if (navs.length) typeNavProps[fqn] = navs;
    }

    // ── 3. Collection döner Function'lar (V4 OData) ──
    // <Function Name="PurchaseRequisitionLines"><Parameter ... /><ReturnType Type="Collection(...)"/></Function>
    // Filter: page-relevant Function'ları geç (Get/Is/Allow/Validate/Check/Find/Lookup/Has prefix'leri
    // ya da name/returnType içinde "Lov" geçenler — lookup'tır, page entity değil).
    const functions = [];
    const isLookupName = (name) =>
      /^(Get|Is|Allow|Validate|Check|Find|Lookup|Has|Fetch|Verify)\w/.test(name) ||
      /Lov/i.test(name) ||      // herhangi bir yerde Lov (LovList, LuSpecificLov, vb.)
      /Lookup/i.test(name) ||
      /Search/i.test(name);
    const isLookupType = (t) => /Lov\b|Lookup\b|\bReference_/.test(t || '');

    const fnRe = /<Function\s+Name="([^"]+)"[^>]*>([\s\S]*?)<\/Function>/g;
    while ((m = fnRe.exec(xml)) !== null) {
      const fnName = m[1];
      const body = m[2];
      const retMatch = body.match(/<ReturnType\s+Type="Collection\(([^)]+)\)"/);
      if (!retMatch) continue;
      const returnType = retMatch[1];
      if (isLookupName(fnName) || isLookupType(returnType)) continue;
      functions.push({ name: fnName, returnType });
    }

    console.log('[Ahtapot BG] $metadata:', svcBase.match(/\/([^/]+)\.svc\//)?.[1],
      '→', entitySets.length, 'EntitySet,',
      Object.keys(typeNavProps).length, 'EntityType,',
      functions.length, 'page Function');

    const cache = await getCache();
    if (!cache[tabId]) cache[tabId] = {};
    cache[tabId].__serviceMeta = cache[tabId].__serviceMeta || {};
    cache[tabId].__serviceMeta[svcBase] = {
      entitySets,
      entitySetToType,
      typeToEntitySet,
      typeNavProps,
      functions
    };
    await setCache(cache);
    chrome.runtime.sendMessage({ type: 'METADATA_LOADED', tabId, count: entitySets.length }).catch(() => {});
  } catch (e) {
    console.log('[Ahtapot BG] $metadata error:', e.message);
  } finally {
    _metadataInFlight.delete(key);
  }
}

const SKIP_FIELDS = new Set([
  'luname','keyref','Objgrants','Objstate',
  'Objkey','ParentObjkey','Objid','Objversion'
]);

function isBadField(k) {
  if (SKIP_FIELDS.has(k)) return true;
  if (k.startsWith('@')) return true;   // @odata.etag, @odata.id vs.
  if (k.includes('@')) return true;     // AddrFlag@odata.type gibi annotasyonlar
  if (k.includes('_aggr_')) return true; // aggregate alanlar
  if (k.endsWith('navigationLink')) return true;
  return false;
}

function cleanRecord(r) {
  const out = {};
  Object.entries(r).forEach(([k, v]) => {
    if (!isBadField(k)) out[k] = v;
  });
  return out;
}

function cleanFields(record) {
  return Object.keys(record).filter(k => !isBadField(k));
}

// ─── INIT ─────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['settings'], (data) => {
    if (!data.settings) {
      chrome.storage.local.set({
        settings: { reportEnabled: true, envBannerEnabled: true, stickyNotesEnabled: true },
        envConfigs: {},
        templates: [],
        stickyNotes: {},
        dataCache: {}
      });
    }
  });
});

// ─── TAB MANAGEMENT ───────────────────────────────────────
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const cache = await getCache();
  delete cache[tabId];
  await setCache(cache);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    const cache = await getCache();
    if (cache[tabId]) {
      Object.keys(cache[tabId]).forEach(e => { cache[tabId][e].stale = true; });
      await setCache(cache);
    }
  }
});

// ─── AKTIF TAB BULMA ──────────────────────────────────────
async function findTabWithData(entityName) {
  // 1. lastFocusedWindow'daki aktif tab
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const cache = await getCache();

  let tabId = tabs[0]?.id;

  // 2. O tab'da veri yoksa, cache'de veri olan tab'ı bul
  if (!tabId || !cache[tabId] || (entityName && !cache[tabId][entityName])) {
    const found = Object.keys(cache).find(id => {
      if (!cache[id]) return false;
      if (entityName) return !!cache[id][entityName];
      return Object.keys(cache[id]).length > 0;
    });
    if (found) tabId = parseInt(found);
  }

  return { tabId, cache };
}

// ─── MESSAGE HANDLER ──────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ── F-16: content.js DOM'da keşfettiği entity'leri buraya gönderir ──
  // Popup blok dropdown'larında "henüz yakalanmamış ama sayfada bulunan"
  // entity'leri göstermek için tutulur.
  if (msg.type === 'DISCOVERED_ENTITIES') {
    const tabId = sender.tab?.id;
    if (!tabId || !msg.entities || !msg.entities.length) return;
    (async () => {
      const cache = await getCache();
      if (!cache[tabId]) cache[tabId] = {};
      const meta = cache[tabId].__discovered || {};
      msg.entities.forEach(e => {
        if (!e || !e.entity) return;
        const existing = meta[e.entity] || {};
        meta[e.entity] = {
          entity: e.entity,
          displayName: e.displayName || existing.displayName || null,
          luName: e.luName || existing.luName || null
        };
      });
      cache[tabId].__discovered = meta;
      await setCache(cache);
    })();
    return;
  }

  // ── Veri yakalama (injector.js → content.js → burası) ──
  if (msg.type === 'DATA_CAPTURED') {
    const tabId = sender.tab?.id;
    if (!tabId) return;

    const { entity, service, url, records, key, capturedAt } = msg.payload;
    if (!entity || !records) return;

    (async () => {
      const cache = await getCache();
      if (!cache[tabId]) cache[tabId] = {};

      const existing = cache[tabId][entity];
      if (existing && !existing.stale && !key) {
        // Pagination: merge
        const existingIds = new Set(existing.records.map(r =>
          JSON.stringify(Object.values(r).slice(0, 3))
        ));
        const newRecs = records.filter(r =>
          !existingIds.has(JSON.stringify(Object.values(r).slice(0, 3)))
        );
        existing.records = [...existing.records, ...newRecs];
      } else {
        cache[tabId][entity] = { records, service, url, key, capturedAt, stale: false };
      }

      await setCache(cache);

      // Popup'a bildir
      chrome.runtime.sendMessage({
        type: 'CACHE_UPDATED',
        tabId,
        entity,
        recordCount: cache[tabId][entity].records.length
      }).catch(() => {});

      // F-16 Faz 1.8: bu service'in $metadata'sı henüz çekilmediyse fetch et
      // (fire-and-forget). Cache'lendiğinde popup dropdown'ları otomatik dolacak.
      const svcMatch = url && url.match(/(https?:\/\/[^/]+\/[^?]+\.svc\/)/);
      if (svcMatch && !cache[tabId].__serviceMeta?.[svcMatch[1]]) {
        fetchServiceMetadata(tabId, svcMatch[1]);
      }

      // Header entity yakalandıysa ilgili satırları çek
      // Sadece tek kayıt URL'lerinde çalış: PurchaseOrderSet(OrderNo='1')
      // Liste URL'leri atla: PurchaseOrderSet?$select=...
      const isSingleRecord = url && url.includes('.svc/') && url.includes('(') &&
                             !entity.toLowerCase().includes('line') &&
                             !entity.toLowerCase().includes('part') &&
                             !entity.toLowerCase().includes('nopart');
      if (isSingleRecord) {
        console.log('[Ahtapot BG] Single record detected, fetching lines for:', entity);
        fetchRelatedLines(tabId, entity, url, cache);
      }
    })();

    return;
  }

  // ── Cache özeti ──
  if (msg.type === 'GET_CACHE') {
    (async () => {
      const { tabId, cache } = await findTabWithData(null);
      const tabCache = cache[tabId] || {};
      const discovered = tabCache.__discovered || {};
      const serviceMeta = tabCache.__serviceMeta || {};

      // F-16 Faz 1.9: $metadata'dan EntitySet display name'leri (yedek)
      const metaDisplayName = {};
      const allTypeToEntitySet = {};
      const allTypeNavProps = {};
      Object.values(serviceMeta).forEach(meta => {
        if (!meta) return;
        (meta.entitySets || []).forEach(e => {
          if (e && e.entity && e.displayName) metaDisplayName[e.entity] = e.displayName;
        });
        if (meta.typeToEntitySet) Object.assign(allTypeToEntitySet, meta.typeToEntitySet);
        if (meta.typeNavProps) Object.assign(allTypeNavProps, meta.typeNavProps);
      });

      const summary = Object.entries(tabCache)
        .filter(([entity]) => !entity.startsWith('__'))
        .map(([entity, data]) => ({
          entity,
          service: data.service,
          recordCount: data.records.length,
          capturedAt: data.capturedAt,
          stale: data.stale,
          displayName: discovered[entity]?.displayName || metaDisplayName[entity] || null,
          fields: data.records[0] ? cleanFields(data.records[0]) : []
        }));

      // F-16 Faz 1.9: discovered listesi şu kaynaklardan birleşik:
      //   1. content.js DOM keşfi (kullanıcı açtıysa)
      //   2. Header entity'lerin Collection nav-property'leri ($metadata'dan)
      //      → bunlar gerçek page-level child entity'ler (Lines, Approvals, vb.)
      const combined = {};
      Object.values(discovered).forEach(d => {
        if (d && d.entity) combined[d.entity] = {
          entity: d.entity,
          displayName: d.displayName || metaDisplayName[d.entity] || null,
          luName: d.luName || null,
          source: 'dom'
        };
      });

      // Her cache'lenmiş entity için: o EntityType'ın Collection nav-prop'larına
      // karşılık gelen EntitySet'leri discovered'a ekle
      summary.forEach(s => {
        const svcMeta = Object.values(serviceMeta).find(meta =>
          meta && meta.entitySetToType && meta.entitySetToType[s.entity]
        );
        if (!svcMeta) return;
        const typeFqn = svcMeta.entitySetToType[s.entity];
        const navs = svcMeta.typeNavProps?.[typeFqn] || [];
        navs.filter(n => n.isCollection).forEach(n => {
          const targetEntitySet = svcMeta.typeToEntitySet?.[n.targetType] || n.name;
          if (targetEntitySet && !tabCache[targetEntitySet] && !combined[targetEntitySet]) {
            combined[targetEntitySet] = {
              entity: targetEntitySet,
              displayName: metaDisplayName[targetEntitySet] || null,
              luName: null,
              source: 'nav-prop',
              parentEntity: s.entity,
              navName: n.name
            };
          }
        });
      });

      // F-16 Faz 1.10: page-relevant Function'ları da ekle (Onaylama vs.
      // gibi parametreli function call'larla erişilen child entity'ler).
      // Her cache'lenmiş service için filter'lı function listesini ekle.
      const cachedSvcBases = new Set();
      summary.forEach(s => {
        Object.entries(serviceMeta).forEach(([svcBase, meta]) => {
          if (meta && meta.entitySetToType && meta.entitySetToType[s.entity]) {
            cachedSvcBases.add(svcBase);
          }
        });
      });
      cachedSvcBases.forEach(svcBase => {
        const meta = serviceMeta[svcBase];
        (meta?.functions || []).forEach(fn => {
          if (!tabCache[fn.name] && !combined[fn.name]) {
            combined[fn.name] = {
              entity: fn.name,
              displayName: metaDisplayName[fn.name] || null,
              luName: null,
              source: 'function',
              returnType: fn.returnType
            };
          }
        });
      });

      const discoveredOnly = Object.values(combined).filter(d => !tabCache[d.entity]);
      sendResponse({ cache: summary, discovered: discoveredOnly, tabId });
    })();
    return true;
  }

  // ── Tam veri isteği ──
  if (msg.type === 'GET_ENTITY_DATA') {
    (async () => {
      const { tabId, cache } = await findTabWithData(msg.entity);
      const entityData = (cache[tabId] || {})[msg.entity];

      if (!entityData || !entityData.records.length) {
        sendResponse({ ok: false, error: 'Entity bulunamadı: ' + msg.entity });
        return;
      }

      const cleanRecords = entityData.records.map(cleanRecord);
      sendResponse({
        ok: true,
        entity: msg.entity,
        service: entityData.service,
        records: cleanRecords,
        capturedAt: entityData.capturedAt
      });
    })();
    return true;
  }

  // ── DOM LU → OData fetch ──────────────────────────────
  // content.js DOM'da LU name bulunca burası çağrılır
  // Direkt API'ye istek atar, response'u cache'e yazar
  if (msg.type === 'FETCH_LU_ENTITY') {
    const { luName, entitySet, serviceUrl, pageUrl } = msg;
    const tabId = sender.tab?.id;
    if (!tabId) return;

    // Service adını URL'den çıkar
    // serviceUrl: https://host/main/ifsapplications/projection/v1/
    // Ama hangi .svc? PurchaseOrderHandling mi, başka bir şey mi?
    // pageUrl'den projection URL'ini bul
    // En basit: cache'deki mevcut entity'lerin URL'sinden servis adını çıkar
    (async () => {
      const cache = await getCache();
      const tabCache = cache[tabId] || {};
      
      // Mevcut cache'den bir servis URL'i al
      let baseProjectionUrl = null;
      for (const [ent, data] of Object.entries(tabCache)) {
        if (data.url && data.url.includes('.svc/')) {
          // https://host/.../PurchaseOrderHandling.svc/PurchaseOrderSet
          // → https://host/.../PurchaseOrderHandling.svc/
          baseProjectionUrl = data.url.replace(/\.svc\/.+/, '.svc/');
          break;
        }
      }

      if (!baseProjectionUrl) {
        // Fallback: pageUrl'den oluştur
        const match = pageUrl.match(/(https?:\/\/[^/]+)/);
        if (!match) return;
        // Projection base URL'i bulmak için başka entity'nin URL'sine bakıyoruz
        // bulamazsak skip
        return;
      }

      // entitySet URL'i oluştur: aynı servis + entitySet adı
      const entityUrl = baseProjectionUrl + entitySet + '?$top=200';

      console.log('[Ahtapot BG] LU fetch:', entityUrl);

      try {
        const resp = await fetch(entityUrl, {
          credentials: 'include',
          headers: { 'Accept': 'application/json' }
        });
        if (!resp.ok) {
          console.log('[Ahtapot BG] LU fetch failed:', resp.status, entitySet);
          return;
        }
        const data = await resp.json();
        const records = data.value || [];
        if (!records.length) return;

        // Cache'e yaz
        if (!cache[tabId]) cache[tabId] = {};
        cache[tabId][entitySet] = {
          records,
          service: baseProjectionUrl.match(/\/([^/]+)\.svc\//)?.[1] || 'Unknown',
          url: entityUrl,
          key: null,
          capturedAt: Date.now(),
          stale: false
        };
        await setCache(cache);

        console.log('[Ahtapot BG] LU yakalandı:', entitySet, records.length, 'kayıt');

        // Popup'a bildir
        chrome.runtime.sendMessage({
          type: 'CACHE_UPDATED',
          tabId,
          entity: entitySet,
          recordCount: records.length
        }).catch(() => {});

      } catch(e) {
        console.log('[Ahtapot BG] LU fetch error:', e.message);
      }
    })();
    return;
  }

  // ── Cross-env fetch ──
  if (msg.type === 'FETCH_ENTITY') {
    fetch(msg.url, { credentials: 'include' })
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  // ── Cross-env POST ──
  if (msg.type === 'POST_ENTITY') {
    const { url, body, etag } = msg;
    const headers = { 'Content-Type': 'application/json' };
    if (etag) headers['If-Match'] = etag;
    fetch(url, { method: 'POST', credentials: 'include', headers, body: JSON.stringify(body) })
      .then(r => r.json().then(data => ({ ok: r.ok, status: r.status, data })))
      .then(result => sendResponse(result))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  // ── Cache temizle ──
  if (msg.type === 'CLEAR_CACHE') {
    (async () => {
      const { tabId, cache } = await findTabWithData(null);
      if (tabId && cache[tabId]) {
        delete cache[tabId];
        await setCache(cache);
      }
      sendResponse({ ok: true });
    })();
    return true;
  }
});
