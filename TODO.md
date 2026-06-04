# 🐙 Ahtapot — TODO (Bu Döngü)

> Tüm maddeler `PROJECT_FEATURES.md §5`'teki `F-##` bulgularına atıflıdır.
> O an üzerinde çalışılan madde için `CURRENTJOB.md`'ye bakın.
> Bittiğinde `[ ]` → `[x]` ve `(branch: dev@<short-sha>)` notu eklenir.

## P0 — Kritik

- [x] **F-01** · Popup kaynak dosyaları ↔ `popup-bundle.js` senkronu kur · → [PROJECT_FEATURES.md §5 F-01](./PROJECT_FEATURES.md)
- [x] **F-14** · `processInlineStrings` row numerlandırma fix · → [PROJECT_FEATURES.md §5 F-14](./PROJECT_FEATURES.md)
- [ ] **F-16** · Şablon-bazlı entity mapping + Excel İndir'de auto-fetch (kullanıcı talebi) · → [PROJECT_FEATURES.md §5 F-16](./PROJECT_FEATURES.md)
  - [ ] **Faz 1**: Şablon yüklenirken entity sorma UI
  - [ ] **Faz 2**: Excel İndir'de eksik entity'ler için auto-fetch backend
- [ ] **F-15** · SPA URL değişiminde cache stale (yeniden, `chrome.webNavigation` API ile) · → [PROJECT_FEATURES.md §5 F-15](./PROJECT_FEATURES.md)
- [ ] **F-03** · `isSystemEntity` filtre listesini ortak modüle çıkar (sadece popup + background) · → [PROJECT_FEATURES.md §5 F-03](./PROJECT_FEATURES.md)
- [ ] **F-02** · `background.js` cache write race condition'ı serialize et · → [PROJECT_FEATURES.md §5 F-02](./PROJECT_FEATURES.md)

## P1 — Yüksek

- [ ] **F-05** · `background.js` single-record heuristic'ini URL pattern'ine bağla · → [PROJECT_FEATURES.md §5 F-05](./PROJECT_FEATURES.md)
- [ ] **F-06** · Pagination merge hash'ini key field'larından deterministik yap · → [PROJECT_FEATURES.md §5 F-06](./PROJECT_FEATURES.md)
- [ ] **F-07** · `$batch` boundary'i `Content-Type` header'ından parse et · → [PROJECT_FEATURES.md §5 F-07](./PROJECT_FEATURES.md)
- [ ] **F-04** · Cross-env "Çapraz Kopyala" temizliği (4 alt madde) · → [PROJECT_FEATURES.md §5 F-04](./PROJECT_FEATURES.md)
  - [ ] Endpoint inşası güvenli URL kurulumuna geçir
  - [ ] `conflict` seçeneğini (`skip`/`update`/`error`) gerçekten uygula
  - [ ] `@odata.*` / `Objversion` / `Objkey` strip et
  - [ ] ETag / `If-Match` desteği ekle (PATCH/PUT yolu için)

## P2 — Orta

- [ ] **F-08** · `fetchRelatedLines` nav-property haritasını config'ten oku · → [PROJECT_FEATURES.md §5 F-08](./PROJECT_FEATURES.md)
- [ ] **F-09** · Projection base URL'i ilk IFS fetch'inden öğren · → [PROJECT_FEATURES.md §5 F-09](./PROJECT_FEATURES.md)

## P3 — Bu Döngü Dışı (kayda alındı, sonraki döngüye)

- [ ] **F-10** · `manifest.json` `host_permissions` daraltılacak · *bu döngüde dokunulmuyor; Chrome Web Store döngüsünde*
- [ ] **F-11** · `popup.html` Google Fonts CDN bağlantısı kaldırılacak · *bu döngüde dokunulmuyor; Chrome Web Store döngüsünde*
- [ ] **F-12** · Widget "Hızlı Rapor" akışını çalışır hale getir (`chrome.downloads` + content.js köprüsü) · *pre-existing bug; F-01 ile keşfedildi; CWS döngüsünde* · → [PROJECT_FEATURES.md §5 F-12](./PROJECT_FEATURES.md)
- [ ] **F-18** · Translation API ile tüm entity'lerin display name'leri · *Faz 1.11b: kullanıcı tıklayınca öğreniyoruz; tüm Türkçe başlıklar için Translation API intercept veya alternatif. Sonraki döngüye atıldı.* · → [PROJECT_FEATURES.md §5 F-18](./PROJECT_FEATURES.md)

---

## İlerleme Kayıtları

Her madde tamamlandığında buraya tek satırlık özet düşülür:

- **F-01** ✅ (2026-06-04, dev@7d07bcf) — Bundle'da kaynaklara yansımamış 169 satır kod tespit edildi; bundle separator'larından 3 parçaya bölünüp `xlsxwriter.js` / `report-engine.js` / `popup.js` üzerine yazıldı. `popup-bundle.js` silindi, `popup.html` artık 3 ayrı `<script>` tag'iyle yüklüyor (sıra: xlsxwriter → report-engine → popup). README dosya listesi güncellendi.
- **F-14** ✅ (2026-06-04, dev@42a3275) — `processInlineStrings` row numerlandırma fix. SheetData baştan inşa edilecek şekilde refactor: inserted rows artan rowNum + güncellenmiş cell ref, block sonrası rows offset uygulamasıyla. Chrome'da `SatinalmaTalebi-Sablon.xlsx` ile doğrulandı: 9 satır LineNo 1..9 doğru sırada r=12..20'de.
- **F-15 ilk uygulama** ❌ revert (`5594e93`) — `content.js` URL_CHANGED postMessage stratejisi IFS Aurena `window.fetch` override timing'ini bozdu (capture log gelmedi). `chrome.webNavigation` ile yeniden uygulanacak.
- **F-03 ilk uygulama** ❌ revert (reset ile) — `shared-filters.js` MAIN world inject'i aynı bypass'a sebep oldu. Sadece popup + background için ortak modül olarak yeniden uygulanacak.
- **F-02 ilk uygulama** ❌ revert (reset ile) — Kendi başına regresyon yapmadı ama F-15+F-03 ile birlikte tanı zorlaştı; F-15 yeniden uygulandıktan sonra tekrar gelir.
