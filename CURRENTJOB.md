# 🎯 CURRENTJOB — Aktif Görev

> Bu dosya **her zaman tek bir görevi** anlatır.

---

## Şu Anda: **F-16 Faz 2 · "Excel İndir"de eksik entity'ler için auto-fetch**

| Alan | Değer |
|------|-------|
| **Atıf** | [PROJECT_FEATURES.md §5 F-16](./PROJECT_FEATURES.md) |
| **Öncelik** | P0 (kullanıcının ana isteği — manuel tab gezme gereksinimi kalkar) |
| **Branch** | `dev` |

### Faz 1 + 1.6 + 1.7 + 1.8 + 1.9 + 1.10 + 1.11 tamamlandı

- Şablon yüklerken UI: blok eşleştirme satırları otomatik açılır
- Örnek İndir modal: header + N satır bloğu seçimi
- Şablon meta: docProps/custom.xml'e AhtapotMapping → yüklemede auto-detect
- `$metadata` parse: EntitySet + EntityType + NavigationProperty + Function listeleri
- Discovered listesi: cache + nav-prop (Collection olanlar) + page-relevant Function'lar (filter'lı)
- Active tab başlığı injector capture'a eklendi (kullanıcı tab'a tıkladığı entity için Türkçe başlık)
- Display name tam çözümü (Translation API) **F-18 olarak sonraki döngüye atıldı**

### Şu anda eksik

Kullanıcı bir kayıt açtığında:
1. Header yakalanır (örn. PurchaseRequisitionSet)
2. IFS'in açtığı aktif tab'ın entity'si yakalanır (örn. PartRequisitionLines)
3. Diğer tab'lardaki entity'ler **dropdown'da görünür ama cache'te yok**
4. Kullanıcı şablonda bu blokları (örn. APPROVALS=PurchaseRequisitionLineApproval) seçer
5. **"Excel İndir" basıldığında o entity'ler için veri yok → boş rapor**

Çözüm: generateReport öncesinde her blok için cache kontrol; yoksa background'a fetch et.

### Tasarım

**popup.js → generateReport içinde**:
```js
// Her blok için cache kontrol
for (const blockMapping of blockMappings) {
  const cached = cacheData.find(e => e.entity === blockMapping.entity);
  if (!cached || cached.stale) {
    addLog('Fetch: ' + blockMapping.entity, 'info');
    const resp = await sendMsg({
      type: 'FETCH_ENTITY_FOR_BLOCK',
      headerEntity: headerEntityName,
      targetEntity: blockMapping.entity
    });
    if (!resp?.ok) addLog('Fetch hatası: ' + resp?.error, 'err');
  }
}
// Sonra normal akış (GET_ENTITY_DATA + generateReport)
```

**background.js → yeni handler `FETCH_ENTITY_FOR_BLOCK`**:
- `header entity`'nin cache'lenmiş URL'inden service base + key çıkar
  - Service base: `https://.../PurchaseRequisitionHandling.svc/`
  - Header key: parantezden (`RequisitionNo='5'`)
- Target entity için URL inşa et:
  - **Nav-prop ise** (cache'te __serviceMeta'dan biliniyor): `${svcBase}${headerEntity}(${key})/${navName}?$top=200`
  - **Function ise** (`__discovered[entity].functionName` varsa): `${svcBase}${functionName}(${params})` — header key'in field/value'sini parametre olarak geçir
  - **EntitySet ise** (fallback): `${svcBase}${targetEntity}?$filter=${keyField} eq ${keyValue}`
- Fetch et, cache'e yaz, popup'a CACHE_UPDATED mesajı

### Etkilenecek dosyalar

- `popup.js` (generateReport öncesi auto-fetch loop, ~15 satır)
- `background.js` (FETCH_ENTITY_FOR_BLOCK handler, ~50 satır URL inşası + fetch + cache)

### CWS uyumluluğu

Sıfır risk. Sadece extension içi mesajlaşma + IFS'in mevcut OData endpoint'lerine fetch.

### Done criteria

- [ ] Kullanıcı bir PR açar, IFS sadece varsayılan tab'ı render eder (Malzeme açık)
- [ ] Popup → Şablon Yükle (header=PurchaseRequisitionSet, LINES=PartRequisitionLines, APPROVALS=PurchaseRequisitionLineApproval)
- [ ] Excel İndir basılır
- [ ] Console'da "Fetch: PurchaseRequisitionLineApproval" log'u görülür
- [ ] Rapor indirilir, APPROVALS bloğunda gerçek onay satırları vardır
- [ ] Aynısı nav-prop ve Function entity'leri için çalışır
- [ ] Eksik entity için fetch başarısız olursa boş blok ile rapor üretilir (kullanıcı görmesin diye log'a yazılır)

---

*Bu Faz 2 sonrası F-16 tamamlanır. Sıradakine (F-15 chrome.webNavigation veya F-04 cross-env) geçilir.*
