// static/js/main.js

'use strict';

// 全域狀態：記錄點選列
window.selectedKey = null;

/**
 * 根據經號 key，記錄使用者點選的經文列並高亮
 */
function rememberKey(e, key) {
  e.preventDefault(); // 防止預設跳轉動作
  console.log("記錄選取的經號:", key);
  window.selectedKey = key;
  highlightSelectedRow();

  // 平滑移動至內文區對應段落
  const target = document.getElementById('sutra-' + key);
  if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}


/**
 * 根據 window.selectedKey，為對應列加上 .selected-row，高亮；其餘移除
*/
function highlightSelectedRow() {
  const table = document.getElementById('resultTable');
  if (!table) {
      console.warn("⚠ 找不到 resultTable");
      return;
  }

  let matched = false;
  const targetKey = (window.selectedKey || '').trim();

  Array.from(table.rows).forEach((row, index) => {
      if (index === 0) return; // 跳過表頭
      const key = row.cells[0].innerText.trim();

      if (key === targetKey) {
          row.classList.remove('selected-row');  // 保險：避免樣式未刷新
          row.classList.add('selected-row');
          matched = true;
          console.log("✅ 高亮列:", key);
      } else {
          row.classList.remove('selected-row');
      }
  });

  if (!matched && targetKey) {
      console.warn("⚠ 找不到符合的 selectedKey:", targetKey, "可能尚未渲染完成");
  }
}


/**
 * 清除所有搜尋狀態、重置索引，移除高亮
*/
function clearSearch() {
    console.log("清除所有搜尋狀態，包括背景高亮");
    // 清空關鍵字
    document.getElementById('keyword').value = '';
    // 重設選取列索引
    window.selectedKey = null;
    // 移除所有被選取標記
    var rows = document.querySelectorAll('#resultContainer tr');
    rows.forEach(r => r.classList.remove('selected-row'));
    // 清空結果區與內文區
    document.getElementById('resultContainer').innerHTML = '';
    document.getElementById('textContainer').innerHTML = '';
    // 隱藏 CSV 按鈕
    document.getElementById('csvContainer').classList.add('hidden');
}

function clearSearchResults() {
    document.getElementById("searchStatus").innerHTML = "";
    document.getElementById("resultContainer").innerHTML = "";
    document.getElementById("csvContainer").classList.add("hidden");
    document.getElementById("textContainer").innerHTML = "";
    window.selectedKey = null;    
}

// 平滑捲動回表格
function scrollBackToTable() {
  console.log("執行 scrollBackToTable(), selectedKey =", window.selectedKey);
  const table = document.getElementById('resultTable');
  if (!table) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
  }
  const rows = table.getElementsByTagName('tr');
  const key = (window.selectedKey || '').trim();

  // 確保高亮狀態正確（可能排序後消失）
  // 延遲套用高亮，確保滾動與 DOM 重排已完成
  setTimeout(() => {
    highlightSelectedRow();
  }, 150);
  if (!key) {
      if (rows.length > 1) rows[1].scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
  }
  for (let i = 1; i < rows.length; i++) {
      const rowKey = rows[i].cells[0].innerText.trim();
      if (rowKey === key) {
          rows[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
      }
  }
  console.warn("⚠ 找不到對應 key 的列: ", key);
}

// 平滑捲動頂部／底部
function scrollToTop() {
  console.log("執行 scrollToTop(), selectedKey =", window.selectedKey);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  // 延遲套用高亮，確保滾動與 DOM 重排已完成
  setTimeout(() => {
    highlightSelectedRow();
  }, 150); 
}
function scrollToBottom() {
  console.log("執行 scrollToBottom(), selectedKey =", window.selectedKey);
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  // 延遲套用高亮，確保滾動與 DOM 重排已完成
  setTimeout(() => {
    highlightSelectedRow();
  }, 150);
}

// 發送搜尋請求
function searchKeyword() {
  var kw = document.getElementById('keyword').value.trim();
  if (!kw) return;
  console.log("搜尋關鍵字:", kw);

  document.getElementById('resultContainer').innerHTML = '';
  document.getElementById('textContainer').innerHTML = '';

  fetch('/search_ajax', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'keyword=' + encodeURIComponent(kw),
  })
    .then(r => r.json())
    .then(function(data) {
      if (data.error) {
        alert(data.error);
        return;
      }
      var items = data.data || {};
      if (Object.keys(items).length === 0) {
        document.getElementById('resultContainer').innerHTML =
          '<p>沒有找到匹配的經文。</p>';
        return;
      }
      renderTable(items);
      renderContent(items, kw);
    });
}

// 渲染表格
function renderTable(items) {
  var keys = Object.keys(items);
  var html = '<table id="resultTable" data-sort-col="-1" data-sort-dir="asc"><thead><tr>'
           + '<th onclick="sortTable(0)">'
             + '<span class="header-label">經號</span>'
             + '<span class="sort-icon">&#9650;&#9660;</span>'
           + '</th>'
           + '<th onclick="sortTable(1)">'
             + '<span class="header-label">卷數</span>'
             + '<span class="sort-icon">&#9650;&#9660;</span>'
           + '</th>'
           + '<th onclick="sortTable(2)">'
             + '<span class="header-label">經名</span>'
             + '<span class="sort-icon">&#9650;&#9660;</span>'
           + '</th>'
           + '<th onclick="sortTable(3)">'
             + '<span class="header-label">名相總筆數</span>'
             + '<span class="sort-icon">&#9650;&#9660;</span>'
           + '</th>'
           + '</tr></thead><tbody>';

  keys.forEach(function(key, i) {
    var item = items[key];
    var pg = item.pages ? Object.keys(item.pages).length : 0;
    var rowIndex = i + 1;
    html += '<tr>'
     + `<td><a href="#sutra-${key}" onclick="rememberKey(event, '${key}')">${key}</a></td>`
     + `<td>${pg}</td>`
     + `<td><a href="#sutra-${key}" onclick="rememberKey(event, '${key}')">${item.title}</a></td>`
     + `<td>${item.count || ''}</td>`
     + '</tr>';
  });

  html += '</tbody></table>';
  document.getElementById('resultContainer').innerHTML = html;

  // 搜尋成功後顯示 CSV 按鈕
  var csvContainer = document.getElementById('csvContainer');
  if (csvContainer) csvContainer.classList.remove('hidden');  

  // ⏱ 確保表格渲染完成後再套用高亮
  setTimeout(() => {
    highlightSelectedRow();
  }, 100);  // 延遲一點時間確保 DOM 完成  
}

/**
 * 產生並下載 CSV
 */
function downloadCSV() {
    var rows = document.querySelectorAll('#resultTable tr');
    var csv  = [];
    rows.forEach(function(row) {
      var cols = row.querySelectorAll('th, td');
      var vals = Array.from(cols).map(function(c) {
          return '"' + c.innerText.replace(/"/g, '""') + '"';
      });
      csv.push(vals.join(','));
    });
    var blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'results.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function downloadXLSX() {
    var table = document.getElementById('resultTable');
    if (!table) return;
    // 使用 SheetJS 直接將 table 轉成 worksheet
    var ws = XLSX.utils.table_to_sheet(table);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '搜尋結果');
    // 下載 XLSX 檔案 
    XLSX.writeFile(wb, 'results.xlsx');
}

// 渲染關鍵字內文
function renderContent(items, keyword) {
  var keys = Object.keys(items);
  var volSum = calculateVolume(items);
  var appearSum = calculateAppear(items);
  var html = '<hr><h3>關鍵字相關內文（經號總數:' + keys.length
           + '，卷數總計:' + volSum
           + '，出現次數:' + appearSum
           + '）</h3>';

  // 解析關鍵字，構建正則表達式和高亮策略
  const highlightInfo = buildHighlightRegexAndInfo(keyword); 

  keys.forEach(function(key) {
    var item = items[key];
    var pg = item.pages ? Object.keys(item.pages).length : 0;
    var cnt = parseInt(item.count) || 0;
    html += '<hr><p id="sutra-' + key + '" class="content-header">'
         + '(<strong>' + key + '</strong>) ' + item.title
         + ' (卷數：' + pg + '，名相筆數：' + cnt + ')</p>';

    if (Array.isArray(item.paragraphs)) {
      item.paragraphs.forEach(function(p) {
        // 使用新的高亮函式
        html += '<p>' + applySmartHighlight(p, highlightInfo) + '</p>';
      });
    }
  });

  document.getElementById('textContainer').innerHTML = html;
}

// 排序、統計、工具函式
function sortTable(col) {
    var table = document.getElementById('resultTable');
    var rows  = Array.prototype.slice.call(table.rows, 1);
    var curCol = parseInt(table.getAttribute('data-sort-col'));
    var curDir = table.getAttribute('data-sort-dir') === 'asc';
    var asc    = (curCol === col) ? !curDir : true;
  
    // 排序內容
    rows.sort(function(a, b) {
      var x = a.cells[col].innerText;
      var y = b.cells[col].innerText;
      return (!isNaN(x) && !isNaN(y)) ? x - y : x.localeCompare(y);
    });
    if (!asc) rows.reverse();
    rows.forEach(r => table.tBodies[0].appendChild(r));
  
    // 更新欄位屬性
    table.setAttribute('data-sort-col', col);
    table.setAttribute('data-sort-dir', asc ? 'asc' : 'desc');
  
    // 更新箭頭顯示
    var ths = table.querySelectorAll('th');
    ths.forEach(function(th, idx) {
      var icon = th.querySelector('.sort-icon');
      if (!icon) return;
      icon.textContent = (idx === col) ? (asc ? '▲' : '▼') : '▲▼';
    });
  
    // 排序後，重新套用高亮並更新 selectedKey 
    highlightSelectedRow();

  }

function calculateVolume(items) {
  return Object.values(items).reduce((s,it) => s + (it.pages?Object.keys(it.pages).length:0), 0);
}
function calculateAppear(items) {
  return Object.values(items).reduce((s,it) => s + (parseInt(it.count)||0), 0);
}

// ------------------------------------------
// 核心高亮邏輯修改
// ------------------------------------------

/**
 * 構建正則表達式和高亮資訊。
 * 根據關鍵字中的 '*' 位置，判斷哪些部分應該被高亮。
 * 規則：所有字面文字和 '*' 匹配的字元都高亮。
 * '*' 匹配的字元範圍限制為中文字、英文字母和數字，以避免標點符號高亮。
 *
 * @param {string} keyword - 原始關鍵字字串，可能包含 '*'
 * @returns {{regex: RegExp, partsToHighlight: Array<number>}} 包含正則表達式和需要高亮的捕獲組索引數組。
 */
function buildHighlightRegexAndInfo(keyword) {
    let regexPattern = '';
    const partsToHighlight = []; // 儲存需要高亮的捕獲組索引
    let groupIndex = 1; // 捕獲組從 1 開始計數

    // 將關鍵字拆分為單個字元或連續的非 '*' 字串
    const segments = [];
    let currentSegment = '';
    for (let i = 0; i < keyword.length; i++) {
        if (keyword[i] === '*') {
            if (currentSegment !== '') {
                segments.push(currentSegment);
                currentSegment = '';
            }
            segments.push('*'); // 每個 '*' 作為獨立片段
        } else {
            currentSegment += keyword[i];
        }
    }
    if (currentSegment !== '') {
        segments.push(currentSegment);
    }

    // 遍歷所有片段，構建正則表達式模式和高亮策略
    segments.forEach(segment => {
        if (segment === '*') {
            // 處理萬用字元 '*'
            // 匹配中文字元、數字和英文字母，不包含標點符號和空格。
            // 使用常見的中文、英文、數字範圍更穩妥。
            regexPattern += '([\\u4e00-\\u9fa5a-zA-Z0-9])'; // 每個 '*' 匹配一個有效「字」，並使用捕獲組
            partsToHighlight.push(groupIndex); // 所有 '*' 匹配的內容都高亮
            groupIndex++;
        } else {
            // 處理字面文字
            // 將字面文字中的特殊字元轉義，並作為捕獲組
            regexPattern += '(' + segment.replace(/[.*+?^${}()|[\\\]\\]/g, '\\$&') + ')'; 
            partsToHighlight.push(groupIndex); // 字面文字總是高亮
            groupIndex++;
        }
    });

    return {
        // 使用 'g' 標誌確保全局匹配所有出現的關鍵字模式
        regex: new RegExp(regexPattern, 'g'),
        partsToHighlight: partsToHighlight
    };
}


/**
 * 應用智慧型高亮邏輯。
 * @param {string} text - 原始段落文本。
 * @param {{regex: RegExp, partsToHighlight: Array<number>}} highlightInfo - 包含正則表達式和需要高亮的捕獲組索引。
 * @returns {string} 包含高亮標籤的 HTML 字串。
 */
function applySmartHighlight(text, highlightInfo) {
    const regex = highlightInfo.regex;
    const partsToHighlight = highlightInfo.partsToHighlight;

    if (!text || !regex) {
        return text;
    }

    let lastIndex = 0;
    let resultHtml = '';
    let match;

    // 使用 regex.exec() 迭代所有匹配
    // 這個循環會找到所有符合 `regex` 模式的子字串
    while ((match = regex.exec(text)) !== null) {
        // 將當前匹配之前的文本添加到結果中 (非高亮部分)
        resultHtml += text.substring(lastIndex, match.index);

        // 拼接匹配到的各部分，並根據 partsToHighlight 決定是否高亮
        let currentMatchHtml = '';
        // match[0] 是整個匹配到的字串
        // match[1], match[2], ... 是每個捕獲組的內容
        for (let i = 1; i < match.length; i++) {
            const capturedText = match[i] || ''; // 確保即使沒有捕獲到也為空字串
            if (partsToHighlight.includes(i)) {
                // 如果這個捕獲組的索引在需要高亮的列表中，則高亮
                currentMatchHtml += `<span class="highlight">${capturedText}</span>`;
            } else {
                // 否則，不高亮
                currentMatchHtml += capturedText;
            }
        }
        // 將處理過的高亮/不高亮部分添加到結果中
        resultHtml += currentMatchHtml;

        // 更新 lastIndex 到當前匹配的結束位置
        lastIndex = match.index + match[0].length;

        // 處理零寬度匹配導致的無限循環 (對於這裡的模式，通常不會發生，但作為最佳實踐保留)
        if (match[0].length === 0) {
            regex.lastIndex++;
        }
    }

    // 將最後一部分文本（在所有匹配之後的部分）添加到結果中
    resultHtml += text.substring(lastIndex);

    return resultHtml;
}


// 綁定 Enter 觸發搜尋
document.addEventListener('DOMContentLoaded', function() {
  var input = document.getElementById('keyword');
  input && input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') searchKeyword();
  });
});

// 綁定 ESC 鍵觸發清除
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') clearSearch();
});

