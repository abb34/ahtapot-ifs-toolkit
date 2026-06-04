# 🎯 CURRENTJOB — Aktif Görev

> Bu dosya **her zaman tek bir görevi** anlatır. Görev biter bitmez bir sonraki `TODO.md` maddesiyle güncellenir.
> Geçmiş görevlerin özeti `TODO.md` altındaki "İlerleme Kayıtları"nda durur.

---

## Şu Anda: **F-03 · Ortak filtre modülü (`isSystemEntity` dedup)**

| Alan | Değer |
|------|-------|
| **Atıf** | [PROJECT_FEATURES.md §5 F-03](./PROJECT_FEATURES.md), [TODO.md](./TODO.md) |
| **Öncelik** | P0 |
| **Branch** | `dev` |
| **Açılış tarihi** | 2026-06-04 |

### Niye bu görev sırada?

Şu anda **aynı amaca hizmet eden iki ayrı filtre listesi** var:

- `popup.js:9-34` → `SYSTEM_ENTITY_PATTERNS`, `SYSTEM_SERVICES`, `isSystemEntity()`
- `injector.js:13-32` → `SKIP_SERVICES`, `SKIP_ENTITY`, `shouldSkip()`

Listeler farklı isimli, farklı sayıda madde içeriyor ve bağımsız evrim geçiriyorlar. Yeni bir sistem entity'sini (`UserSettings`, `BrandingSet` vb.) eklemek istediğimde iki yere de eklemeyi unutursam, popup gösterirken injector yakalıyor — ya da tersi. F-01'den sonra (kaynak tek hakikat) bu dedup'un anlamı var; F-01 öncesi bundle drift'i zaten her şeyi maskeliyordu.

Bonus: `background.js`'de de `SKIP_FIELDS`, `isBadField()`, `cleanRecord()`, `cleanFields()` var. Bunlar farklı amaç (record sanitization) ama yine de "filtre" sınıfı; ortak modülde toplamak gelecekteki F-04 (`@odata.*` strip) için zemini hazırlar.

### Çözüm

Yeni dosya: **`shared-filters.js`** (kökte, alt dizin yaratmadan — manifest yollarını basit tutmak için).

İçeriği iki bağımsız blokta organize edilecek:

```js
// === ENTITY FILTRESİ (popup + injector ortak kullanır) ===
window.AHTAPOT_FILTERS = window.AHTAPOT_FILTERS || {};
window.AHTAPOT_FILTERS.SYSTEM_SERVICES = new Set([...]);
window.AHTAPOT_FILTERS.SYSTEM_ENTITY_PATTERNS = [...];
window.AHTAPOT_FILTERS.isSystemEntity = function(entity, service) {...};

// === RECORD SANITIZATION (background + report-engine ortak kullanır) ===
window.AHTAPOT_FILTERS.SKIP_FIELDS = new Set([...]);
window.AHTAPOT_FILTERS.isBadField = function(k) {...};
window.AHTAPOT_FILTERS.cleanRecord = function(r) {...};
window.AHTAPOT_FILTERS.cleanFields = function(record) {...};
```

`window.AHTAPOT_FILTERS` namespace kullanılmasının sebebi: MAIN world'de global çakışmadan kaçınmak (IFS uygulamasının kendi globals'ına dokunmamak).

### Yükleme stratejisi (üç runtime'da farklı)

1. **Popup** → `popup.html`'in head/body'sine yeni script tag eklenir:
   ```html
   <script src="shared-filters.js"></script>   <!-- diğerlerinden önce -->
   <script src="xlsxwriter.js"></script>
   <script src="report-engine.js"></script>
   <script src="popup.js"></script>
   ```

2. **Background service worker** → `background.js`'in en üstüne:
   ```js
   importScripts('shared-filters.js');
   ```
   MV3 service worker'da `importScripts()` yasal; kullanım yerinde, async değil.

3. **Injector (MAIN world)** → `manifest.json`'da content_scripts array'i:
   ```jsonc
   {
     "matches": ["*://*/*"],
     "js": ["shared-filters.js", "injector.js"],   // sıralı yüklenir, ikisi de MAIN world
     "run_at": "document_start",
     "world": "MAIN"
   }
   ```
   **Not:** content.js (ISOLATED world) bu dosyaya erişmeyecek — orada `isSystemEntity` ihtiyacı yok. widget.js de kullanmıyor. Sadece MAIN'e enjekte.

### Etkilenecek dosyalar

- `shared-filters.js` (yeni)
- `manifest.json` (injector content script block güncellenir; **host_permissions ve diğerleri değişmez** → CWS yüzeyi büyümüyor)
- `popup.html` (1 yeni script tag, en başa)
- `popup.js` (lines 9-40 silinir, çağrılar `window.AHTAPOT_FILTERS.isSystemEntity()` olur)
- `injector.js` (lines 13-39 silinir, `shouldSkip` `window.AHTAPOT_FILTERS.isSystemEntity` ile değiştirilir — adlandırma uyumu için wrapper kalabilir)
- `background.js` (lines 163-187 silinir, en üste `importScripts('shared-filters.js')`)

### CWS uyumluluğu

Bu görev CWS açısından **sıfır risk**:
- Yeni `host_permissions` yok, mevcutla aynı (`*://*/*`).
- Yeni `permissions` yok.
- Yeni external script/CDN yok — sadece extension içi dosya.
- `eval`/`new Function` yok.
- Inline event handler yok.
- `importScripts` MV3 service worker için **resmi olarak destekleniyor**.

### Done criteria

- [ ] `shared-filters.js` oluşturuldu, içinde tüm entity + sanitize fonksiyonları.
- [ ] `popup.html` script tag sırası: shared-filters → xlsxwriter → report-engine → popup.
- [ ] `popup.js`'te eski liste/fonksiyon kaldı (alias değil, gerçekten silindi); çağrılar `window.AHTAPOT_FILTERS.*` üzerinden.
- [ ] `injector.js`'te eski liste kaldı, çağrılar `window.AHTAPOT_FILTERS.isSystemEntity` üzerinden.
- [ ] `manifest.json` MAIN world content script `["shared-filters.js", "injector.js"]` olarak güncellendi.
- [ ] `background.js` en üstte `importScripts('shared-filters.js')`, eski SKIP_FIELDS/cleanRecord/cleanFields silindi, çağrılar `globalThis.AHTAPOT_FILTERS.*` üzerinden (service worker için `globalThis`).
- [ ] Eklenti Chrome'a yüklenir, popup açılır, console error yok.
- [ ] Bir IFS sayfasında entity yakalama akışı çalışıyor (regresyon yok).
- [ ] `dev` branch'e tek commit.
- [ ] `TODO.md` ve `CURRENTJOB.md` güncellendi.

### Test notu (manuel)

Danışman: Chrome'da extension'ı yeniden yükle → popup aç → "Henüz veri yok" hatasız → bir IFS sayfasında PO açar → eklenti popup'ı entity yakaladığını gösterir → "Excel İndir" sorunsuz çalışır. Console'da `AHTAPOT_FILTERS is not defined` veya benzeri hata olmamalı.

---

*Bu dosya, görev tamamlandığında bir sonraki TODO maddesinin (F-02 — cache write race) içeriğiyle değiştirilir.*
