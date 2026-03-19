// ═══ xlsxwriter.js ═══
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

// ═══ report-engine.js ═══
// IFS Cloud Toolkit — report-engine.js v3
// Şablon tabanlı Excel rapor motoru

const ReportEngine = (() => {

  // ── Sabit değerler ──────────────────────────────────────
  const META = new Set(['@odata.etag','luname','keyref','Objgrants',
    'Objstate','Objkey','ParentObjkey','Objid','Objversion']);

  function sysVals() {
    const d = new Date();
    return {
      TODAY: d.toLocaleDateString('tr-TR'),
      NOW:   d.toLocaleString('tr-TR'),
      ENV:   typeof window !== 'undefined' ? window.location.hostname : '',
      YEAR:  String(d.getFullYear()),
      MONTH: String(d.getMonth()+1).padStart(2,'0'),
      DAY:   String(d.getDate()).padStart(2,'0'),
    };
  }

  // ── XML yardımcıları ────────────────────────────────────
  function esc(s) {
    return String(s==null?'':s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Shared Strings ──────────────────────────────────────
  function parseSharedStrings(xml) {
    if (!xml) return [];
    const out = [];
    const re = /<si>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      // <t> veya birden fazla <t> (rich text) birleştir
      const inner = m[1];
      let text = '';
      const tr = /<t[^>]*>([\s\S]*?)<\/t>/g;
      let tm;
      while ((tm = tr.exec(inner)) !== null) {
        text += tm[1];
      }
      out.push(text
        .replace(/&amp;/g,'&').replace(/&lt;/g,'<')
        .replace(/&gt;/g,'>').replace(/&quot;/g,'"')
        .replace(/&apos;/g,"'"));
    }
    return out;
  }

  function buildSharedStrings(strings) {
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    x += `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">`;
    strings.forEach(s => { x += `<si><t xml:space="preserve">${esc(s)}</t></si>`; });
    return x + '</sst>';
  }


  // ── Async ZIP parser (deflate destekli) ─────────────────
  async function parseZipAsync(bytes) {
    const files = {};
    const dec = new TextDecoder('utf-8');
    let i = 0;
    while (i < bytes.length - 4) {
      if (readU32(bytes,i) === 0x04034b50) {
        const comp  = readU16(bytes,i+8);
        const csz   = readU32(bytes,i+18);
        const ucsz  = readU32(bytes,i+22);
        const fnLen = readU16(bytes,i+26);
        const exLen = readU16(bytes,i+28);
        const name  = dec.decode(bytes.slice(i+30, i+30+fnLen));
        const start2 = i+30+fnLen+exLen;
        const compData = bytes.slice(start2, start2+csz);

        if (comp === 0) {
          try { files[name] = dec.decode(compData); }
          catch(e) { files[name] = ''; }
        } else if (comp === 8) {
          try {
            const ds = new DecompressionStream('deflate-raw');
            const writer = ds.writable.getWriter();
            const reader = ds.readable.getReader();
            writer.write(compData);
            writer.close();
            const chunks = [];
            while (true) {
              const {done, value} = await reader.read();
              if (done) break;
              chunks.push(value);
            }
            const total = chunks.reduce((s,c) => s+c.length, 0);
            const out = new Uint8Array(total);
            let off = 0;
            chunks.forEach(c => { out.set(c, off); off += c.length; });
            files[name] = dec.decode(out);
          } catch(e) {
            files[name] = null;
          }
        }
        i = start2 + csz;
      } else if (readU32(bytes,i)===0x02014b50 || readU32(bytes,i)===0x06054b50) {
        break;
      } else { i++; }
    }
    return Object.keys(files).length ? files : null;
  }

  // ── ZIP parser (stored + deflate) ──────────────────────
  function parseZip(bytes) {
    const files = {};
    const dec = new TextDecoder('utf-8');
    let i = 0;
    while (i < bytes.length - 4) {
      if (readU32(bytes,i) === 0x04034b50) {
        const comp   = readU16(bytes,i+8);
        const csz    = readU32(bytes,i+18);
        const ucsz   = readU32(bytes,i+22);
        const fnLen  = readU16(bytes,i+26);
        const exLen  = readU16(bytes,i+28);
        const name   = dec.decode(bytes.slice(i+30, i+30+fnLen));
        const start2 = i+30+fnLen+exLen;
        const compData = bytes.slice(start2, start2+csz);

        if (comp === 0) {
          // Stored
          try { files[name] = dec.decode(compData); }
          catch(e) { files[name] = ''; }
        } else if (comp === 8) {
          // Deflate — pako veya raw inflate ile çöz
          try {
            // Tarayıcıda DecompressionStream API var
            // Sync çözüm: raw deflate manual
            const inflated = rawInflate(compData, ucsz);
            files[name] = dec.decode(inflated);
          } catch(e) {
            files[name] = null;
          }
        }
        i = start2 + csz;
      } else if (readU32(bytes,i)===0x02014b50 || readU32(bytes,i)===0x06054b50) {
        break;
      } else { i++; }
    }
    return Object.keys(files).length ? files : null;
  }

  // ── Minimal raw DEFLATE inflate ─────────────────────────
  // Yalnızca stored blocks (BTYPE=00) ve fixed huffman (BTYPE=01) destekli
  // xlsx dosyaları için yeterli
  function rawInflate(input, expectedSize) {
    // DecompressionStream API kullan (modern tarayıcılarda var)
    // Sync wrapper için TextDecoder trick
    // Alternatif: pako kütüphanesi yoksa basit implementasyon

    // "deflate-raw" stream (Chrome 103+)
    if (typeof DecompressionStream !== 'undefined') {
      // Sync değil ama parseZip'i async yapamayız kolayca
      // Bunun yerine: şimdilik null dön, async path için ayrı fonksiyon
      throw new Error('deflate-async-needed');
    }
    throw new Error('deflate-not-supported');
  }

  function readU32(b,o){ return (b[o]|(b[o+1]<<8)|(b[o+2]<<16)|(b[o+3]<<24))>>>0; }
  function readU16(b,o){ return b[o]|(b[o+1]<<8); }

  // ── ZIP builder ─────────────────────────────────────────
  function buildZip(files) {
    const enc = new TextEncoder();
    const parts=[], cds=[];
    let off=0;

    function crc32(buf) {
      let c=0xFFFFFFFF;
      for(let i=0;i<buf.length;i++){
        c^=buf[i];
        for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
      }
      return (c^0xFFFFFFFF)>>>0;
    }

    const now = new Date();
    const dt = ((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
    const tm = (now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1);

    Object.entries(files).forEach(([name, content]) => {
      if (content === null) return; // deflated dosyayı atla (bu olmayacak)
      const nb = enc.encode(name);
      const db = typeof content === 'string' ? enc.encode(content) : content;
      const crc = crc32(db);

      const lh = new Uint8Array(30+nb.length+db.length);
      const lv = new DataView(lh.buffer);
      lv.setUint32(0,0x04034b50,true); lv.setUint16(4,20,true);
      lv.setUint16(6,0,true); lv.setUint16(8,0,true);
      lv.setUint16(10,tm,true); lv.setUint16(12,dt,true);
      lv.setUint32(14,crc,true);
      lv.setUint32(18,db.length,true); lv.setUint32(22,db.length,true);
      lv.setUint16(26,nb.length,true); lv.setUint16(28,0,true);
      lh.set(nb,30); lh.set(db,30+nb.length);

      const cd = new Uint8Array(46+nb.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0,0x02014b50,true); cv.setUint16(4,20,true); cv.setUint16(6,20,true);
      cv.setUint16(8,0,true); cv.setUint16(10,0,true);
      cv.setUint16(12,tm,true); cv.setUint16(14,dt,true);
      cv.setUint32(16,crc,true);
      cv.setUint32(20,db.length,true); cv.setUint32(24,db.length,true);
      cv.setUint16(28,nb.length,true);
      cv.setUint16(30,0,true); cv.setUint16(32,0,true);
      cv.setUint16(34,0,true); cv.setUint16(36,0,true);
      cv.setUint32(38,0,true); cv.setUint32(42,off,true);
      cd.set(nb,46);

      parts.push(lh); cds.push(cd);
      off += lh.length;
    });

    const cdTotal = cds.reduce((s,a)=>s+a.length,0);
    const allParts = [...parts,...cds];
    const total = allParts.reduce((s,a)=>s+a.length,0);
    const out = new Uint8Array(total+22);
    let pos=0;
    allParts.forEach(a=>{ out.set(a,pos); pos+=a.length; });
    const ev = new DataView(out.buffer,pos);
    ev.setUint32(0,0x06054b50,true); ev.setUint16(4,0,true); ev.setUint16(6,0,true);
    ev.setUint16(8,cds.length,true); ev.setUint16(10,cds.length,true);
    ev.setUint32(12,cdTotal,true); ev.setUint32(16,off,true); ev.setUint16(20,0,true);
    return out;
  }

  // ── Şablondaki satır numaralarını parse et ──────────────
  // sheet.xml'den her satırın içeriğini çıkar: [{rowNum, cells:[{col,si}]}]
  function parseSheetRows(sheetXML) {
    const rows = [];
    const rowRe = /<row\s+r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
    let rm;
    while ((rm = rowRe.exec(sheetXML)) !== null) {
      const rowNum = parseInt(rm[1]);
      const rowBody = rm[2];
      const cells = [];
      const cellRe = /<c\s+r="([A-Z]+\d+)"[^>]*>([\s\S]*?)<\/c>/g;
      let cm;
      while ((cm = cellRe.exec(rowBody)) !== null) {
        const ref = cm[1];
        const col = ref.replace(/\d/g,'');
        const inner = cm[2];
        // Sadece shared string hücreleri ilgilendiriyor (t="s")
        const tAttr = cm[0].match(/t="([^"]+)"/);
        const vMatch = inner.match(/<v>(\d+)<\/v>/);
        if (tAttr && tAttr[1]==='s' && vMatch) {
          cells.push({ ref, col, si: parseInt(vMatch[1]) });
        }
      }
      rows.push({ rowNum, cells, raw: rm[0] });
    }
    return rows;
  }


  // Inline string şablonları işle (openpyxl varsayılan formatı)
  async function processInlineStrings(zip, sheetKey, headerData, lineRecords, blockName, allBlocks) {
    allBlocks = allBlocks || { [blockName || 'LINES']: lineRecords };
    let sheetXML = zip[sheetKey];
    const block = blockName || 'LINES';
    const startMarker = '{{#' + block + '}}';
    const endMarker = '{{/' + block + '}}';

    // Satırları parse et
    const rowRe = /<row[\s][^>]*>[\s\S]*?<\/row>/g;
    const allRows = [];
    let m;
    while ((m = rowRe.exec(sheetXML)) !== null) {
      allRows.push({ xml: m[0] });
    }
    // 1. ÖNCE Lines bloğunu bul (marker'lar henüz işlenmedi)
    let startIdx = -1, endIdx = -1;
    allRows.forEach((row, i) => {
      if (row.xml.includes(startMarker)) startIdx = i;
      if (row.xml.includes(endMarker)) endIdx = i;
    });

    // 2. Lines bloğunu genişlet
    if (startIdx >= 0 && endIdx > startIdx && lineRecords && lineRecords.length > 0) {
      const templateRows = allRows.slice(startIdx + 1, endIdx);
      let insertedXML = '';

      lineRecords.forEach(lineRec => {
        templateRows.forEach(tRow => {
          // Template satırındaki etiketleri line verisiyle doldur
          const filled = tRow.xml.replace(/\{\{([A-Za-z0-9_@]+)\}\}/g, (_, field) => {
            const v = lineRec[field];
            return (v !== undefined && v !== null) ? esc(String(v)) : '';
          });
          insertedXML += filled;
        });
      });

      // Marker + template satırlarını kaldır, yerine doldurulmuş satırları koy
      const removeSet = new Set([startIdx, endIdx, ...templateRows.map((_, i) => startIdx + 1 + i)]);
      const prevRow = startIdx > 0 ? allRows[startIdx - 1] : null;

      removeSet.forEach(i => { sheetXML = sheetXML.replace(allRows[i].xml, ''); });

      if (prevRow) {
        sheetXML = sheetXML.replace(prevRow.xml, prevRow.xml + insertedXML);
      } else {
        sheetXML = sheetXML.replace('<sheetData>', '<sheetData>' + insertedXML);
      }
    } else if (startIdx >= 0) {
      // Lines verisi yoksa marker satırlarını kaldır
      [startIdx, endIdx].filter(i => i >= 0).forEach(i => {
        sheetXML = sheetXML.replace(allRows[i].xml, '');
      });
    }

    // 3. Header replace — Lines işlendikten sonra
    sheetXML = sheetXML.replace(/\{\{([A-Za-z0-9_@]+)\}\}/g, (_, field) => {
      const v = headerData[field];
      return (v !== undefined && v !== null) ? esc(String(v)) : '';
    });

    zip[sheetKey] = sheetXML;
    return buildZip(zip);
  }

  // ── Şablon tabanlı rapor oluştur ─────────────────────────
  async function generateFromTemplate(templateBuffer, headerData, lineRecordsOrBlocks, blockName) {
    // lineRecordsOrBlocks: array (eski) veya {LINES:[...], APPROVALS:[...]} (yeni)
    const allBlocks = Array.isArray(lineRecordsOrBlocks)
      ? { [blockName || 'LINES']: lineRecordsOrBlocks }
      : (lineRecordsOrBlocks || {});
    const lineRecords = allBlocks[blockName || 'LINES'] || [];
    const zip = await parseZipAsync(new Uint8Array(templateBuffer));
    if (!zip) return generateSimple(headerData, lineRecords);

    const sheetKey = Object.keys(zip).find(k => k.match(/xl\/worksheets\/sheet\d*.xml/i));
    if (!sheetKey || !zip[sheetKey]) return generateSimple(headerData, lineRecords);

    // Inline string desteği: sharedStrings yoksa sheet XML'deki <v> değerlerini direkt replace et
    const hasSharedStrings = !!zip['xl/sharedStrings.xml'];


    if (!hasSharedStrings) {
      return await processInlineStrings(zip, sheetKey, headerData, lineRecords, blockName);
    }

    // Shared strings
    const strings = parseSharedStrings(zip['xl/sharedStrings.xml'] || '');
    const newStrings = [...strings]; // kopyala, extend edeceğiz

    // ── 1. Header replace ─────────────────────────────────
    // Tüm string'lerde {{Field}} → değer
    for (let i = 0; i < newStrings.length; i++) {
      if (!newStrings[i].includes('{{')) continue;
      newStrings[i] = newStrings[i].replace(/\{\{([A-Za-z0-9_@]+)\}\}/g, (_, f) => {
        const v = headerData[f];
        return (v !== undefined && v !== null) ? String(v) : '';
      });
    }

    // ── 2. Lines bloğunu bul ve genişlet ──────────────────
    // Şablonda {{#LINES}} ve {{/LINES}} etiketlerini içeren satırları bul
    let sheetXML = zip[sheetKey];

    if (lineRecords && lineRecords.length > 0) {
      // String index'leri bul
      const blockStartIdx = newStrings.findIndex(s => s.trim() === '{{#LINES}}' || s.trim() === ('{{#' + (blockName||'LINES') + '}}'));
      const blockEndIdx   = newStrings.findIndex(s => s.trim() === '{{/LINES}}' || s.trim() === ('{{/' + (blockName||'LINES') + '}}'));

      if (blockStartIdx >= 0 && blockEndIdx >= 0) {
        // Sheet'teki satır numaralarını bul
        const rows = parseSheetRows(sheetXML);

        // Hangi sheet satırı bu string'leri içeriyor?
        let startRowNum = -1, endRowNum = -1;
        let templateRowNums = []; // {{#LINES}} ile {{/LINES}} arasındaki satırlar

        rows.forEach(row => {
          row.cells.forEach(cell => {
            if (cell.si === blockStartIdx) startRowNum = row.rowNum;
            if (cell.si === blockEndIdx)   endRowNum   = row.rowNum;
          });
        });

        if (startRowNum > 0 && endRowNum > startRowNum) {
          // Template satırları: başlangıç+1 ile bitiş-1 arası
          templateRowNums = rows
            .filter(r => r.rowNum > startRowNum && r.rowNum < endRowNum)
            .map(r => r.rowNum);

          // Her template satırı için line kayıtları kadar yeni satır oluştur
          let insertXML = '';
          let currentRowNum = startRowNum; // {{#LINES}} satırından sonra ekle

          lineRecords.forEach((lineRec, lineIdx) => {
            templateRowNums.forEach((tRowNum, tIdx) => {
              const tRow = rows.find(r => r.rowNum === tRowNum);
              if (!tRow) return;

              const newRowNum = startRowNum + 1 + lineIdx * templateRowNums.length + tIdx;

              // Yeni satır XML'i oluştur
              let newRowXML = '<row r="' + newRowNum + '">';
              tRow.cells.forEach(cell => {
                const tmplStr = strings[cell.si]; // orijinal string
                // {{Field}} replace
                const replaced = tmplStr.replace(/\{\{([A-Za-z0-9_@]+)\}\}/g, (_, f) => {
                  const v = lineRec[f];
                  return (v !== undefined && v !== null) ? String(v) : '';
                });
                // Yeni string index al veya ekle
                let newSI = newStrings.indexOf(replaced);
                if (newSI < 0) { newSI = newStrings.length; newStrings.push(replaced); }
                const newRef = cell.col + newRowNum;
                newRowXML += '<c r="' + newRef + '" t="s"><v>' + newSI + '</v></c>';
              });
              newRowXML += '</row>';
              insertXML += newRowXML;
            });
          });

          // Sheet XML'ini değiştir:
          // 1. {{#LINES}} satırını sil
          // 2. Template satırlarını sil
          // 3. {{/LINES}} satırını sil
          // 4. Yerine genişletilmiş satırları koy
          const removeRows = [startRowNum, ...templateRowNums, endRowNum];
          removeRows.forEach(rn => {
            const row = rows.find(r => r.rowNum === rn);
            if (row) sheetXML = sheetXML.replace(row.raw, '');
          });

          // Bir önceki satırın arkasına ekle
          const prevRow = rows.find(r => r.rowNum === startRowNum - 1);
          if (prevRow) {
            sheetXML = sheetXML.replace(prevRow.raw, prevRow.raw + insertXML);
          } else {
            // Bulamazsa sheetData'nın başına ekle
            sheetXML = sheetXML.replace('<sheetData>', '<sheetData>' + insertXML);
          }
        }
      }
    }

    // ── 3. Kalan {{...}} işaretlerini temizle ─────────────
    for (let i = 0; i < newStrings.length; i++) {
      newStrings[i] = newStrings[i].replace(/\{\{[^}]*\}\}/g, '');
    }

    // ── 4. Güncellenmiş dosyaları yaz ─────────────────────
    zip[sheetKey] = sheetXML;
    zip['xl/sharedStrings.xml'] = buildSharedStrings(newStrings);

    return buildZip(zip);
  }

  // ── Template olmadan basit export ───────────────────────
  function generateSimple(headerData, lineData) {
    const hFields = Object.keys(headerData).filter(k => !META.has(k) && !k.startsWith('@'));
    const lFields = lineData && lineData.length
      ? Object.keys(lineData[0]).filter(k => !META.has(k) && !k.startsWith('@'))
      : [];

    const rows = [];
    hFields.forEach(f => rows.push([f, headerData[f] ?? '']));
    rows.push(['','']);
    if (lFields.length) {
      rows.push(lFields);
      lineData.forEach(r => rows.push(lFields.map(f => r[f] ?? '')));
    }
    return window.XLSXWriter.write(['Alan','Değer'], rows);
  }

  // ── Ana giriş noktası ────────────────────────────────────
  async function generateReport(options) {
    const { headerData, lineData, blockName, envName, templateBuffer, blockData } = options;
    const all = Object.assign({}, sysVals(), headerData);

    if (templateBuffer) {
      // blockData varsa çoklu blok, yoksa tek blok
      const blocks = blockData || {};
      if (lineData && lineData.length && blockName && !blocks[blockName]) {
        blocks[blockName] = lineData;
      }
      return await generateFromTemplate(templateBuffer, all, blocks, blockName || 'LINES');
    }
    return generateSimple(all, lineData || []);
  }

  // ── Örnek şablon ────────────────────────────────────────
  async function generateSampleTemplate(entitySummaries) {
    function isMeta(f) {
      if (META.has(f)) return true;
      if (f.startsWith('@')) return true;
      if (f.includes('@')) return true;          // AddrFlag@odata.type gibi
      if (f.includes('_aggr_')) return true;
      if (f.endsWith('navigationLink')) return true;
      if (f.endsWith('@odata.type')) return true;
      return false;
    }

    const mainEnt = entitySummaries.find(e =>
      !e.entity.toLowerCase().includes('line') &&
      !e.entity.toLowerCase().includes('row') &&
      !e.entity.toLowerCase().includes('part')
    ) || entitySummaries[0];

    const lineEnt = entitySummaries.find(e => e !== mainEnt);

    const hFields = mainEnt ? (mainEnt.fields||[]).filter(f=>!isMeta(f)) : [];
    const lFields = lineEnt ? (lineEnt.fields||[]).filter(f=>!isMeta(f)) : [];

    const hdrs = ['Alan Adı','Şablon Etiketi','Örnek Değer','Açıklama'];
    const rows = [];

    rows.push(['─── SİSTEM ───','','','Otomatik doldurulur']);
    rows.push(['Bugün','{{TODAY}}', new Date().toLocaleDateString('tr-TR'),'Rapor tarihi']);
    rows.push(['Şu An','{{NOW}}',   new Date().toLocaleString('tr-TR'),'Rapor zamanı']);
    rows.push(['Ortam','{{ENV}}',   typeof window!=='undefined'?window.location.hostname:'','IFS ortamı']);
    rows.push(['','','','']);

    if (mainEnt && hFields.length) {
      rows.push(['─── '+mainEnt.entity+' (HEADER) ───','','','Ana kayıt alanları']);
      hFields.forEach(f => {
        const v = mainEnt.sampleRecord ? mainEnt.sampleRecord[f] : '';
        rows.push([f, '{{'+f+'}}', v==null?'':String(v), '']);
      });
      rows.push(['','','','']);
    }

    if (lineEnt && lFields.length) {
      rows.push(['─── '+lineEnt.entity+' (SATIRLAR) ───','','','Satır bloğu']);
      rows.push(['BLOK BAŞI','{{#LINES}}','','Bu satır satır bloğunun başlangıcını işaretler']);
      lFields.forEach(f => {
        const v = lineEnt.records&&lineEnt.records[0] ? lineEnt.records[0][f] : '';
        rows.push([f, '{{'+f+'}}', v==null?'':String(v), '']);
      });
      rows.push(['BLOK SONU','{{/LINES}}','','Bu satır satır bloğunun bitişini işaretler']);
      rows.push(['','','','']);
    }

    rows.push(['── KULLANIM ──','','','']);
    rows.push(['1. Bu dosyayı Excel\'de açın ve yeni bir sekme ekleyin','','','']);
    rows.push(['2. Şablon Etiketi sütunundaki {{...}} ifadelerini','','','']);
    rows.push(['   raporunuzda istediğiniz hücrelere yerleştirin','','','']);
    rows.push(['3. BLOK BAŞI ve BLOK SONU etiketleri satır tablosu için','','','']);
    rows.push(['   tablo şablonunuzun üstüne ve altına koyun','','','']);
    rows.push(['4. Dosyayı kaydedin ve Şablon Yükle ile yükleyin','','','']);

    return window.XLSXWriter.write(hdrs, rows);
  }

  // ── Şablon analizi ───────────────────────────────────────
  async function analyzeTemplate(templateBuffer) {
    try {
      const zip = parseZip(new Uint8Array(templateBuffer));
      if (!zip) return { headerPlaceholders:[], blocks:[] };

      const hPH = new Set();
      const blocks = {};

      // Hem shared strings hem inline strings destekle
      let allTexts = [];

      if (zip['xl/sharedStrings.xml']) {
        allTexts = parseSharedStrings(zip['xl/sharedStrings.xml']);
      }

      // Inline strings: sheet XML'inden direkt çıkar
      const sheetKey = Object.keys(zip).find(k => k.match(/xl\/worksheets\/sheet\d*.xml/i));
      if (sheetKey && zip[sheetKey]) {
        const inlineTags = [...zip[sheetKey].matchAll(/<t[^>]*>([^<]*\{\{[^<]*)<\/t>/g)]
          .map(m => m[1]);
        allTexts = allTexts.concat(inlineTags);
      }

      allTexts.forEach(s => {
        if (!s || !s.includes('{{')) return;
        const trimmed = s.trim();
        if (/^\{\{#([A-Za-z0-9_]+)\}\}$/.test(trimmed)) {
          blocks[trimmed.replace(/\{\{#|\}\}/g,'')] = new Set();
          return;
        }
        if (/^\{\{\/([A-Za-z0-9_]+)\}\}$/.test(trimmed)) return;
        [...s.matchAll(/\{\{([A-Za-z0-9_@]+)\}\}/g)].forEach(m => hPH.add(m[1]));
      });

      return {
        headerPlaceholders: [...hPH],
        blocks: Object.keys(blocks).map(name => ({ name, placeholders:[] }))
      };
    } catch(e) {
      return { headerPlaceholders:[], blocks:[] };
    }
  }

  return { generateReport, generateSampleTemplate, analyzeTemplate };
})();

window.IFSReportEngine = ReportEngine;

// ═══ popup.js ═══
// XLSXWriter lokal dosyadan yüklü — CDN yok
function waitForExcelJS() {
  return Promise.resolve(); // xlsxwriter.js zaten popup.html'de yüklü
}

// IFS Cloud Toolkit — popup.js

// ─── SİSTEM ENTİTY FİLTRESİ ──────────────────────────────
const SYSTEM_ENTITY_PATTERNS = [
  /^GetAll/i, /^GetCurrent/i, /^GetBasic/i, /^GetProfile/i,
  /^GetTranslation/i, /^GetAttachment/i, /^IsUser/i,
  /^CompanyContext/i, /^ClientContext/i, /^AppearanceConfig/i,
  /^Translations$/i, /^UserProfile/i, /^Branding/i,
  /^GetCrm/i, /^GetPeoples/i, /^GetProject/i, /^GetParty/i,
  /^Active.*Set$/i, /^Fnd/i, /^Jt.*Set$/i, /^Jt.*Transaction/i,
  /Widget$/i, /WidgetHandling$/i, /^StreamSubscription/i,
  /^RecentFault/i, /^WorkTask/i, /^ProjectTime/i, /^PeoplesHub/i,
  // Aurena / Page Designer
  /^Baseline/i, /^PublishConfig/i, /^AurenaPage/i,
  // UserSettings servisi entity'leri
  /^CurrentPerson$/i, /^EnumerateLanguages$/i, /^GetTimezones$/i,
  /^Reference_LanguageCode$/i, /^GetLanguage/i,
  // Widget/document entity'leri
  /^DocActivity/i, /^RecentDoc/i, /^ActiveSeparates/i,
];
const SYSTEM_SERVICES = new Set([
  'appearanceconfiguration','frameworkservices','userprofileservice',
  'translations','clientcontext','systemservice','navigationservice',
  'getpartytypewidgetinfo','streamsubscriptions','crmaccountsearchwidgethandling',
  'crmcontactsearchwidgethandling','peopleshubwidgethandling',
  'projecttimereportingwidgethandling','worktasktimereportingwidgethandling',
  'recentfaultreportswidgethandling','aurenapagedesigner','usersettings',
  'recentdocumentswidgethandling','worktasktimereportingwidgethandling',
]);
function isSystemEntity(entity, service) {
  if (!entity) return false;
  if (SYSTEM_ENTITY_PATTERNS.some(p => p.test(entity))) return true;
  if (service && SYSTEM_SERVICES.has(service.toLowerCase())) return true;
  return false;
}


// ─── UTILS ────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `show ${type}`;
  setTimeout(() => t.className = '', 2400);
}

function addLog(msg, type = 'info', logId = 'report-log') {
  const box = document.getElementById(logId);
  if (!box) return;
  const time = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const line = document.createElement('div');
  line.className = `log-${type}`;
  line.textContent = `[${time}] ${msg}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getActiveTab() {
  // Önce currentWindow: true dene, sonra lastFocusedWindow: true
  let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs || !tabs.length) {
    tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  }
  return tabs && tabs[0] ? tabs[0] : null;
}

function sendMsg(msg) {
  return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));
}

async function sendToContent(msg) {
  const tab = await getActiveTab();
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tab.id, msg, resp => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(resp);
    });
  });
}

function downloadBlob(buffer, filename) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── NAV TABS ─────────────────────────────────────────────
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    const panelId = 'panel-' + tab.dataset.tab;
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.add('active');
  });
});

// ─── PAGE CONTEXT ─────────────────────────────────────────
let currentHostname = '';
let currentUrl = '';

async function detectPage() {
  const ctxEl = document.getElementById('page-context');
  const hnEl = document.getElementById('current-hostname');

  try {
    const tab = await getActiveTab();

    if (!tab || !tab.url) {
      if (ctxEl) ctxEl.textContent = 'Sekme bilgisi alınamadı';
      return;
    }

    currentUrl = tab.url;

    // System URL kontrolü
    if (currentUrl.startsWith('chrome://') ||
        currentUrl.startsWith('chrome-extension://') ||
        currentUrl.startsWith('about:') ||
        currentUrl.startsWith('edge://')) {
      if (ctxEl) ctxEl.textContent = 'IFS sayfası açın';
      return;
    }

    try {
      const urlObj = new URL(currentUrl);
      currentHostname = urlObj.hostname;

      // IFS sayfası mı?
      const isIFS = currentUrl.includes('ifsapplications') ||
                    currentUrl.includes('ifsworld') ||
                    currentUrl.includes('ifs.cloud') ||
                    currentUrl.includes('/main/');

      let context;
      if (isIFS) {
        const parts = urlObj.pathname.split('/').filter(Boolean);
        const last = parts[parts.length - 1] || '';
        context = 'IFS › ' + (last.slice(0, 28) || currentHostname);
      } else {
        context = currentHostname.slice(0, 35) || 'Bilinmeyen';
      }

      if (ctxEl) ctxEl.textContent = context;
      if (hnEl) hnEl.textContent = currentHostname;
      if (currentHostname) loadEnvConfig(currentHostname);

    } catch (e) {
      if (ctxEl) ctxEl.textContent = currentUrl.slice(0, 35);
    }

  } catch (e) {
    if (ctxEl) ctxEl.textContent = 'Hazır';
  }
}

// ─══════════════════════════════════════════════════════════
//  RAPOR PANELİ
// ══════════════════════════════════════════════════════════

let cacheData = []; // { entity, service, recordCount, fields, stale }
let selectedTemplate = null; // { name, entityHint, buffer, analysis }
let selectedTemplateIndex = null;

// Cache yenile
async function refreshCache() {
  const resp = await sendMsg({ type: 'GET_CACHE' });
  cacheData = resp?.cache || [];

  const badge = document.getElementById('cache-badge');
  const total = cacheData.reduce((s, e) => s + e.recordCount, 0);
  badge.textContent = `${cacheData.length} entity / ${total} kayıt`;

  renderEntityList();
  populateEntitySelects();
  updateBlockSelects();
}

// Sistem entity'lerini filtrele - kullanıcı verisi değil

function renderEntityList() {
  const container = document.getElementById('entity-list');

  if (!cacheData.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📡</div>Henüz veri yok — IFS sayfasında bir kayıt açın</div>';
    return;
  }

  const bizEntities = cacheData.filter(e => !isSystemEntity(e.entity, e.service));
  const sysEntities = cacheData.filter(e => isSystemEntity(e.entity, e.service));

  let html = '';

  bizEntities.forEach(e => {
    const idx = cacheData.indexOf(e);
    html += '<div class="entity-item" data-index="' + idx + '" style="border-left:2px solid var(--accent)">'
      + '<div><div class="entity-name" style="color:var(--accent)">' + e.entity + '</div>'
      + '<div class="entity-service">' + (e.service || '') + '</div></div>'
      + '<div style="display:flex;gap:6px;align-items:center">'
      + (e.stale ? '<span class="entity-stale">⚠ Eski</span>' : '')
      + '<span class="entity-count">' + e.recordCount + ' kayıt</span>'
      + '</div></div>';
  });

  if (sysEntities.length) {
    html += '<div style="font-size:10px;color:var(--muted);margin:6px 0 3px;letter-spacing:.5px">── Sistem (' + sysEntities.length + ') ──</div>';
    sysEntities.forEach(e => {
      const idx = cacheData.indexOf(e);
      html += '<div class="entity-item" data-index="' + idx + '" style="opacity:0.4">'
        + '<div><div class="entity-name" style="font-size:11px">' + e.entity + '</div>'
        + '<div class="entity-service">' + (e.service || '') + '</div></div>'
        + '<span class="entity-count">' + e.recordCount + ' kayıt</span>'
        + '</div>';
    });
  }

  container.innerHTML = html;
}


function populateEntitySelects() {
  const selects = ['header-entity-select', 'cross-entity-select'];

  // İş entity'leri — sistem olanları filtrele
  const bizEntities = cacheData.filter(e => !isSystemEntity(e.entity, e.service));

  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">-- Entity seç --</option>';

    // Sadece iş entity'lerini göster
    bizEntities.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.entity;
      opt.textContent = e.entity + ' (' + e.recordCount + ' kayıt)';
      sel.appendChild(opt);
    });

    // Önceki seçimi koru, yoksa header için otomatik seç
    if (currentVal && bizEntities.find(e => e.entity === currentVal)) {
      sel.value = currentVal;
    } else if (id === 'header-entity-select' && bizEntities.length > 0) {
      const autoHeader = bizEntities.find(e =>
        !e.entity.toLowerCase().includes('line') &&
        !e.entity.toLowerCase().includes('part') &&
        !e.entity.toLowerCase().includes('row') &&
        !e.entity.toLowerCase().includes('detail')
      ) || bizEntities[0];
      if (autoHeader) sel.value = autoHeader.entity;
    }
  });

  // FR sekmesi kaldırıldı

  // Blok mapping select'lerini güncelle
  document.querySelectorAll('.block-entity-select').forEach(sel => {
    const curr = sel.value;
    sel.innerHTML = '<option value="">-- Yok --</option>';
    const biz = cacheData.filter(e => !isSystemEntity(e.entity, e.service));
    const sys = cacheData.filter(e => isSystemEntity(e.entity, e.service));
    biz.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.entity;
      opt.textContent = e.entity + ' (' + e.recordCount + ')';
      sel.appendChild(opt);
    });
    if (sys.length) {
      const sep = document.createElement('option');
      sep.disabled = true; sep.textContent = '── Sistem ──';
      sel.appendChild(sep);
      sys.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.entity;
        opt.textContent = e.entity + ' (' + e.recordCount + ')';
        sel.appendChild(opt);
      });
    }
    if (curr) sel.value = curr;
  });
}

// Şablon yükle
document.getElementById('btn-upload-template').addEventListener('click', () => {
  document.getElementById('template-file-input').click();
});

document.getElementById('template-file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const buffer = await file.arrayBuffer();
    const analysis = await window.IFSReportEngine.analyzeTemplate(buffer);

    const template = {
      name: file.name.replace('.xlsx', ''),
      fileName: file.name,
      buffer: Array.from(new Uint8Array(buffer)), // storage için serialize
      analysis,
      savedAt: Date.now()
    };

    // Storage'a kaydet
    const { templates = [] } = await chrome.storage.local.get(['templates']);
    templates.push(template);
    await chrome.storage.local.set({ templates });

    selectedTemplate = template;
    selectedTemplateIndex = templates.length - 1;

    renderTemplateList(templates);
    addLog(`Şablon yüklendi: ${file.name}`, 'ok');
    addLog(`Header: ${analysis.headerPlaceholders.join(', ')}`, 'info');
    analysis.blocks.forEach(b => {
      addLog(`Blok [${b.name}]: ${b.placeholders.join(', ')}`, 'info');
    });
    showToast('📤 Şablon yüklendi!');
  } catch (err) {
    addLog('Şablon yükleme hatası: ' + err.message, 'err');
    showToast('Hata: ' + err.message, 'error');
  }

  e.target.value = '';
});

async function renderTemplateList(templates) {
  if (!templates) {
    const { templates: stored = [] } = await chrome.storage.local.get(['templates']);
    templates = stored;
  }

  const container = document.getElementById('template-list');
  if (!templates.length) {
    container.innerHTML = `<div class="empty-state" style="padding:10px 0">
      <div class="empty-icon" style="font-size:18px">📂</div>Henüz şablon yok
    </div>`;
    return;
  }

  container.innerHTML = templates.map((t, i) => `
    <div class="template-item ${selectedTemplateIndex === i ? 'entity-item selected' : 'entity-item'}" data-index="${i}">
      <div>
        <div class="template-name">${t.name}</div>
        <div class="template-entity">
          ${t.analysis?.headerPlaceholders?.length || 0} alan,
          ${t.analysis?.blocks?.length || 0} blok
        </div>
      </div>
      <div style="display:flex;gap:4px">
        <button class="btn btn-ghost" style="padding:4px 8px;font-size:10px" data-action="select" data-index="${i}">Seç</button>
        <button class="btn btn-danger" style="padding:4px 8px;font-size:10px;border-width:1px" data-action="delete" data-index="${i}">Sil</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      const { templates = [] } = await chrome.storage.local.get(['templates']);

      if (btn.dataset.action === 'select') {
        selectedTemplate = templates[idx];
        selectedTemplateIndex = idx;
        renderTemplateList(templates);
        addLog(`Şablon seçildi: ${selectedTemplate.name}`, 'info');
        showToast(`✅ ${selectedTemplate.name} seçildi`);
      } else if (btn.dataset.action === 'delete') {
        templates.splice(idx, 1);
        await chrome.storage.local.set({ templates });
        if (selectedTemplateIndex === idx) { selectedTemplate = null; selectedTemplateIndex = null; }
        renderTemplateList(templates);
        showToast('🗑 Şablon silindi');
      }
    });
  });
}

// Örnek şablon indir
document.getElementById('btn-download-sample').addEventListener('click', async () => {
  if (!cacheData.length) {
    showToast('Önce IFS sayfasında bir kayıt açın', 'error');
    return;
  }

  // Seçili entity'leri al (rapor ile aynı mantık)
  const headerEntityName = document.getElementById('header-entity-select').value;
  const blockMappings = getBlockMappings();

  // Hangi entity'lerin şablona gireceğini belirle
  const selectedNames = [headerEntityName, ...blockMappings.map(m => m.entity)].filter(Boolean);

  // Seçim yapılmamışsa tüm iş entity'lerini kullan
  const entitiesToUse = selectedNames.length
    ? cacheData.filter(e => selectedNames.includes(e.entity))
    : cacheData.filter(e => !isSystemEntity(e.entity, e.service));

  if (!entitiesToUse.length) {
    showToast('Header entity seçin', 'error');
    return;
  }

  try {
    await waitForExcelJS();
    if (!window.IFSReportEngine) throw new Error('Report engine yuklenemedi');
    if (!window.XLSXWriter) throw new Error('XLSX writer yuklenemedi');

    const enriched = [];
    for (const e of entitiesToUse) {
      const resp = await sendMsg({ type: 'GET_ENTITY_DATA', entity: e.entity });
      const records = resp?.ok ? (resp.records || []) : [];
      const fields = records.length > 0 ? Object.keys(records[0]) : (e.fields || []);
      // Blok adını bul
      const blockMapping = blockMappings.find(m => m.entity === e.entity);
      enriched.push({
        entity: e.entity,
        service: e.service,
        fields,
        sampleRecord: records.length ? records[0] : null,
        records,
        blockName: blockMapping ? blockMapping.name : (e.entity === headerEntityName ? null : 'LINES'),
        isHeader: e.entity === headerEntityName,
      });
    }

    const buffer = await window.IFSReportEngine.generateSampleTemplate(enriched);
    const name = headerEntityName || entitiesToUse[0]?.service || 'IFS';
    downloadBlob(buffer, name + '-sablon.xlsx');
    addLog('Örnek şablon indirildi: ' + name, 'ok');
    showToast('📄 Örnek şablon indirildi!');
  } catch (err) {
    addLog('Şablon hatası: ' + err.message, 'err');
    showToast('Hata: ' + err.message, 'error');
  }
});

// Excel rapor oluştur
document.getElementById('btn-generate-excel').addEventListener('click', async () => {
  await generateReport('excel');
});

document.getElementById('btn-generate-pdf').addEventListener('click', async () => {
  await generateReport('pdf');
});

async function generateReport(outputType) {
  if (!selectedTemplate) {
    showToast('Önce bir şablon seçin!', 'error');
    return;
  }

  const headerEntityName = document.getElementById('header-entity-select').value;
  if (!headerEntityName) {
    showToast('Header entity seçin!', 'error');
    return;
  }

  const loading = document.getElementById('report-loading');
  loading.classList.add('visible');

  try {
    addLog('Rapor oluşturuluyor...', 'info');

    // Verileri al
    const headerResp = await sendMsg({ type: 'GET_ENTITY_DATA', entity: headerEntityName });
    if (!headerResp?.ok) throw new Error(`Header veri alınamadı: ${headerEntityName}`);

    const headerRecord = headerResp.records[0] || {};
    addLog(`Header: ${Object.keys(headerRecord).length} alan`, 'info');

    // Çoklu blok verilerini çek
    const blockMappings = getBlockMappings();
    const blockData = {}; // { LINES: [...], APPROVALS: [...] }
    for (const mapping of blockMappings) {
      if (!mapping.entity) continue;
      const resp = await sendMsg({ type: 'GET_ENTITY_DATA', entity: mapping.entity });
      if (resp?.ok) {
        blockData[mapping.name] = resp.records;
        addLog(mapping.name + ': ' + resp.records.length + ' kayıt', 'info');
      }
    }

    // Geriye uyumluluk: ilk blok lineData olarak da gönder
    const firstBlock = blockMappings[0];
    const lineRecords = firstBlock && blockData[firstBlock.name] ? blockData[firstBlock.name] : [];

    // ExcelJS hazır bekle
    await waitForExcelJS();

    // Template buffer'ı geri dönüştür
    const templateBuffer = new Uint8Array(selectedTemplate.buffer).buffer;

    // Raporu oluştur
    const blockName = selectedTemplate.analysis?.blocks?.[0]?.name || 'LINES';
    
    const outputBuffer = await window.IFSReportEngine.generateReport({
      templateBuffer,
      headerData: headerRecord,
      lineData: lineRecords.length ? lineRecords : null,
      blockName,
      blockData,   // tüm bloklar
      envName: currentHostname
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${selectedTemplate.name}-${timestamp}.xlsx`;

    if (outputType === 'excel') {
      downloadBlob(outputBuffer, filename);
      addLog('Excel indirildi: ' + filename, 'ok');
      showToast('📊 Excel indirildi!');
    } else {
      // PDF: HTML raporu oluştur, yeni sekmede aç, print dialog
      const htmlContent = buildHtmlReport(headerRecord, lineRecords, selectedTemplate.name);
      const htmlBlob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const htmlUrl = URL.createObjectURL(htmlBlob);
      const win = window.open(htmlUrl, '_blank');
      if (win) {
        win.onload = () => setTimeout(() => win.print(), 400);
        addLog('PDF için HTML rapor açıldı', 'ok');
        showToast('🖨️ Yazdır penceresi açılıyor...');
      } else {
        showToast('Popup engellendi — tarayıcı izni verin', 'error');
      }
    }

  } catch (err) {
    addLog('Hata: ' + err.message, 'err');
    showToast('Hata: ' + err.message, 'error');
  } finally {
    loading.classList.remove('visible');
  }
}

document.getElementById('btn-refresh-cache').addEventListener('click', async () => {
  await refreshCache();
  showToast('🔄 Cache yenilendi');
});

document.getElementById('btn-clear-cache').addEventListener('click', () => {
  cacheData = [];
  renderEntityList();
  populateEntitySelects();
  document.getElementById('cache-badge').textContent = '0 veri';
  showToast('🗑 Cache temizlendi');
});

// ─══════════════════════════════════════════════════════════
//  ORTAM ETİKETİ
// ══════════════════════════════════════════════════════════

const ENV_COLORS = [
  { color: '#ef4444', text: '#fff', label: 'Kırmızı' },
  { color: '#f97316', text: '#000', label: 'Turuncu' },
  { color: '#eab308', text: '#000', label: 'Sarı' },
  { color: '#22c55e', text: '#000', label: 'Yeşil' },
  { color: '#3b82f6', text: '#fff', label: 'Mavi' },
  { color: '#a855f7', text: '#fff', label: 'Mor' },
  { color: '#ec4899', text: '#fff', label: 'Pembe' },
  { color: '#14b8a6', text: '#000', label: 'Teal' },
  { color: '#64748b', text: '#fff', label: 'Gri' },
  { color: '#1e293b', text: '#fff', label: 'Koyu' },
  { color: '#7c3aed', text: '#fff', label: 'İndigo' },
  { color: '#dc2626', text: '#fff', label: 'Koyu Kırmızı' },
];

let selectedEnvColor = ENV_COLORS[1]; // default turuncu


function renderEnvIcons() {
  const container = document.getElementById('env-icons');
  if (!container) return;
  const ICONS = ['⚠️','🔴','🟡','🟢','🔵','⭐','🚀','🏭','🧪','💼','🌍','🔧'];
  const current = document.getElementById('env-icon')?.value || '⚠️';
  container.innerHTML = ICONS.map(ic => {
    const selected = ic === current;
    return '<div data-icon="' + ic + '" style="width:28px;height:28px;border-radius:6px;'
      + 'display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;'
      + 'border:2px solid ' + (selected ? 'var(--accent)' : 'transparent') + ';'
      + 'background:' + (selected ? 'rgba(0,194,168,.1)' : 'var(--surface2)') + '">'
      + ic + '</div>';
  }).join('');
  container.querySelectorAll('[data-icon]').forEach(el => {
    el.addEventListener('click', () => {
      const iconEl = document.getElementById('env-icon');
      if (iconEl) iconEl.value = el.dataset.icon;
      renderEnvIcons();
    });
  });
}

function renderEnvColors() {
  const grid = document.getElementById('env-colors');
  grid.innerHTML = ENV_COLORS.map((c, i) => `
    <div class="env-color-dot ${selectedEnvColor.color === c.color ? 'selected' : ''}"
         style="background:${c.color}"
         data-index="${i}"
         title="${c.label}"></div>
  `).join('');

  grid.querySelectorAll('.env-color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      selectedEnvColor = ENV_COLORS[parseInt(dot.dataset.index)];
      renderEnvColors();
    });
  });
}

async function loadEnvConfig(hostname) {
  if (!hostname) return;
  const { envConfigs = {} } = await chrome.storage.local.get(['envConfigs']);
  const config = envConfigs[hostname];
  if (config) {
    document.getElementById('env-label').value = config.label || '';
    document.getElementById('env-icon').value = config.icon || '⚠️';
    const colorMatch = ENV_COLORS.find(c => c.color === config.color);
    if (colorMatch) selectedEnvColor = colorMatch;
    renderEnvColors();
    renderEnvIcons();
  }
}

async function renderEnvList() {
  const { envConfigs = {} } = await chrome.storage.local.get(['envConfigs']);
  const list = document.getElementById('env-list');

  const entries = Object.entries(envConfigs);
  if (!entries.length) {
    list.innerHTML = '<div class="empty-state" style="padding:10px 0">Henüz ortam tanımlı değil</div>';
    return;
  }

  list.innerHTML = entries.map(([host, cfg]) => `
    <div class="entity-item">
      <div style="width:14px;height:14px;border-radius:50%;background:${cfg.color};flex-shrink:0"></div>
      <div style="flex:1">
        <div style="font-size:12px;font-weight:500">${cfg.label} ${cfg.icon}</div>
        <div style="font-size:10px;color:var(--muted)">${host}</div>
      </div>
      <button class="btn btn-danger" style="padding:3px 8px;font-size:10px;border-width:1px" data-host="${host}">Sil</button>
    </div>
  `).join('');

  list.querySelectorAll('[data-host]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { envConfigs = {} } = await chrome.storage.local.get(['envConfigs']);
      delete envConfigs[btn.dataset.host];
      await chrome.storage.local.set({ envConfigs });
      renderEnvList();
      showToast('🗑 Ortam kaldırıldı');
    });
  });
}

document.getElementById('btn-save-env').addEventListener('click', async () => {
  const label = document.getElementById('env-label').value.trim();
  const icon = document.getElementById('env-icon').value;
  if (!label) { showToast('Ortam adı girin!', 'error'); return; }

  const { envConfigs = {} } = await chrome.storage.local.get(['envConfigs']);
  envConfigs[currentHostname] = {
    label,
    icon,
    color: selectedEnvColor.color,
    textColor: selectedEnvColor.text,
    enabled: true
  };
  await chrome.storage.local.set({ envConfigs });

  // Banner'ı sayfada yenile
  await sendToContent({ type: 'REFRESH_ENV_BANNER' });
  renderEnvList();
  showToast('💾 Ortam kaydedildi!');
  addLog(`Ortam etiketi eklendi: ${currentHostname} → ${label}`, 'ok');
});

document.getElementById('btn-remove-env').addEventListener('click', async () => {
  const { envConfigs = {} } = await chrome.storage.local.get(['envConfigs']);
  delete envConfigs[currentHostname];
  await chrome.storage.local.set({ envConfigs });
  await sendToContent({ type: 'REFRESH_ENV_BANNER' });
  renderEnvList();
  document.getElementById('env-label').value = '';
  showToast('🗑 Ortam kaldırıldı');
});

// ─══════════════════════════════════════════════════════════
//  ÇAPRAZ KOPYALA
// ══════════════════════════════════════════════════════════

document.getElementById('btn-cross-preview').addEventListener('click', async () => {
  const entity = document.getElementById('cross-entity-select').value;
  if (!entity) { showToast('Entity seçin!', 'error'); return; }

  const resp = await sendMsg({ type: 'GET_ENTITY_DATA', entity });
  if (!resp?.ok) { showToast('Veri alınamadı', 'error'); return; }

  const preview = document.getElementById('cross-preview');
  const box = document.getElementById('cross-preview');
  preview.style.display = 'block';
  box.textContent = JSON.stringify(resp.records[0] || {}, null, 2).slice(0, 800) + '...';
});

document.getElementById('btn-cross-copy').addEventListener('click', async () => {
  const entity = document.getElementById('cross-entity-select').value;
  const targetUrl = document.getElementById('cross-target-url').value.trim();
  const conflict = document.getElementById('cross-conflict').value;

  if (!entity) { showToast('Entity seçin!', 'error'); return; }
  if (!targetUrl) { showToast('Hedef URL girin!', 'error'); return; }

  const loading = document.getElementById('cross-loading');
  loading.classList.add('visible');

  try {
    const resp = await sendMsg({ type: 'GET_ENTITY_DATA', entity });
    if (!resp?.ok) throw new Error('Veri alınamadı');

    // Hedef URL'yi düzenle
    const sourceHost = new URL(currentUrl).origin;
    const targetHost = targetUrl.replace(/\/$/, '');
    const targetEndpoint = resp.url?.replace(sourceHost, targetHost) || '';

    addLog(`Hedef: ${targetEndpoint}`, 'info');

    // POST isteği at
    const postResp = await sendMsg({
      type: 'POST_ENTITY',
      url: targetEndpoint.split('?')[0].split('(')[0] + 'Set', // Set endpoint
      body: resp.records[0]
    });

    if (postResp?.ok) {
      addLog(`Kopyalandı: ${entity}`, 'ok');
      showToast('✅ Başarıyla kopyalandı!');
    } else {
      throw new Error(postResp?.data?.error?.message || 'Kopyalama başarısız');
    }
  } catch (err) {
    addLog('Hata: ' + err.message, 'err');
    showToast('Hata: ' + err.message, 'error');
  } finally {
    loading.classList.remove('visible');
  }
});

// ─══════════════════════════════════════════════════════════
//  BUL / DEĞİŞTİR
// ══════════════════════════════════════════════════════════



// ─══════════════════════════════════════════════════════════
//  STICKY NOTLAR
// ══════════════════════════════════════════════════════════

let selectedStickyColor = '#fef08a';

document.querySelectorAll('.sticky-color').forEach(dot => {
  dot.addEventListener('click', () => {
    document.querySelectorAll('.sticky-color').forEach(d => d.style.borderColor = 'transparent');
    dot.style.borderColor = '#374151';
    selectedStickyColor = dot.dataset.color;
  });
});
// İlk rengi seç
document.querySelector('.sticky-color')?.click();

async function loadStickyNotes() {
  const tab = await getActiveTab();
  const pageKey = tab.url;
  const { stickyNotes = {} } = await chrome.storage.local.get(['stickyNotes']);
  const notes = stickyNotes[pageKey] || [];

  const list = document.getElementById('sticky-list');
  if (!notes.length) {
    list.innerHTML = `<div class="empty-state" style="padding:12px 0">
      <div class="empty-icon" style="font-size:22px">📌</div>
      <div>Bu sayfa için not yok</div>
      <div style="font-size:11px;margin-top:4px;color:var(--muted)">Aşağıdan not ekleyin</div>
    </div>`;
    return;
  }

  list.innerHTML = notes.map((n, i) => `
    <div style="
      display:flex; align-items:flex-start; gap:8px;
      background:${n.color}; border-radius:6px;
      padding:8px 10px; margin-bottom:6px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.1);
    " data-note-id="${n.id}">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;color:#1f2937;line-height:1.4;word-break:break-word">
          ${n.text.slice(0, 80)}${n.text.length > 80 ? '...' : ''}
        </div>
        <div style="font-size:10px;color:rgba(0,0,0,0.45);margin-top:3px">${n.date}</div>
      </div>
      <button data-delete-note="${n.id}" title="Notu sil" style="
        background:none;border:none;cursor:pointer;
        color:rgba(0,0,0,0.35);font-size:16px;line-height:1;
        flex-shrink:0;padding:0 2px;
      ">×</button>
    </div>
  `).join('');

  // Sil butonları
  list.querySelectorAll('[data-delete-note]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const noteId = btn.dataset.deleteNote;
      const { stickyNotes = {} } = await chrome.storage.local.get(['stickyNotes']);
      stickyNotes[pageKey] = (stickyNotes[pageKey] || []).filter(n => n.id !== noteId);
      await chrome.storage.local.set({ stickyNotes });
      // Content script'e de haber ver (DOM'dan kaldırsın)
      await sendToContent({ type: 'RELOAD_STICKY_NOTES' });
      await loadStickyNotes();
      showToast('🗑 Not silindi');
    });
  });
}

document.getElementById('btn-add-sticky').addEventListener('click', async () => {
  const text = document.getElementById('sticky-text').value.trim();
  if (!text) { showToast('Not içeriği girin!', 'error'); return; }

  const tab = await getActiveTab();
  const pageKey = tab.url;

  // Pozisyon: rastgele ofset ile not üst üste gelmesin
  const existingNotes = (await chrome.storage.local.get(['stickyNotes'])).stickyNotes?.[pageKey] || [];
  const offset = existingNotes.length * 24;

  const note = {
    id: Date.now().toString(),
    text,
    color: selectedStickyColor,
    date: new Date().toLocaleDateString('tr-TR'),
    x: 20 + (offset % 80),
    y: 180 + (offset % 120)
  };

  // Önce storage'a kaydet
  const { stickyNotes = {} } = await chrome.storage.local.get(['stickyNotes']);
  if (!stickyNotes[pageKey]) stickyNotes[pageKey] = [];
  stickyNotes[pageKey].push(note);
  await chrome.storage.local.set({ stickyNotes });

  // Sonra content script'e gönder — sayfada göster
  const result = await sendToContent({ type: 'ADD_STICKY_NOTE', note });

  document.getElementById('sticky-text').value = '';
  await loadStickyNotes();

  if (result?.ok) {
    showToast('📌 Not sayfaya eklendi!');
  } else {
    showToast('📌 Not kaydedildi (sayfa yenilenince görünür)', 'success');
  }
});



// ─── DİL SİSTEMİ ──────────────────────────────────────────
const LANGS = {
  tr: {
    report: '📊 Rapor', env: '🏷️ Ortam', cross: '🔄 Çapraz',
    sticky: '📌 Notlar', analiz: '📈 Analiz', settings: '⚙️ Ayarlar',
    noData: 'Henüz veri yok — IFS sayfasında bir kayıt açın',
    headerEntity: 'Header Verisi (ana kayıt)',
    refresh: '🔄 Yenile', clear: '🗑 Temizle',
    uploadTemplate: '📤 Şablon Yükle', downloadSample: '⬇️ Örnek İndir',
    generateExcel: '📊 Excel İndir', generatePdf: '🖨️ PDF',
    blockName: 'Blok Adı (şablonda {{#...}})',
    addBlock: '+ Blok Ekle',
    activeLang: 'Türkçe',
  },
  en: {
    report: '📊 Report', env: '🏷️ Environment', cross: '🔄 Cross',
    sticky: '📌 Notes', analiz: '📈 Analysis', settings: '⚙️ Settings',
    noData: 'No data yet — open a record on an IFS page',
    headerEntity: 'Header Data (main record)',
    refresh: '🔄 Refresh', clear: '🗑 Clear',
    uploadTemplate: '📤 Upload Template', downloadSample: '⬇️ Download Sample',
    generateExcel: '📊 Download Excel', generatePdf: '🖨️ PDF',
    blockName: 'Block Name (in template {{#...}})',
    addBlock: '+ Add Block',
    activeLang: 'English',
  },
  it: {
    report: '📊 Report', env: '🏷️ Ambiente', cross: '🔄 Copia',
    sticky: '📌 Note', analiz: '📈 Analisi', settings: '⚙️ Impostazioni',
    noData: 'Nessun dato — apri un record nella pagina IFS',
    headerEntity: 'Dati Header (record principale)',
    refresh: '🔄 Aggiorna', clear: '🗑 Pulisci',
    uploadTemplate: '📤 Carica Template', downloadSample: '⬇️ Scarica Esempio',
    generateExcel: '📊 Scarica Excel', generatePdf: '🖨️ PDF',
    blockName: 'Nome Blocco (nel template {{#...}})',
    addBlock: '+ Aggiungi Blocco',
    activeLang: 'Italiano',
  }
};

let currentLang = 'tr';

function applyLang(lang) {
  if (!LANGS[lang]) return;
  currentLang = lang;
  const t = LANGS[lang];

  // Nav sekme etiketleri
  const tabMap = { report: t.report, env: t.env, cross: t.cross,
    sticky: t.sticky, analiz: t.analiz, settings: t.settings };
  document.querySelectorAll('.nav-tab').forEach(tab => {
    const key = tab.dataset.tab;
    if (tabMap[key]) tab.textContent = tabMap[key];
  });

  // Butonlar
  const btnMap = {
    'btn-refresh-cache': t.refresh,
    'btn-clear-cache': t.clear,
    'btn-upload-template': t.uploadTemplate,
    'btn-download-sample': t.downloadSample,
    'btn-generate-excel': t.generateExcel,
    'btn-generate-pdf': t.generatePdf,
    'btn-add-block': t.addBlock,
  };
  Object.entries(btnMap).forEach(([id, label]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = label;
  });

  // Aktif dil göster
  const activeLangEl = document.getElementById('settings-active-lang');
  if (activeLangEl) activeLangEl.textContent = t.activeLang;

  // Dil butonlarını güncelle
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.style.background = btn.dataset.lang === lang
      ? 'rgba(107,45,139,0.3)' : '';
    btn.style.borderColor = btn.dataset.lang === lang
      ? '#9B4DC8' : '';
  });

  // Kaydet
  chrome.storage.local.set({ appLang: lang });
}

// ─── ÇOKLU ENTITY BLOK YÖNETİMİ ──────────────────────────
function addBlockRow(blockName = '', entityValue = '') {
  const container = document.getElementById('block-mappings');
  const row = document.createElement('div');
  row.className = 'block-mapping-row';
  row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px';
  row.dataset.block = blockName || 'BLOCK' + (container.children.length + 1);

  row.innerHTML = '<div style="flex:1">'
    + '<div style="font-size:10px;color:var(--muted);margin-bottom:3px">Blok Adı</div>'
    + '<input type="text" value="' + (blockName || '') + '" class="block-name-input" placeholder="LINES2" '
    + 'style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:5px;color:var(--text);padding:5px 8px;font-size:11px;font-family:monospace">'
    + '</div>'
    + '<div style="flex:2">'
    + '<div style="font-size:10px;color:var(--muted);margin-bottom:3px">Entity</div>'
    + '<select class="block-entity-select" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:5px;color:var(--text);padding:5px 8px;font-size:11px">'
    + '<option value="">-- Yok --</option>'
    + '</select>'
    + '</div>'
    + '<button class="btn-remove-block" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:0 2px;margin-top:14px" title="Kaldır">×</button>';

  row.querySelector('.btn-remove-block').addEventListener('click', () => row.remove());
  container.appendChild(row);

  // Select'i doldur
  const sel = row.querySelector('.block-entity-select');
  cacheData.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.entity;
    opt.textContent = e.entity + ' (' + e.recordCount + ')';
    if (e.entity === entityValue) opt.selected = true;
    sel.appendChild(opt);
  });

  return row;
}

function getBlockMappings() {
  const mappings = [];
  document.querySelectorAll('.block-mapping-row').forEach(row => {
    const name = row.querySelector('.block-name-input')?.value?.trim();
    const entity = row.querySelector('.block-entity-select')?.value;
    if (name) mappings.push({ name, entity: entity || '' });
  });
  return mappings;
}


// ─── HTML RAPOR OLUŞTURUCU ─────────────────────────────────
function buildHtmlReport(headerRecord, lineRecords, templateName) {
  const today = new Date().toLocaleDateString('tr-TR');
  const now = new Date().toLocaleTimeString('tr-TR');

  // Header alanları - boş olmayanlar
  const headerRows = Object.entries(headerRecord)
    .filter(([k, v]) => v !== null && v !== '' && !k.startsWith('@') && k !== 'luname' && k !== 'keyref')
    .map(([k, v]) => `<tr><td class="lbl">${k}</td><td>${v}</td></tr>`)
    .join('');

  // Line kayıtları
  let linesHtml = '';
  if (lineRecords && lineRecords.length > 0) {
    const keys = Object.keys(lineRecords[0]).filter(k =>
      !k.startsWith('@') && k !== 'luname' && k !== 'keyref' &&
      lineRecords[0][k] !== null && lineRecords[0][k] !== ''
    );
    // Önemli alanlar önce
    const priority = ['LineNo','PartNo','Description','BuyQtyDue','BuyUnitMeas',
      'BuyUnitPrice','NetAmtCurr','TaxAmount','GrossAmtCurr','PlannedReceiptDate','Objstate'];
    const sorted = [...new Set([...priority.filter(k => keys.includes(k)), ...keys])].slice(0, 15);

    const thead = sorted.map(k => `<th>${k}</th>`).join('');
    const tbody = lineRecords.map((rec, i) =>
      '<tr class="' + (i % 2 === 0 ? 'even' : 'odd') + '">' +
      sorted.map(k => `<td>${rec[k] ?? ''}</td>`).join('') +
      '</tr>'
    ).join('');

    linesHtml = `
      <h2>Malzeme Satırları <span class="badge">${lineRecords.length} kayıt</span></h2>
      <table class="lines"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
  }

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>${templateName || 'IFS Rapor'}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a2e; background: #fff; }

  .header { background: linear-gradient(135deg, #6B2D8B, #9B4DC8); color: #fff;
    padding: 14px 20px; display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 16px; border-radius: 4px; }
  .header h1 { font-size: 16px; font-weight: 700; }
  .header .meta { font-size: 10px; opacity: .85; margin-top: 3px; }
  .header .logo { font-size: 32px; }

  h2 { font-size: 11px; font-weight: 700; color: #6B2D8B; letter-spacing: .5px;
    text-transform: uppercase; margin: 12px 0 6px; padding-bottom: 4px;
    border-bottom: 2px solid #9B4DC8; }
  .badge { background: rgba(107,45,139,.15); color: #6B2D8B; border-radius: 10px;
    padding: 1px 8px; font-size: 10px; font-weight: 600; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  table.info td, table.info th { padding: 4px 8px; border: 1px solid #e0e0e0; }
  table.info .lbl { background: #f3e8ff; color: #4A1060; font-weight: 600;
    width: 180px; white-space: nowrap; }
  table.info tr:nth-child(even) td:not(.lbl) { background: #fafafa; }

  table.lines th { background: #6B2D8B; color: #fff; padding: 5px 6px;
    text-align: left; font-size: 10px; white-space: nowrap; }
  table.lines td { padding: 4px 6px; border-bottom: 1px solid #eee; white-space: nowrap; }
  table.lines tr.even td { background: #f9f5ff; }
  table.lines tr:hover td { background: #ede0ff; }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  .grid table { margin: 0; }

  .footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #e0e0e0;
    font-size: 9px; color: #888; display: flex; justify-content: space-between; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none; }
  }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="h1" style="font-size:16px;font-weight:700">${templateName || 'IFS Rapor'}</div>
    <div class="meta">Oluşturulma: ${today} ${now}</div>
  </div>
  <div class="logo">🐙</div>
</div>

<button class="no-print" onclick="window.print()" style="margin-bottom:12px;padding:7px 18px;
  background:#6B2D8B;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">
  🖨️ PDF Olarak Kaydet
</button>

<h2>Sipariş Bilgileri</h2>
<div class="grid">
  <table class="info"><tbody>${headerRows}</tbody></table>
</div>

${linesHtml}

<div class="footer">
  <span>🐙 Ahtapot — IFS Toolkit</span>
  <span>${today} ${now}</span>
</div>

</body></html>`;
}

// ─── INIT ─────────────────────────────────────────────────
(async () => {
  try { await detectPage(); } catch(e) { console.warn('detectPage:', e); }
  try { await refreshCache(); } catch(e) { console.warn('refreshCache:', e); }
  try { await renderTemplateList(); } catch(e) { console.warn('renderTemplateList:', e); }
  try { renderEnvColors(); renderEnvIcons(); } catch(e) { console.warn('renderEnvColors:', e); }
  try { await renderEnvList(); } catch(e) { console.warn('renderEnvList:', e); }
  try { await loadStickyNotes(); } catch(e) { console.warn('loadStickyNotes:', e); }
  try { populateAnalizEntitySelect(); } catch(e) { console.warn('populateAnalizEntitySelect:', e); }

  // Ayarlar: dil yükle
  try {
    const { appLang } = await chrome.storage.local.get(['appLang']);
    applyLang(appLang || 'tr');
  } catch(e) {}

  // Versiyon
  try {
    const manifest = chrome.runtime.getManifest();
    const vEl = document.getElementById('settings-version');
    if (vEl) vEl.textContent = manifest.version;
  } catch(e) {}
})();

// Cache güncelleme mesajlarını dinle
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'CACHE_UPDATED') {
    refreshCache();
  }
});

// ─══════════════════════════════════════════════════════════
//  ANALİZ PANELİ — Group By + Aggregasyon
// ══════════════════════════════════════════════════════════

const analizState = {
  entity: null,       // seçili entity adı
  records: [],        // ham kayıtlar
  fields: [],         // tüm field adları
  numericFields: [],  // sayısal field adları
  groupBy: null,      // group by field
  metrics: [],        // [{ field, func, label }]
  result: null        // hesaplanan sonuç
};

// ─── Entity seçilince field'ları doldur ──────────────────
document.getElementById('analiz-entity').addEventListener('change', async function() {
  const entity = this.value;
  if (!entity) { resetAnalizFields(); return; }

  const resp = await sendMsg({ type: 'GET_ENTITY_DATA', entity });
  if (!resp?.ok || !resp.records.length) {
    showToast('Bu entity için veri yok', 'error');
    resetAnalizFields();
    return;
  }

  analizState.entity = entity;
  analizState.records = resp.records;

  // Field tiplerini tespit et
  const sample = resp.records[0];
  analizState.fields = Object.keys(sample);
  analizState.numericFields = analizState.fields.filter(f => {
    // Birkaç kayıtta sayısal mı diye bak
    const vals = resp.records.slice(0, 10).map(r => r[f]);
    const numericCount = vals.filter(v => v !== null && v !== '' && !isNaN(Number(v))).length;
    return numericCount >= Math.min(3, vals.length);
  });

  // Group By select'i doldur
  const gbSel = document.getElementById('analiz-groupby');
  gbSel.innerHTML = '<option value="">-- Alan seç --</option>';
  analizState.fields.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    gbSel.appendChild(opt);
  });

  // Metrik field select'i doldur
  const mfSel = document.getElementById('analiz-metric-field');
  mfSel.innerHTML = '<option value="">-- Alan --</option>';

  // Önce sayısal field'lar, sonra diğerleri (COUNT için)
  const allForMetric = ['(Kayıt Sayısı)', ...analizState.numericFields,
    ...analizState.fields.filter(f => !analizState.numericFields.includes(f))];

  allForMetric.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f === '(Kayıt Sayısı)' ? '__COUNT__' : f;
    opt.textContent = f;
    if (analizState.numericFields.includes(f)) opt.style.color = '#34d399';
    mfSel.appendChild(opt);
  });

  addLog(`${entity}: ${resp.records.length} kayıt, ${analizState.numericFields.length} sayısal alan`, 'info');
});

function resetAnalizFields() {
  analizState.entity = null;
  analizState.records = [];
  analizState.fields = [];
  analizState.numericFields = [];
  analizState.groupBy = null;
  analizState.metrics = [];
  document.getElementById('analiz-groupby').innerHTML = '<option value="">-- Alan seç --</option>';
  document.getElementById('analiz-metric-field').innerHTML = '<option value="">-- Alan --</option>';
  renderMetricChips();
  document.getElementById('analiz-result').style.display = 'none';
}

// ─── Metrik ekle ──────────────────────────────────────────
document.getElementById('btn-add-metric').addEventListener('click', () => {
  const field = document.getElementById('analiz-metric-field').value;
  const func = document.getElementById('analiz-metric-func').value;
  if (!field) { showToast('Alan seçin!', 'error'); return; }

  // Aynı field+func kombinasyonu varsa ekle
  const exists = analizState.metrics.some(m => m.field === field && m.func === func);
  if (exists) { showToast('Bu metrik zaten var', 'error'); return; }

  const fieldLabel = field === '__COUNT__' ? 'Kayıt' : field;
  analizState.metrics.push({ field, func, label: `${func}(${fieldLabel})` });
  renderMetricChips();
});

function renderMetricChips() {
  const container = document.getElementById('analiz-metrics-list');
  if (!analizState.metrics.length) {
    container.innerHTML = '<span style="font-size:11px;color:var(--muted);padding:4px 0">Metrik eklenmedi</span>';
    return;
  }
  container.innerHTML = analizState.metrics.map((m, i) => `
    <div class="metric-chip active" data-index="${i}">
      <span>${m.label}</span>
      <span data-remove="${i}" style="margin-left:4px;opacity:.7;cursor:pointer;font-size:13px" title="Kaldır">×</span>
    </div>
  `).join('');

  container.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      analizState.metrics.splice(parseInt(btn.dataset.remove), 1);
      renderMetricChips();
    });
  });
}

// ─── Analiz Çalıştır ──────────────────────────────────────
document.getElementById('btn-analiz-run').addEventListener('click', runAnaliz);

async function runAnaliz() {
  const entity = document.getElementById('analiz-entity').value;
  const groupBy = document.getElementById('analiz-groupby').value;

  if (!entity) { showToast('Entity seçin!', 'error'); return; }
  if (!groupBy) { showToast('Group By alanı seçin!', 'error'); return; }
  if (!analizState.metrics.length) { showToast('En az bir metrik ekleyin!', 'error'); return; }
  if (!analizState.records.length) { showToast('Veri yok, entity yeniden seçin', 'error'); return; }

  const loading = document.getElementById('analiz-loading');
  loading.classList.add('visible');

  try {
    await sleep(30); // UI update için

    const records = analizState.records;
    analizState.groupBy = groupBy;

    // ─── GROUP BY ─────────────────────────────────────────
    const groups = {};
    records.forEach(record => {
      const key = String(record[groupBy] ?? '(Boş)');
      if (!groups[key]) groups[key] = [];
      groups[key].push(record);
    });

    // ─── AGREGASYONlAR ────────────────────────────────────
    const resultRows = Object.entries(groups).map(([groupVal, groupRecords]) => {
      const row = { [groupBy]: groupVal, __count: groupRecords.length };

      analizState.metrics.forEach(metric => {
        if (metric.field === '__COUNT__' || metric.func === 'COUNT') {
          row[metric.label] = groupRecords.length;
        } else if (metric.func === 'COUNT_DISTINCT') {
          const uniq = new Set(groupRecords.map(r => r[metric.field]));
          row[metric.label] = uniq.size;
        } else {
          const numVals = groupRecords
            .map(r => parseFloat(r[metric.field]))
            .filter(v => !isNaN(v));

          if (!numVals.length) { row[metric.label] = null; return; }

          switch (metric.func) {
            case 'SUM': row[metric.label] = numVals.reduce((a, b) => a + b, 0); break;
            case 'AVG': row[metric.label] = numVals.reduce((a, b) => a + b, 0) / numVals.length; break;
            case 'MIN': row[metric.label] = Math.min(...numVals); break;
            case 'MAX': row[metric.label] = Math.max(...numVals); break;
            default: row[metric.label] = null;
          }
        }
      });

      return row;
    });

    // Toplam satırı
    const totalRow = { [groupBy]: '📊 TOPLAM', __isTotal: true };
    analizState.metrics.forEach(metric => {
      const vals = resultRows.map(r => r[metric.label]).filter(v => v !== null && !isNaN(v));
      if (metric.func === 'SUM' || metric.func === 'COUNT' || metric.func === 'COUNT_DISTINCT') {
        totalRow[metric.label] = vals.reduce((a, b) => a + b, 0);
      } else if (metric.func === 'AVG') {
        totalRow[metric.label] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      } else if (metric.func === 'MIN') {
        totalRow[metric.label] = vals.length ? Math.min(...vals) : null;
      } else if (metric.func === 'MAX') {
        totalRow[metric.label] = vals.length ? Math.max(...vals) : null;
      }
    });

    // Sayıya göre sırala (ilk metriğe göre desc)
    const firstMetric = analizState.metrics[0];
    if (firstMetric) {
      resultRows.sort((a, b) => (b[firstMetric.label] ?? -Infinity) - (a[firstMetric.label] ?? -Infinity));
    }

    analizState.result = { rows: resultRows, totalRow, groupBy, metrics: [...analizState.metrics] };

    renderAnalizTable(analizState.result);

    const exportBtn = document.getElementById('btn-analiz-export');
    exportBtn.disabled = false;
    addLog(`Analiz tamamlandı: ${Object.keys(groups).length} grup, ${records.length} kayıt`, 'ok');

  } catch (err) {
    addLog('Analiz hatası: ' + err.message, 'err');
    showToast('Hata: ' + err.message, 'error');
  } finally {
    loading.classList.remove('visible');
  }
}

// ─── Tabloyu Render Et ────────────────────────────────────
function renderAnalizTable(data) {
  const { rows, totalRow, groupBy, metrics } = data;
  const resultDiv = document.getElementById('analiz-result');
  const thead = document.getElementById('analiz-thead');
  const tbody = document.getElementById('analiz-tbody');
  const label = document.getElementById('analiz-result-label');
  const count = document.getElementById('analiz-result-count');

  label.textContent = `${groupBy} bazında`;
  count.textContent = `${rows.length} grup`;

  // Header
  const metricLabels = metrics.map(m => m.label);
  thead.innerHTML = `<tr>
    <th>${groupBy}</th>
    ${metricLabels.map(l => `<th style="text-align:right">${l}</th>`).join('')}
  </tr>`;

  // Body
  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${escapeHtmlAnaliz(String(row[groupBy]))}</td>
      ${metricLabels.map(l => `<td class="num">${formatNum(row[l])}</td>`).join('')}
    </tr>
  `).join('');

  // Toplam satırı
  if (totalRow) {
    tbody.innerHTML += `<tr class="total-row">
      <td>${totalRow[groupBy]}</td>
      ${metricLabels.map(l => `<td class="num">${formatNum(totalRow[l])}</td>`).join('')}
    </tr>`;
  }

  resultDiv.style.display = 'block';
  document.getElementById('analiz-empty').style.display = 'none';
}

function formatNum(val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'number') {
    // Ondalıklıysa 2 basamak, tamsayıysa direkt
    return Number.isInteger(val) ? val.toLocaleString('tr-TR') : val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(val);
}

function escapeHtmlAnaliz(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Excel Export ──────────────────────────────────────────
// ─── Excel Export ──────────────────────────────────────────
document.getElementById('btn-analiz-export').addEventListener('click', async () => {
  if (!analizState.result) return;
  const { rows, totalRow, groupBy, metrics } = analizState.result;

  await waitForExcelJS();

  const exportHeaders = [groupBy, ...metrics.map(m => m.label)];
  const exportRows = [];

  exportRows.push([analizState.entity + ' — ' + groupBy + ' Analizi', ...metrics.map(() => '')]);
  exportRows.push(['Olusturuldu: ' + new Date().toLocaleString('tr-TR'), ...metrics.map(() => '')]);
  exportRows.push([]);

  rows.forEach(row => {
    exportRows.push([row[groupBy], ...metrics.map(m => {
      const v = row[m.label];
      return (v === null || v === undefined) ? '' : v;
    })]);
  });

  if (totalRow) {
    exportRows.push(['TOPLAM', ...metrics.map(m => {
      const v = totalRow[m.label];
      return (v === null || v === undefined) ? '' : v;
    })]);
  }

  const data = window.XLSXWriter.write(exportHeaders, exportRows);
  const ts = new Date().toISOString().slice(0, 10);
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ifs-analiz-' + (analizState.entity || 'veri') + '-' + ts + '.xlsx';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Excel indirildi!');
  addLog('Excel export: ' + rows.length + ' satir', 'ok');
});

// ─── Sıfırla ────────────────────────────────────────────
document.getElementById('btn-analiz-reset').addEventListener('click', () => {
  document.getElementById('analiz-entity').value = '';
  document.getElementById('analiz-groupby').innerHTML = '<option value="">-- Alan seç --</option>';
  document.getElementById('analiz-metric-field').innerHTML = '<option value="">-- Alan --</option>';
  analizState.metrics = [];
  analizState.result = null;
  analizState.records = [];
  renderMetricChips();
  document.getElementById('analiz-result').style.display = 'none';
  document.getElementById('btn-analiz-export').disabled = true;
  showToast('Sıfırlandı');
});

// Entity select'i analiz sekmesinde de doldur
function populateAnalizEntitySelect() {
  const sel = document.getElementById('analiz-entity');
  const curr = sel.value;
  sel.innerHTML = '<option value="">-- Entity seç --</option>';
  cacheData.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.entity;
    opt.textContent = `${e.entity} (${e.recordCount} kayıt)`;
    sel.appendChild(opt);
  });
  if (curr) sel.value = curr;
}

// refreshCache çağrıldığında analiz select'ini de güncelle
const _origRefreshCache = refreshCache;
// refreshCache zaten var, sonunda çağrı ekliyoruz — override yerine listener kullan
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'CACHE_UPDATED') {
    populateAnalizEntitySelect();
  }
});

// Init'te de çağır
document.addEventListener('DOMContentLoaded', populateAnalizEntitySelect);

// ─── BLOK SELECT OTO-DOLDUR ──────────────────────────────
// Cache güncellenince blok select'lerini de doldur
function updateBlockSelects() {
  const biz = cacheData.filter(e => !isSystemEntity(e.entity, e.service));
  document.querySelectorAll('.block-entity-select').forEach(sel => {
    const curr = sel.value;
    sel.innerHTML = '<option value="">-- Yok --</option>';
    biz.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.entity;
      opt.textContent = e.entity + ' (' + e.recordCount + ')';
      sel.appendChild(opt);
    });
    // Otomatik seç: header'dan farklı ilk entity
    const headerVal = document.getElementById('header-entity-select')?.value;
    if (curr && biz.find(e => e.entity === curr)) {
      sel.value = curr; // önceki seçimi koru
    } else if (biz.length > 0) {
      // Header'dan farklı olan ilk entity'i seç
      const lineEnt = biz.find(e => e.entity !== headerVal) || biz[0];
      if (lineEnt) sel.value = lineEnt.entity;
    }
  });
}

// ─── AYARLAR PANELI ────────────────────────────────────────
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => applyLang(btn.dataset.lang));
});

document.getElementById('btn-add-block')?.addEventListener('click', () => {
  addBlockRow();
});

document.querySelectorAll('.btn-remove-block').forEach(btn => {
  btn.addEventListener('click', () => btn.closest('.block-mapping-row').remove());
});

document.getElementById('btn-clear-all-cache')?.addEventListener('click', async () => {
  await chrome.storage.local.set({ dataCache: {} });
  cacheData = [];
  renderEntityList();
  showToast('Cache temizlendi');
});

document.getElementById('btn-clear-templates')?.addEventListener('click', async () => {
  if (!confirm('Tüm şablonlar silinecek. Emin misiniz?')) return;
  await chrome.storage.local.set({ templates: [] });
  selectedTemplate = null;
  selectedTemplateIndex = null;
  await renderTemplateList();
  showToast('Şablonlar silindi');
});

