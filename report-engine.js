// Ahtapot ERP Toolkit — report-engine.js v3
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


  // Inline string şablonları işle (openpyxl/Excel varsayılan formatı)
  // sheetData'yı baştan inşa eder: block öncesi olduğu gibi, inserted rows
  // artan rowNum ile, block sonrası (insertedCount - blockSize) kadar offset.
  async function processInlineStrings(zip, sheetKey, headerData, lineRecords, blockName, allBlocks) {
    allBlocks = allBlocks || { [blockName || 'LINES']: lineRecords };
    let sheetXML = zip[sheetKey];
    const block = blockName || 'LINES';
    const startMarker = '{{#' + block + '}}';
    const endMarker = '{{/' + block + '}}';

    // Tüm <row>'ları rowNum ile birlikte parse et
    const rowFullRe = /<row\s+r="(\d+)"[^>]*>[\s\S]*?<\/row>/g;
    const allRows = [];
    let m;
    while ((m = rowFullRe.exec(sheetXML)) !== null) {
      allRows.push({ xml: m[0], rowNum: parseInt(m[1]) });
    }

    let startIdx = -1, endIdx = -1;
    allRows.forEach((row, i) => {
      if (row.xml.includes(startMarker)) startIdx = i;
      if (row.xml.includes(endMarker)) endIdx = i;
    });

    function rewriteRefs(xml, newRowNum) {
      let out = xml.replace(/<row\s+r="\d+"/, '<row r="' + newRowNum + '"');
      out = out.replace(/<c\s+r="([A-Z]+)\d+"/g, '<c r="$1' + newRowNum + '"');
      return out;
    }

    const newRows = [];

    if (startIdx >= 0 && endIdx > startIdx && lineRecords && lineRecords.length > 0) {
      const templateRows = allRows.slice(startIdx + 1, endIdx);
      const blockStartRowNum = allRows[startIdx].rowNum;
      const blockEndRowNum = allRows[endIdx].rowNum;
      const blockSize = blockEndRowNum - blockStartRowNum + 1;

      // (1) Block öncesi — değişmeden
      for (let i = 0; i < startIdx; i++) newRows.push(allRows[i].xml);

      // (2) Inserted rows — her line × her template row, artan rowNum
      let writeRowNum = blockStartRowNum;
      lineRecords.forEach(lineRec => {
        templateRows.forEach(tRow => {
          let filled = tRow.xml.replace(/\{\{([A-Za-z0-9_@]+)\}\}/g, (_, field) => {
            const v = lineRec[field];
            return (v !== undefined && v !== null) ? esc(String(v)) : '';
          });
          newRows.push(rewriteRefs(filled, writeRowNum));
          writeRowNum++;
        });
      });

      // (3) Block sonrası — offset
      const insertedCount = lineRecords.length * templateRows.length;
      const offset = insertedCount - blockSize;
      for (let i = endIdx + 1; i < allRows.length; i++) {
        const r = allRows[i];
        newRows.push(offset === 0 ? r.xml : rewriteRefs(r.xml, r.rowNum + offset));
      }
    } else if (startIdx >= 0 && endIdx > startIdx) {
      // Lines verisi boş — block'u tamamen kaldır, sonrasını blockSize kadar yukarı kaydır
      const blockSize = allRows[endIdx].rowNum - allRows[startIdx].rowNum + 1;
      for (let i = 0; i < startIdx; i++) newRows.push(allRows[i].xml);
      for (let i = endIdx + 1; i < allRows.length; i++) {
        const r = allRows[i];
        newRows.push(rewriteRefs(r.xml, r.rowNum - blockSize));
      }
    } else {
      // Block bulunamadı — tüm rows olduğu gibi
      for (const r of allRows) newRows.push(r.xml);
    }

    // sheetData'yı yeniden serileştir
    const newSheetData = '<sheetData>' + newRows.join('') + '</sheetData>';
    sheetXML = sheetXML.replace(/<sheetData[^>]*>[\s\S]*?<\/sheetData>/, newSheetData);

    // Header replace — Lines işlendikten sonra
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
  // F-16: çoklu blok desteği. entitySummaries:
  //   [{ entity, fields, sampleRecord, records, blockName, isHeader, displayName }, ...]
  //   - isHeader: true → ana kayıt
  //   - blockName: string → satır bloğu (LINES, APPROVALS, ...)
  // Eski signature (isHeader/blockName olmadan) için fallback: ilk non-line header, geri kalan tek "LINES" bloğu.
  async function generateSampleTemplate(entitySummaries) {
    function isMeta(f) {
      if (META.has(f)) return true;
      if (f.startsWith('@')) return true;
      if (f.includes('@')) return true;
      if (f.includes('_aggr_')) return true;
      if (f.endsWith('navigationLink')) return true;
      if (f.endsWith('@odata.type')) return true;
      return false;
    }

    // Header + bloklar belirle (yeni signature varsa onu kullan)
    let header = entitySummaries.find(e => e.isHeader);
    let blockEntries = entitySummaries
      .filter(e => !e.isHeader && e.blockName)
      .map(e => ({ blockName: e.blockName, ent: e }));

    // Geriye uyumluluk: eski signature
    if (!header && !blockEntries.length) {
      header = entitySummaries.find(e =>
        !e.entity.toLowerCase().includes('line') &&
        !e.entity.toLowerCase().includes('row') &&
        !e.entity.toLowerCase().includes('part')
      ) || entitySummaries[0];
      const line = entitySummaries.find(e => e !== header);
      if (line) blockEntries = [{ blockName: 'LINES', ent: line }];
    }

    const hdrs = ['Alan Adı', 'Şablon Etiketi', 'Örnek Değer', 'Açıklama'];
    const rows = [];

    rows.push(['─── SİSTEM ───', '', '', 'Otomatik doldurulur']);
    rows.push(['Bugün', '{{TODAY}}', new Date().toLocaleDateString('tr-TR'), 'Rapor tarihi']);
    rows.push(['Şu An', '{{NOW}}', new Date().toLocaleString('tr-TR'), 'Rapor zamanı']);
    rows.push(['Ortam', '{{ENV}}', typeof window !== 'undefined' ? window.location.hostname : '', 'ERP ortamı']);
    rows.push(['', '', '', '']);

    if (header) {
      const hFields = (header.fields || []).filter(f => !isMeta(f));
      const label = header.displayName ? header.displayName + ' — ' + header.entity : header.entity;
      rows.push(['─── ' + label + ' (HEADER) ───', '', '', 'Ana kayıt alanları']);
      if (hFields.length) {
        hFields.forEach(f => {
          const v = header.sampleRecord ? header.sampleRecord[f] : '';
          rows.push([f, '{{' + f + '}}', v == null ? '' : String(v), '']);
        });
      } else {
        rows.push(['(Sayfada henüz yakalanmamış)', '', '', 'Excel İndir bastığında auto-fetch ile dolacak']);
      }
      rows.push(['', '', '', '']);
    }

    blockEntries.forEach(({ blockName, ent }) => {
      const lFields = (ent.fields || []).filter(f => !isMeta(f));
      const label = ent.displayName ? ent.displayName + ' — ' + ent.entity : ent.entity;
      rows.push(['─── ' + label + ' (BLOK: ' + blockName + ') ───', '', '', 'Satır bloğu']);
      rows.push(['BLOK BAŞI', '{{#' + blockName + '}}', '', 'Bu satır blok başlangıcını işaretler']);
      if (lFields.length) {
        lFields.forEach(f => {
          const v = ent.records && ent.records[0] ? ent.records[0][f] : '';
          rows.push([f, '{{' + f + '}}', v == null ? '' : String(v), '']);
        });
      } else {
        rows.push(['(Sayfada henüz yakalanmamış)', '', '', 'Excel İndir bastığında auto-fetch ile dolacak']);
      }
      rows.push(['BLOK SONU', '{{/' + blockName + '}}', '', 'Bu satır blok bitişini işaretler']);
      rows.push(['', '', '', '']);
    });

    rows.push(['── KULLANIM ──', '', '', '']);
    rows.push(['1. Bu dosyayı Excel\'de açın ve yeni bir sekme ekleyin', '', '', '']);
    rows.push(['2. Şablon Etiketi sütunundaki {{...}} ifadelerini', '', '', '']);
    rows.push(['   raporunuzda istediğiniz hücrelere yerleştirin', '', '', '']);
    rows.push(['3. BLOK BAŞI ve BLOK SONU etiketleri satır tablosu için', '', '', '']);
    rows.push(['   tablo şablonunuzun üstüne ve altına koyun', '', '', '']);
    rows.push(['4. Dosyayı kaydedin ve Şablon Yükle ile yükleyin', '', '', '']);

    // F-16 Faz 1.7: header + blok eşleştirmesini xlsx'in docProps/custom.xml
    // dosyasına göm. Şablon yüklendiğinde analyzeTemplate bu meta'yı okur,
    // popup blok-mapping satırlarını otomatik doldurur (kullanıcı manuel
    // eşleştirme yapmak zorunda kalmaz).
    const mapping = {
      header: header ? header.entity : null,
      blocks: blockEntries.map(b => ({ name: b.blockName, entity: b.ent.entity }))
    };
    const customXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties"'
      + ' xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
      + '<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="AhtapotMapping">'
      + '<vt:lpwstr>' + esc(JSON.stringify(mapping)) + '</vt:lpwstr>'
      + '</property></Properties>';

    return window.XLSXWriter.write(hdrs, rows, {
      files: { 'docProps/custom.xml': customXml },
      contentTypes: '<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>',
      rels: '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/>'
    });
  }

  // ── Şablon analizi ───────────────────────────────────────
  async function analyzeTemplate(templateBuffer) {
    try {
      // parseZipAsync: deflate destekli (Excel-kaydet sonrası deflate'lenmiş custom.xml de okunur)
      const zip = await parseZipAsync(new Uint8Array(templateBuffer));
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

      // F-16 Faz 1.7: docProps/custom.xml'den AhtapotMapping meta'sını oku.
      // Ahtapot ile üretilen şablonlar header + blok entity eşleştirmesini buraya gömer.
      // Bulunursa analysis.headerEntity ve analysis.blocks[i].entity otomatik doldurulur.
      let headerEntity = null;
      const blockEntityMap = {};
      if (zip['docProps/custom.xml']) {
        const m = zip['docProps/custom.xml']
          .match(/name="AhtapotMapping"[^>]*>[\s\S]*?<vt:lpwstr>([\s\S]*?)<\/vt:lpwstr>/);
        if (m) {
          try {
            const decoded = m[1]
              .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'");
            const mapping = JSON.parse(decoded);
            headerEntity = mapping.header || null;
            (mapping.blocks || []).forEach(b => {
              if (b && b.name) blockEntityMap[b.name] = b.entity || '';
            });
          } catch(e) {}
        }
      }

      return {
        headerPlaceholders: [...hPH],
        blocks: Object.keys(blocks).map(name => ({
          name,
          placeholders: [],
          entity: blockEntityMap[name] || ''
        })),
        headerEntity
      };
    } catch(e) {
      return { headerPlaceholders:[], blocks:[] };
    }
  }

  return { generateReport, generateSampleTemplate, analyzeTemplate, _parseZipAsync: parseZipAsync };
})();

window.IFSReportEngine = ReportEngine;

