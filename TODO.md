# 🐙 Ahtapot — TODO (Bu Döngü)

> Tüm maddeler `PROJECT_FEATURES.md §5`'teki `F-##` bulgularına atıflıdır.
> O an üzerinde çalışılan madde için `CURRENTJOB.md`'ye bakın.
> Bittiğinde `[ ]` → `[x]` ve `(branch: dev@<short-sha>)` notu eklenir.

## P0 — Kritik

- [ ] **F-01** · Popup kaynak dosyaları ↔ `popup-bundle.js` senkronu kur · → [PROJECT_FEATURES.md §5 F-01](./PROJECT_FEATURES.md)
- [ ] **F-03** · `isSystemEntity` filtre listesini ortak modüle çıkar · → [PROJECT_FEATURES.md §5 F-03](./PROJECT_FEATURES.md)
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

---

## İlerleme Kayıtları

Her madde tamamlandığında buraya tek satırlık özet düşülür:

<!-- örnek: -->
<!-- - F-01 ✅ (2026-06-04, dev@abc1234) — popup.html artık 3 ayrı script tag yüklüyor, popup-bundle.js silindi -->
