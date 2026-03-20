# 🐙 Ahtapot — ERP Toolkit

> **TR** · Bulut ERP sistemleri için danışman ve kullanıcı araç seti  
> **EN** · Consultant & user toolkit for cloud ERP systems

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-v1.0.1-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

---

## 🇹🇷 Türkçe

### Nedir?

Ahtapot, bulut ERP sistemlerinde çalışan danışmanlar ve son kullanıcılar için geliştirilmiş bir Chrome eklentisidir. Sayfayı terk etmeden Excel raporu oluştur, ortam etiketini gör, çapraz kopyalama yap, sticky notlar bırak.

### Özellikler

| Özellik | Açıklama |
|--------|----------|
| 📊 **Excel Rapor** | Özel şablonlarla tek tıkla `.xlsx` raporu indir |
| 🏷️ **Ortam Etiketi** | Test / Prod / Staging ortamını renkli banner ile ayırt et |
| 📋 **Çapraz Kopyalama** | Farklı ortamlar arasında kayıt kopyala |
| 📌 **Sticky Notlar** | Sayfa bazlı yapışkan not bırak, sürükle, düzenle |
| 🔍 **Veri Analizi** | Yakalanan ERP verisini anlık analiz et |
| ⚡ **Hızlı Rapor** | Widget üzerinden kayıtlı şablonu tek tıkla çalıştır |

### Kurulum

1. [Chrome Web Store](https://chromewebstore.google.com)'dan **Ahtapot — ERP Toolkit** eklentisini yükle
2. ERP sisteminizin açık olduğu sekmede 🐙 ikonuna tıkla
3. Şablon yüklemek için eklenti popup'ını kullan

### Şablon Nasıl Hazırlanır?

1. Popup → **Şablon** sekmesi → **Örnek İndir**
2. İndirilen `.xlsx` dosyasını Excel'de aç ve düzenle
3. Placeholder'lar: `{{AlanAdı}}` formatında
4. Düzenlenmiş dosyayı **Şablon Yükle** ile kaydet

### Gizlilik

- Hiçbir veri dışarıya gönderilmez
- Tüm veriler tarayıcınızın local storage'ında tutulur
- Eklenti yalnızca aktif sekmedeki ERP verisini okur

---

## 🇬🇧 English

### What is it?

Ahtapot is a Chrome extension built for consultants and end users working on cloud ERP systems. Generate Excel reports, identify environments, cross-copy records, and leave sticky notes — all without leaving the page.

### Features

| Feature | Description |
|---------|-------------|
| 📊 **Excel Reports** | Download `.xlsx` reports in one click using custom templates |
| 🏷️ **Environment Labels** | Distinguish Test / Prod / Staging with color-coded banners |
| 📋 **Cross-Copy** | Copy records between different environments |
| 📌 **Sticky Notes** | Leave page-specific notes, drag and edit them |
| 🔍 **Data Analysis** | Instantly analyze captured ERP data |
| ⚡ **Quick Report** | Run saved templates directly from the widget |

### Installation

1. Install **Ahtapot — ERP Toolkit** from the [Chrome Web Store](https://chromewebstore.google.com)
2. Open your ERP system and click the 🐙 icon
3. Use the extension popup to upload report templates

### How to Prepare a Template

1. Popup → **Template** tab → **Download Sample**
2. Open the downloaded `.xlsx` in Excel and customize it
3. Use `{{FieldName}}` format for placeholders
4. Upload your customized file via **Upload Template**

### Privacy

- No data is sent to any external server
- All data is stored in your browser's local storage
- The extension only reads ERP data from the active tab

---

## 🛠️ Technical Details

- **Manifest Version:** 3
- **Minimum Chrome:** 111
- **Permissions:** `activeTab`, `storage`, `tabs`
- **Content Scripts:** Runs in `MAIN` world for fetch/XHR interception

## 📁 File Structure

```
ahtapot/
├── manifest.json        # Extension manifest (MV3)
├── background.js        # Service worker — cache & message hub
├── content.js           # Content script — UI injection & bridge
├── injector.js          # MAIN world — fetch/XHR override
├── widget.js            # MAIN world — floating widget
├── popup.html           # Extension popup UI
├── popup.js             # Popup logic
├── popup-bundle.js      # Bundled report engine + popup
├── report-engine.js     # Excel template engine
├── xlsxwriter.js        # Pure-JS XLSX writer
├── content.css          # Content script styles
└── icons/               # Extension icons
```

## 📄 License

MIT © 2025 — [abb34](https://github.com/abb34)
