# 🎯 CURRENTJOB — Aktif Görev

> Bu dosya **her zaman tek bir görevi** anlatır. Görev biter bitmez bir sonraki `TODO.md` maddesiyle güncellenir.
> Geçmiş görevlerin özeti `TODO.md` altındaki "İlerleme Kayıtları"nda durur.

---

## Şu Anda: **F-01 · Popup kaynak ↔ `popup-bundle.js` senkronu**

| Alan | Değer |
|------|-------|
| **Atıf** | [PROJECT_FEATURES.md §5 F-01](./PROJECT_FEATURES.md), [TODO.md](./TODO.md) |
| **Öncelik** | P0 (önkoşul — diğer fix'ler buna bağlı) |
| **Branch** | `dev` |
| **Açılış tarihi** | 2026-06-04 |

### Niye bu görev önce?

`popup.html` runtime'da yalnızca `popup-bundle.js`'i (115 KB) yükler. Repo'da `popup.js` (73 KB), `report-engine.js` (24 KB) ve `xlsxwriter.js` (8 KB) ayrı dosyalar olarak da durur. **Bundle bu üç dosyanın manuel concat edilmiş hali.**

Sonuç:

- Kaynak dosyalarda yapılan herhangi bir düzeltme `popup-bundle.js` yeniden üretilmezse **runtime'da hiçbir etki yaratmaz**.
- Bundan sonraki F-02…F-09 fix'lerinin birçoğu (özellikle `popup.js`'i etkileyenler) bu sorun çözülmeden test edilemez.
- Drift sessizce ilerler: bundle'a girmemiş bir fix bug raporuyla geri gelebilir.

Yani bu görev, döngünün gerçek bir önkoşulu.

### İki olası çözüm

**A) `popup-bundle.js`'i sil, `popup.html` 3 ayrı script yüklesin.**
- Artıları: Build script yok; basit, tek seferlik bir değişiklik; popup MV3'te `localhost` indirme/CSP sorunu yaratmaz; debugger'da kaynak dosya doğrudan görünür.
- Eksileri: Her popup açılışında 3 ağ isteği yerine 1; pratikte ölçülemez fark.

**B) Küçük bir `scripts/build-popup.js` ile concat'i otomatikleştir, pre-commit hook'la zorla.**
- Artıları: Tek dosya kalır, popup açılış HTTP istek sayısı 1.
- Eksileri: Node bağımlılığı (şu an repo'da yok); kullanıcı/danışman repo'yu klonlayıp el yüklediğinde build adımını çalıştırması gerekir; hook setup zorunlu.

**Seçim (öneri):** **A.** Bu projede performans birinci öncelik değil, sade tooling birinci öncelik. Üç ayrı `<script>` tag yeterli ve gelecekteki tüm fix'leri tek dosya değişikliğine indirir.

> ⚠️ Implementasyona geçmeden önce kullanıcı bu seçimi onaylamalı.

### Adımlar (Seçim A için)

1. `popup.html` → sondaki `<script src="popup-bundle.js"></script>` satırı kaldırılır, yerine sırasıyla:
   ```html
   <script src="xlsxwriter.js"></script>
   <script src="report-engine.js"></script>
   <script src="popup.js"></script>
   ```
   yüklenir. **Sıra önemli:** `report-engine.js` `window.XLSXWriter`'a, `popup.js` ise `window.IFSReportEngine` ve `window.XLSXWriter`'a bağımlı.

2. `popup-bundle.js` repo'dan silinir.

3. Üç dosyanın tarayıcıda yüklenme sırasına göre çalıştığı manuel doğrulanır:
   - Chrome'da `chrome://extensions/` → Ahtapot → "Reload"
   - Popup açılır, console error yok.
   - "Rapor" tabında bir entity seçilir, "Örnek İndir" butonu çalışır (XLSXWriter erişilebilir).
   - Bir IFS sayfasında yakalanan bir entity ile "Excel İndir" denenir (ReportEngine zinciri).

4. Değişiklik `dev` branch'ine commit edilir: tek commit, mesaj kısa.

5. `TODO.md` güncellenir: `[ ] F-01` → `[x] F-01 (dev@<sha>)`, "İlerleme Kayıtları"na tek satır eklenir.

6. `CURRENTJOB.md` bir sonraki TODO maddesine (F-03 — filtre listesi dedup) güncellenir.

### Etkilenecek dosyalar

- `popup.html` (1 satır değişir + 3 satır eklenir)
- `popup-bundle.js` (silinir)
- `TODO.md` (madde kapatma + ilerleme satırı)
- `CURRENTJOB.md` (sonraki göreve geçer)

### Done criteria

- [ ] `popup-bundle.js` repo'da yok.
- [ ] `popup.html` üç ayrı `<script>` tag'iyle yüklüyor (xlsxwriter → report-engine → popup).
- [ ] Eklenti `chrome://extensions/` üzerinden "Load unpacked" ile yüklendiğinde popup hatasız açılıyor.
- [ ] "Örnek İndir" buton akışı çalışıyor (XLSXWriter zinciri).
- [ ] Mevcut bir IFS şablonuyla "Excel İndir" çalışıyor (ReportEngine zinciri).
- [ ] `dev` branch'ine commit'lendi.
- [ ] `TODO.md` ve `CURRENTJOB.md` güncellendi.

### Test notu (manuel)

Manuel doğrulama yapacak kişi (danışman): Bir IFS Cloud sayfası açın (`*.ifs.cloud`), bir Purchase Order kaydı görüntüleyin, eklenti popup'ında en az bir entity yakalandığını doğrulayın, sonra "Excel İndir" ile basit bir şablonla rapor üretin. Hata yoksa kabul.

---

*Bu dosya, görev tamamlandığında bir sonraki TODO maddesinin içeriğiyle değiştirilir.*
