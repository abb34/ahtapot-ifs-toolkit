# 🐙 Ahtapot — IFS Cloud Toolkit

**IFS Cloud Aurena için danışman araç seti. Chrome eklentisi.**

> Excel rapor, ortam etiketi, çapraz kopyala, sticky notlar, veri analizi.

---

## 🚀 Özellikler

### 📊 Excel Rapor
- IFS sayfasındaki verileri otomatik yakalar (fetch/XHR intercept)
- Kendi Excel şablonunu yükle, `{{FieldName}}` etiketleriyle doldur
- `{{#LINES}}...{{/LINES}}` bloğu ile satır verileri otomatik çoğaltılır
- Birden fazla blok desteği — `{{#APPROVALS}}`, `{{#CHARGES}}` vs.
- Excel ve HTML/PDF çıktısı

### 🏷️ Ortam Etiketi
- UAT, PROD, TEST ortamlarına renk ve ikon ata
- Sayfanın üstünde renkli banner göster — yanlış ortamda çalışmayı önle

### 🔄 Çapraz Kopyala
- Bir ortamdaki veriyi başka ortama kopyala
- Çakışma stratejisi: atla / güncelle / hata ver

### 📌 Sticky Notlar
- URL bazlı notlar — her IFS sayfasına özel
- Renkli, sürüklenebilir

### 📈 Analiz
- Yakalanan veriler üzerinde Group By + metrik (SUM/COUNT/AVG/MIN/MAX)
- Excel export

### ⚙️ Ayarlar
- 🇹🇷 Türkçe / 🇺🇸 English / 🇮🇹 Italiano dil desteği
- Versiyon bilgisi

---

## 📦 Kurulum

### Chrome Web Store (önerilen)
> Yakında yayınlanacak

### Manuel (Geliştirici Modu)
1. Bu repoyu zip olarak indir veya `git clone` yap
2. Chrome'da `chrome://extensions/` sayfasını aç
3. Sağ üstte **"Geliştirici modu"**nu aç
4. **"Paketlenmemiş öğe yükle"** → `extension/` klasörünü seç

---

## 📄 Şablon Kullanımı

Kendi Excel şablonunu oluştur:

```
{{OrderNo}}          → Sipariş numarası
{{VendorName}}       → Tedarikçi adı
{{TODAY}}            → Bugünün tarihi
{{ENV}}              → IFS ortam adı

{{#LINES}}
  {{LineNo}}         → Satır numarası (her satır için tekrar)
  {{PartNo}}         → Parça numarası
  {{Description}}    → Açıklama
  {{BuyQtyDue}}      → Miktar
{{/LINES}}
```

**Örnek şablon indirme:** Popup → Rapor → Header/Blok entity seç → Örnek İndir

---

## 🛡️ Gizlilik

Bu eklenti hiçbir veriyi dış sunucuya göndermez. Tüm veriler yerel Chrome storage'da tutulur. → [Privacy Policy](https://github.com/abb34/ahtapot-ifs-toolkit/blob/main/privacy-policy.html)

---

## 📋 Gereksinimler

- Chrome 103+
- IFS Cloud Aurena (herhangi bir versiyon)

---

## 🤝 Katkı

Issue ve PR'lar hoş karşılanır.

---

<p align="center">Made with 🐙 by <strong>Ali Birkan Binel</strong></p>
