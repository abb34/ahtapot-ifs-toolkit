// Minimal XLSX Writer — harici kütüphane gerektirmez
// Basit hücre yazma, stil yok ama veri sağlam çıkar
// Global: window.XLSXWriter

(function(global) {
  'use strict';

  // Base64 encode
  function b64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  // Hücre koordinatı: (row=1, col=1) → "A1"
  function cellRef(row, col) {
    let c = '';
    let n = col;
    while (n > 0) {
      n--;
      c = String.fromCharCode(65 + (n % 26)) + c;
      n = Math.floor(n / 26);
    }
    return c + row;
  }

  // Değeri XML-safe stringe çevir
  function escXML(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Tek worksheet'li workbook oluştur
  // rows: [ [val, val, ...], ... ]
  // headers: [string, ...]
  function buildXLSX(headers, rows) {
    const allRows = [headers, ...rows];
    const sharedStrings = [];
    const ssIndex = {};

    function getSI(val) {
      const s = String(val === null || val === undefined ? '' : val);
      if (ssIndex[s] === undefined) {
        ssIndex[s] = sharedStrings.length;
        sharedStrings.push(s);
      }
      return ssIndex[s];
    }

    // Worksheet XML
    let wsXML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    wsXML += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    wsXML += ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n';
    wsXML += '<sheetData>\n';

    allRows.forEach((row, ri) => {
      const rowNum = ri + 1;
      wsXML += `<row r="${rowNum}">`;
      (row || []).forEach((val, ci) => {
        const ref = cellRef(rowNum, ci + 1);
        if (val === null || val === undefined || val === '') {
          wsXML += `<c r="${ref}"/>`;
        } else if (typeof val === 'number') {
          wsXML += `<c r="${ref}" t="n"><v>${val}</v></c>`;
        } else {
          const si = getSI(val);
          wsXML += `<c r="${ref}" t="s"><v>${si}</v></c>`;
        }
      });
      wsXML += '</row>\n';
    });

    wsXML += '</sheetData>\n</worksheet>';

    // Shared Strings XML
    let ssXML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    ssXML += `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">`;
    sharedStrings.forEach(s => {
      ssXML += `<si><t xml:space="preserve">${escXML(s)}</t></si>`;
    });
    ssXML += '</sst>';

    // Workbook XML
    const wbXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Veri" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

    // Relationships
    const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

    return {
      '[Content_Types].xml': contentTypes,
      '_rels/.rels': rootRels,
      'xl/workbook.xml': wbXML,
      'xl/_rels/workbook.xml.rels': wbRels,
      'xl/worksheets/sheet1.xml': wsXML,
      'xl/sharedStrings.xml': ssXML,
    };
  }

  // ZIP oluştur (pure JS, deflate yok — stored)
  function makeZip(files) {
    const enc = new TextEncoder();
    const parts = [];
    const centralDir = [];
    let offset = 0;

    Object.entries(files).forEach(([name, content]) => {
      const nameBytes = enc.encode(name);
      const dataBytes = enc.encode(content);
      const crc = crc32(dataBytes);
      const now = dosDateTime();

      // Local file header
      const local = new Uint8Array(30 + nameBytes.length + dataBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);  // signature
      lv.setUint16(4, 20, true);            // version needed
      lv.setUint16(6, 0, true);             // flags
      lv.setUint16(8, 0, true);             // compression: stored
      lv.setUint16(10, now.time, true);
      lv.setUint16(12, now.date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, dataBytes.length, true); // compressed
      lv.setUint32(22, dataBytes.length, true); // uncompressed
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      local.set(dataBytes, 30 + nameBytes.length);

      // Central dir entry
      const cd = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, now.time, true);
      cv.setUint16(14, now.date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, dataBytes.length, true);
      cv.setUint32(24, dataBytes.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      cd.set(nameBytes, 46);

      parts.push(local);
      centralDir.push(cd);
      offset += local.length;
    });

    const cdData = concat(centralDir);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, centralDir.length, true);
    ev.setUint16(10, centralDir.length, true);
    ev.setUint32(12, cdData.length, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return concat([...parts, cdData, eocd]);
  }

  function concat(arrays) {
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    arrays.forEach(a => { out.set(a, pos); pos += a.length; });
    return out;
  }

  function dosDateTime() {
    const d = new Date();
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    return { date, time };
  }

  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // Public API
  global.XLSXWriter = {
    // headers: string[], rows: any[][]
    // returns: Uint8Array (xlsx binary)
    write: function(headers, rows) {
      const files = buildXLSX(headers, rows);
      return makeZip(files);
    },

    // Blob olarak indir
    download: function(headers, rows, filename) {
      const data = this.write(headers, rows);
      const blob = new Blob([data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'export.xlsx';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

})(window);
