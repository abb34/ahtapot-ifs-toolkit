# 🎯 CURRENTJOB — Aktif Görev

> Bu dosya **her zaman tek bir görevi** anlatır.

---

## Şu Anda: **F-16 Faz 1 (revize) · Şablon yükleme + sayfa keşif tabanlı dropdown**

| Alan | Değer |
|------|-------|
| **Atıf** | [PROJECT_FEATURES.md §5 F-16](./PROJECT_FEATURES.md) |
| **Öncelik** | P0 (kullanıcı talebi) |
| **Branch** | `dev` (HEAD: F-14 noktası) |
| **Açılış tarihi** | 2026-06-04 |

### Niye bu görev

Mevcut akışta kullanıcı şablonda birden fazla blok kullanıyorsa (örn. `{{#LINES}}...{{/LINES}}` ve `{{#APPROVALS}}...{{/APPROVALS}}`), her bloğun karşılığı entity'nin IFS sayfasında ilgili tab/widget açılarak yakalanması gerekir. Üzelik popup'taki blok-eşleştirme dropdown'ları sadece **yakalanmış** entity'leri gösterir — kullanıcı entity adını ezbere bilmiyorsa açmadan eşleştiremez.

Faz 1 burada UI tarafını çözer; Faz 2 ile auto-fetch tamamlanır.

### Tasarım

Mevcut akış (`popup.js:298-335`):
```
file input → arrayBuffer → analyzeTemplate → templates storage'a kayıt
```

`analyzeTemplate` döner: `{ headerPlaceholders, blocks: [{ name, placeholders }] }`

**Yeni davranış:**
```
file input → arrayBuffer → analyzeTemplate
  → Her blok için modal/inline UI: entity adı sor
    - Dropdown: yakalanmış entity'ler (cacheData)
    - "Diğer (elle yaz)..." seçeneği → input görünür
  → Kullanıcı onaylar
  → analysis.blocks[i].entity = girilen değer
  → storage'a kayıt
```

`addBlockRow()` (mevcut blok eşleştirme satır oluşturucusu) bu yeni veriye göre **otomatik** entity dropdown'ını doldurur.

### Etkilenecek dosyalar

- `popup.js`
  - Şablon yükleme handler'ına entity sorma akışı (yeni mini-modal veya inline)
  - `renderTemplateList` / şablon seçilince blok-eşleştirme satırları kayıtlı entity ile doldurulur
  - `addBlockRow` dropdown'una "Diğer..." seçeneği

### Geri uyumluluk

Eski şablonlar `analysis.blocks[i].entity` içermez. Bu durumda eski davranış: kullanıcı manuel eşleştirir. F-16 sonrasında yüklenen şablonlar entity bilgisini içerir.

### CWS uyumluluğu

Sıfır risk. Yalnızca popup UI değişikliği. Yeni izin yok.

### Done criteria

- [ ] Şablon yüklendikten sonra her blok için entity sorulur (dropdown + manuel girdi).
- [ ] Kullanıcının seçimi şablon storage'ında `analysis.blocks[i].entity`'ye kaydedilir.
- [ ] Şablon seçilince blok-eşleştirme dropdown'ları otomatik bu entity ile doldurulur.
- [ ] Eski şablonlar için davranış değişmiyor (manuel eşleştirme korunuyor).
- [ ] Mevcut Excel İndir akışı F-14 testindeki gibi çalışıyor (regresyon yok).
- [ ] `dev` branch'e tek commit.

---

*Bu dosya, Faz 1 bitince Faz 2'ye güncellenir.*
