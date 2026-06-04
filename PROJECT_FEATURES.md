# 🐙 Ahtapot — ERP Toolkit · Proje Özellikleri (Bu Döngü)

> **Doküman amacı:** Bu döngünün kapsamını, hedefini ve adım adım yapılacak işleri tek bir yerde tutmak. `TODO.md` buraya atıflarla bağlanır, `CURRENTJOB.md` ise sırada olan adımı detaylandırır.

---

## 1. Kapsam

Bu döngü **yeni özellik geliştirme değil**, **mevcut Ahtapot ERP Toolkit eklentisinin teknik borç ve hata temizliğidir**. Hedef:

- Mevcut tüm kullanıcı akışlarını (Rapor, Ortam Etiketi, Çapraz Kopyalama, Sticky Notlar, Analiz) **bozmadan** ve **görünür UI değişikliği yapmadan** içerideki kırılgan/eksik mantıkları sağlamlaştırmak.
- Codebase'i bir sonraki feature döngüsüne hazır hale getirmek (kaynak ↔ bundle senkronu, ortak filtre listeleri, race condition'lar, vb.).
- Chrome Web Store yayın hazırlığı **bu döngünün hedefi değildir**, ama yayını engelleyebilecek manifest/host izni ve "veri dışarı gitmez" gizlilik ihlali maddeleri ileride çözmek üzere işaretlenir (P3).

## 2. Hedef Kullanıcı

İki profil de hedeflenir, ama bu döngüde **kimsenin görünür akışı bozulmaz**:

- **Danışman:** IFS Cloud üzerinde çalışan teknik kullanıcı. OData/entity terminolojisini bilir. Çoklu IFS ortamı (test/uat/prod) arası çalışır.
- **Son kullanıcı:** Satınalmacı, operatör vb. Sadece widget + sticky notes + hızlı rapor butonunu kullanır. Şablonu danışman hazırlamıştır.

Bu döngüde yapılan tüm değişiklikler **iki profil için de davranışsal regresyon yaratmamalıdır**.

## 3. Branch Akışı

Bu projenin boyutuna uygun, minimal sürtünmeli akış:

```
dev   ──╮ aktif geliştirme, WIP commit'ler buraya
        │
prod  ──╯ yalnızca dev'de bitmiş + manuel test edilmiş görevler buraya merge edilir
            (manuel yüklenebilir stable build her zaman bu branch'tedir)

main  ──── şimdilik dondurulmuştur; ileride prod'a hizalanır veya silinir
```

**Akış kuralı:**

1. `CURRENTJOB.md` bir görevle açılır → tüm değişiklikler `dev` üzerinde commit edilir.
2. Görev `CURRENTJOB.md`'deki "Done criteria" maddelerini sağladığında `dev → prod` merge edilir (fast-forward veya merge commit).
3. Merge sonrası `CURRENTJOB.md` bir sonraki `TODO` adımına güncellenir ve `TODO.md` üzerinde madde `[x]` ile kapatılır.

## 4. Mevcut Ürün — Modül Özeti

`PROD/MEVCUT` durumun referansı (değişiklikler bu yapı üzerine inşa edilir):

| Dosya | Rol |
|------|-----|
| `manifest.json` | MV3, `*://*/*` host + content scripts (3 adet: content/injector/widget) |
| `background.js` | Service worker. OData yakalama cache'i (chrome.storage.local), header→lines otomatik çekme, cross-env fetch/POST |
| `injector.js` | MAIN world. `fetch` + `XHR` override + OData `$batch` parser |
| `content.js` | ISOLATED world bridge. Env banner, sticky notes render, DOM LU name observer |
| `widget.js` | MAIN world. Sayfa üzerine yüzen 🐙 FAB widget'ı. Sticky note + wake lock + hızlı rapor |
| `report-engine.js` | XLSX şablon motoru (shared + inline strings, `{{#LINES}}…{{/LINES}}` blok genişletme, DecompressionStream'li ZIP parse) |
| `xlsxwriter.js` | Şablonsuz basit XLSX yazıcı (stored compression) |
| `popup.html` + `popup.js` | 500px popup UI. 6 tab: Rapor / Ortam / Çapraz / Notlar / Analiz / Ayarlar |
| `popup-bundle.js` | xlsxwriter + report-engine + popup.js'in **manuel concat** edilmiş hali. popup.html sadece bunu yükler |

## 5. Bu Döngüde Çözülecek Bulgular

İnceleme raporundan çıkan 11 madde. Önceliklendirme aşağıdaki gibi. `TODO.md` bu maddelere `F-##` kodlarıyla atıfta bulunur.

### P0 — Kritik (diğer fix'lerin önkoşulu)

- **F-01: `popup-bundle.js` ↔ kaynak dosya drift'i**
  `popup.html` yalnızca `popup-bundle.js`'i (115K) yükler, fakat repo'da `popup.js` + `report-engine.js` + `xlsxwriter.js` ayrı dosyalar olarak da durur. Build script yok. **Kaynakta yapılan her değişiklik bundle'a el ile yansıtılmazsa runtime'da etkisiz kalır.** Bu, diğer tüm fix'leri görünmez yapar.
  **Çözüm:** Ya küçük bir build script (`scripts/build-popup.js`) ile concat'i otomatikleştir, ya da `popup.html`'i 3 ayrı `<script>` tag'iyle yükle ve `popup-bundle.js`'i sil.

- **F-02: `background.js` cache write race condition**
  `DATA_CAPTURED` handler içinde `getCache()` → mutate → `setCache()` async; eş zamanlı iki yakalama gelirse son yazan kazanır, ilki kaybolur (özellikle `$batch` cevaplarında).
  **Çözüm:** Tek bir promise queue (`cacheWritePromise = cacheWritePromise.then(...)`) ile yazımları serialize et.

- **F-03: `isSystemEntity` / SKIP listeleri iki yerde duplicate**
  `popup.js:9-34` ve `injector.js:13-32` aynı pattern listesini ayrı tutuyor. Drift garanti.
  **Çözüm:** Ortak `shared/filters.js` (background + injector + popup tarafından okunabilir).

- **F-14: `processInlineStrings` row numerlandırması eksik** (runtime test sırasında keşfedildi)
  `report-engine.js:263` inline-string formatlı şablonlarda her line için template row'u kopyalarken `<row r="N">` ve `<c r="A13">` ref attribute'larını yeniden yazmıyor. Sonuç: 9 satırlık veriden Excel sadece son satırı render eder (aynı `r=` çakışması). Shared-strings code path'i (line 405) bunu doğru yapıyor; inline path tasarımı eksik. Bu, openpyxl/Excel-kaydet-as gibi araçlarla üretilen tüm şablonları (sharedStrings.xml olmayan) etkiliyor.
  **Çözüm:** `processInlineStrings`'i tüm `<sheetData>` içeriğini yeniden inşa edecek şekilde refactor et — inserted rows artan rowNum alır, block sonrası rows `(insertedCount - blockSize)` kadar offset edilir.

### P1 — Yüksek

- **F-04: Cross-env "Çapraz Kopyala" birkaç kırık parça içeriyor**
  - Endpoint inşası: `targetEndpoint.split('?')[0].split('(')[0] + 'Set'` → yanlış URL üretebilir.
  - UI'da `conflict` seçeneği (`skip`/`update`/`error`) var ama **kodda hiç kullanılmıyor**.
  - `@odata.*` / `Objversion` / `Objkey` field'ları temizlenmeden POST ediliyor.
  - ETag / `If-Match` desteği yok.
  - Tek seferde tek kayıt (`resp.records[0]`) kopyalıyor, UI çoklu gibi davranıyor.

- **F-05: `background.js:288` single-record heuristic kırılgan**
  `!entity.toLowerCase().includes('line')` ile karar veriliyor. `OrderLine`, `PurchOrderLine` gibi entity adlarıyla yanlış pozitif/negatif.
  **Çözüm:** URL pattern (`(...)` parantezli) tek belirleyici olmalı, isim heuristic'i ek doğrulama olarak kalmalı.

- **F-06: Pagination merge hash zayıf**
  `background.js:259-266` → `JSON.stringify(Object.values(r).slice(0, 3))`. İlk 3 alanı eşit olan farklı kayıtlar duplicate sayılır.
  **Çözüm:** Entity'nin key field'larından (URL'deki key parametresi + `luname`) deterministik hash üret.

- **F-07: `$batch` boundary regex eksik**
  `injector.js:135` ve `content.js` boundary'i regex (`/--[a-f0-9-]{20,}/`) ile arıyor. Bazı IFS sürümleri `batchresponse_<uuid>` prefix'i kullanıyor.
  **Çözüm:** Response'un `Content-Type` header'ından `boundary=` parametresini parse et.

### P2 — Orta

- **F-08: `fetchRelatedLines` PurchaseOrder'a hard-coded**
  `LinePartArray` / `LineNopartArray` / `LineRentalPartArray` + 60+ alan ismi tek bir yerde. Diğer modüller (SO, Customer Order, Project) eklenemez.
  **Çözüm:** `nav-property` haritası `chrome.storage.local`'dan okunan config'e taşı; varsayılan olarak PurchaseOrder kalsın.

- **F-09: Projection base URL tahmini sabit**
  `content.js:546` → `window.location.origin + '/main/ifsapplications/projection/v1/'`. Bazı IFS deployment'larında farklı path var.
  **Çözüm:** İlk yakalanan IFS fetch'inden base URL'i öğren ve cache'e koy.

### P3 — Düşük (bu döngüde dokunulmaz, sadece kayda alınır)

- **F-10: `host_permissions: "*://*/*"`** Chrome Web Store için kırmızı bayrak. CWS yayın döngüsünde daraltılır.
- **F-11: `popup.html` Google Fonts CSS yükler.** README'deki "hiçbir veri dışarıya gönderilmez" iddiasıyla çelişir. CWS döngüsünde lokal font veya system stack'e geçilir.
- **F-12: Widget "Hızlı Rapor" akışı çalışmıyor** (pre-existing — bundle döneminde de bozuktu, F-01 ile keşfedildi). `widget.js:428` MAIN world'de `window.IFSReportEngine` ve `window.XLSXWriter` arar; bunlar yalnızca `popup.html` üzerinden yüklenir, MAIN world'e hiç gelmez. Sonuç: widget'tan "▶ Çalıştır" her zaman "Rapor motoru hazır değil" feedback'i gösterir. En temiz çözüm `chrome.downloads` izni + content.js (ISOLATED world) üzerinden işleme — yeni manifest izni gerektirdiği için F-10/F-11 ile birlikte CWS uyumluluk döngüsünde ele alınacak. **Bu döngüde widget quick-report kullanılmaz; popup'tan Excel İndir alternatifi vardır.**

### Bu döngüde yeni eklenen (UX / özellik)

- **F-16: Şablon-bazlı entity mapping + Excel İndir'de auto-fetch** (kullanıcı talebi)
  Şablonda birden çok blok (`{{#LINES}}`, `{{#APPROVALS}}` vb.) olduğunda her bloğun karşılığı entity'nin IFS'te o sayfada açıldığı tab/widget yakalanmadıkça cache'e düşmüyor. Kullanıcı şu an her bloka manuel entity eşleştirir; eksik entity için sayfada ilgili tab'a tıklamak zorunda. Yeni davranış:
  - **Faz 1:** Şablon yüklendiğinde `analyzeTemplate` blok adlarını çıkarır → kullanıcıya her blok için entity adı sorulur (dropdown: yakalanmışlar + "elle yaz" seçeneği). Eşleştirme şablonun `analysis.blocks[i].entity`'sine kaydedilir.
  - **Faz 2:** "Excel İndir" basıldığında her blok için cache kontrolü; eksikse background'a `FETCH_ENTITY_FOR_BLOCK` mesajı (header URL'inden service base + key çıkarılır, `${svcBase}${targetEntity}?$filter=${keyField} eq ${keyValue}` ile fetch). Cache'e yazılır, rapor üretilir.
  Sonuç: kullanıcı tek bir kayıt açar, popup'ta şablonu seçer, Excel İndir basar — gerekli tüm entity'ler arka planda fetch edilir.

- **F-15 (yeniden):** İlk uygulama `content.js`'ten `URL_CHANGED` postMessage atıyordu; bu IFS Aurena `window.fetch` override timing'ini bozdu (capture log gelmemesine yol açtı, `5594e93` revert edildi). Yeni strateji: **`chrome.webNavigation.onHistoryStateUpdated`** background API'siyle SPA pushState'i yakala, cache stale işaretle. `content.js`'e hiç dokunma. Yeni manifest permission: `"webNavigation"`. CWS gerekçesi: SPA cache invalidation.

## 6. Yapılmayacaklar (Bu Döngünün Dışı)

Aşağıdakiler bu döngünün **kapsamı dışındadır**, `TODO.md`'ye girmezler. İhtiyaç doğarsa yeni döngüde ele alınır:

- Yeni IFS modülleri için özellik geliştirme (SO, Customer Order, Project gibi)
- Yeni rapor formatları (PDF için yeni bir motor, vb.)
- Chrome Web Store yayını
- Yeni dil ekleme
- UI redesign
- Mevcut bir özelliğin kaldırılması

## 7. Done Tanımı (Bu Döngü)

Bu döngü, aşağıdakilerin hepsi sağlandığında kapanır:

1. `TODO.md`'deki F-01…F-09 maddelerinin tamamı `[x]` ile kapatılmıştır.
2. `dev → prod` merge edilmiştir.
3. Mevcut beş kullanıcı akışı (Rapor / Ortam / Çapraz / Notlar / Analiz) bir IFS Cloud sayfası üzerinde manuel test edilmiş ve regresyon yoktur.
4. F-10 ve F-11 P3 olarak `TODO.md`'de "Bu döngü dışı, sonraki döngüye taşındı" notuyla durur.

## 8. Adım Sırası

`TODO.md` bu sırayla doldurulur. Her madde tek `CURRENTJOB.md` döngüsüdür:

1. **F-01** (popup-bundle senkron) — *önkoşul: diğer fix'ler buna bağlı*
2. **F-14** (inline strings row fix) — *runtime testte ortaya çıktı; rapor akışı bunsuz test edilemez*
3. **F-03** (filtre listesi dedup) — *küçük, F-01 üzerine güvenle*
4. **F-02** (cache race)
5. **F-05** (single-record heuristic)
6. **F-06** (pagination hash)
7. **F-07** ($batch boundary)
8. **F-04** (cross-env temizlik) — *en büyük; en sona*
9. **F-08** (fetchRelatedLines config)
10. **F-09** (projection URL detection)

---

*Bu doküman canlıdır. Kapsam değişirse buradan başlanır, sonra `TODO.md` ve `CURRENTJOB.md` güncellenir.*
