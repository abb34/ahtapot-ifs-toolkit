# 🎯 CURRENTJOB — Aktif Görev

> Bu dosya **her zaman tek bir görevi** anlatır. Görev biter bitmez bir sonraki `TODO.md` maddesiyle güncellenir.
> Geçmiş görevlerin özeti `TODO.md` altındaki "İlerleme Kayıtları"nda durur.

---

## Şu Anda: **F-14 · `processInlineStrings` row numerlandırma fix**

| Alan | Değer |
|------|-------|
| **Atıf** | [PROJECT_FEATURES.md §5 F-14](./PROJECT_FEATURES.md), [TODO.md](./TODO.md) |
| **Öncelik** | P0 (rapor akışı bunsuz test edilemiyor) |
| **Branch** | `dev` |
| **Açılış tarihi** | 2026-06-04 |

### Niye bu görev sırada (F-03'ün önüne aldık)?

F-01 sonrası runtime testte ortaya çıktı: openpyxl ile üretilen şablon (inline-string formatlı, sharedStrings.xml yok) eklentiye yüklenip "Excel İndir" yapıldığında **9 satır veriden Excel sadece son satırı render ediyor**. Sebep `report-engine.js:263` `processInlineStrings` içinde tespit edildi:

```js
lineRecords.forEach(lineRec => {
  templateRows.forEach(tRow => {
    const filled = tRow.xml.replace(/\{\{...\}\}/g, ...);  // sadece placeholder doldurur
    insertedXML += filled;     // ← her satır hâlâ r="13"
  });
});
```

Sonuç XML'de 9 adet `<row r="13">` ve 9 adet `<c r="A13">` yan yana. Excel aynı `r=` ref'li çoklu girdiyi gördüğünde sadece **sonuncusunu** render eder.

Shared-strings code path'i bunu doğru yapıyor (line 405: `'<row r="' + newRowNum + '">'`). Inline path tasarımı eksik kalmış. **Bu pre-existing bir bug** — F-01 nedeniyle değil — ama F-01 runtime testi olmadan keşfedilemezdi.

### Etki

- Excel'e "Kaydet As .xlsx" yapan tüm şablonlar (inline-string formatı)
- openpyxl/numpy/pandas ile üretilen şablonlar
- Microsoft Office'in standart kayıt formatı

Yani **gerçek kullanıcı senaryolarının çoğu**. Test edemediğimiz için kritik.

### Çözüm

`processInlineStrings`'i `<sheetData>` içeriğini **tam yeniden inşa edecek** şekilde refactor et:

1. Tüm `<row r="N">` etiketlerini rowNum ile birlikte parse et
2. Üç parçaya ayır:
   - **Block öncesi** (0…startIdx-1) → olduğu gibi
   - **Inserted rows** → her line × her template row, **artan rowNum** ve güncellenmiş cell ref'leriyle
   - **Block sonrası** (endIdx+1…son) → `(insertedCount - blockSize)` kadar **offset edilmiş** rowNum ve cell ref'leriyle
3. Tüm sheetData yeniden serileştirilir.

```js
// Pseudo
let writeRowNum = blockStartRowNum;
lineRecords.forEach(lineRec => {
  templateRows.forEach(tRow => {
    let filled = tRow.xml.replace(/\{\{(\w+)\}\}/g, ...);
    filled = filled.replace(/<row\s+r="\d+"/, '<row r="' + writeRowNum + '"');
    filled = filled.replace(/<c\s+r="([A-Z]+)\d+"/g, '<c r="$1' + writeRowNum + '"');
    newRows.push(filled);
    writeRowNum++;
  });
});
// + block sonrası rows için aynı offset uygulaması
const newSheetData = '<sheetData>' + newRows.join('') + '</sheetData>';
sheetXML = sheetXML.replace(/<sheetData[^>]*>[\s\S]*?<\/sheetData>/, newSheetData);
```

### Etkilenecek dosyalar

- `report-engine.js` (yalnızca `processInlineStrings` fonksiyonu — ~70 satır refactor)

### CWS uyumluluğu

Sıfır risk. Sadece XML string manipülasyonu, yeni izin yok, external script yok.

### Edge case'ler

- **Lines verisi boş ise (0 kayıt):** Block tamamen silinir, sonrası `blockSize` kadar yukarı kayar.
- **Template'te birden fazla satır (multi-row template):** Her line için tüm template rows kopyalanır (mevcut davranış korunur).
- **Block hiç bulunamazsa:** Sheet olduğu gibi kalır, sadece header `{{X}}` replace edilir.
- **r= attribute olmayan eski rows:** Regex match etmez, ihmal edilir (openpyxl her zaman ekler — IFS şablonları için sorun olmamalı).

### Done criteria

- [ ] `report-engine.js:263` `processInlineStrings` refactor edildi.
- [ ] Mevcut `SatinalmaTalebi-Sablon.xlsx` ile "Excel İndir" sonucunda **9 satır** görünüyor (önceki: 1).
- [ ] Block sonrası footer (`{{NOW}} ile oluşturuldu`) **doğru row'da** ve **doğru içerikle** render ediliyor.
- [ ] Shared-strings code path (mevcut iyi çalışan kısım) regresyon yok.
- [ ] `dev` branch'e tek commit.
- [ ] `TODO.md` ve `CURRENTJOB.md` güncellendi.

### Test akışı

1. `chrome://extensions/` → Ahtapot → Yeniden Yükle
2. Popup → "📤 Şablon Yükle" → şablon hâlâ yüklü, gerek yok (storage)
3. Yüklü şablonu seç → Header: PurchaseRequisitionSet → Block: LINES = PartRequisitionLines
4. "📊 Excel İndir"
5. Açılan xlsx'te tablo bölümünü kontrol et: 9 satır olmalı, sıra sütunu 1..9 (`LineNo`)
6. Footer ("Ahtapot ile {{NOW}}...") en altta, doğru tarihte

---

*Bu dosya, görev tamamlandığında bir sonraki TODO maddesinin (F-03 — ortak filtre modülü) içeriğiyle değiştirilir.*
