// static/js/main.js

'use strict';

// 全域狀態：記錄點選列
window.selectedRowIndex = null;
window.selectedKey = null;

/**
 * 記錄並高亮使用者點選的列
 * @param {number} idx - 資料列索引（從 1 開始）
*/
function rememberRow(idx) {
    var table = document.getElementById('resultTable');
    if (!table) return;
    // 取得並記錄新的 key
    var key = table.rows[idx].cells[0].innerText;
    window.selectedKey = key;
    // 重新高亮
    highlightSelectedRow();
}

/**
 * 根據 window.selectedKey，為對應列加上 .selected-row，高亮；其餘移除
*/
function highlightSelectedRow() {
    var table = document.getElementById('resultTable');
    if (!table || !window.selectedKey) return;
    Array.from(table.rows).forEach(function(row, i) {
      if (i === 0) return; // 跳過表頭
      var key = row.cells[0].innerText;
      if (key === window.selectedKey) {
        row.classList.add('selected-row');
      } else {
        row.classList.remove('selected-row');
      }
    });
}

/**
 * 清除所有搜尋狀態、重置索引，移除高亮
*/
function clearSearch() {
    // 清空關鍵字
    document.getElementById('keyword').value = '';
    // 重設選取列索引
    window.selectedRowIndex = null;
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
}

// 平滑捲動回表格
function scrollBackToTable() {
  console.log("執行 scrollBackToTable(), idx =", window.selectedRowIndex);
  var table = document.getElementById('resultTable');
  if (!table) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  var rows = table.getElementsByTagName('tr');
  // 用經號找對應那列
  var key = window.selectedKey;
  if (!key) { rows[1].scrollIntoView({ behavior:'smooth', block:'center' }); return; }
  for (var i = 1; i < rows.length; i++) {
    if (rows[i].cells[0].innerText === key) {
      rows[i].scrollIntoView({ behavior:'smooth', block:'center' });
      return;
    }
  }
}

// 平滑捲動頂部／底部
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function scrollToBottom() {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
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
         + '<td><a href="#sutra-' + key + '" onclick="rememberRow(' + rowIndex + ')">' + key + '</a></td>'
         + '<td>' + pg + '</td>'
         + '<td><a href="#sutra-' + key + '" onclick="rememberRow(' + rowIndex + ')">' + item.title + '</a></td>'
         + '<td>' + (item.count || '') + '</td>'
         + '</tr>';
  });

  html += '</tbody></table>';
  document.getElementById('resultContainer').innerHTML = html;

  // 搜尋成功後顯示 CSV 按鈕
  var csvContainer = document.getElementById('csvContainer');
  if (csvContainer) csvContainer.classList.remove('hidden');  
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

  keys.forEach(function(key) {
    var item = items[key];
    var pg = item.pages ? Object.keys(item.pages).length : 0;
    var cnt = parseInt(item.count) || 0;
    html += '<hr><p id="sutra-' + key + '" class="content-header">'
         + '(<strong>' + key + '</strong>) ' + item.title
         + ' (卷數：' + pg + '，名相筆數：' + cnt + ')</p>';

    if (Array.isArray(item.paragraphs)) {
      item.paragraphs.forEach(function(p) {
        var highlighted = p.replace(new RegExp('(' + escapeRegExp(keyword) + ')', 'g'),
                                    '<span class="highlight">$1</span>');
        html += '<p>' + highlighted + '</p>';
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
  
    // 排序後，重新套用高亮並更新 selectedRowIndex
    highlightSelectedRow();
  
    // 修正：再次確保 selectedRowIndex 正確
    // （highlightSelectedRow 會依 selectedKey 設定 selectedRowIndex）
    if (window.selectedKey && table) {
      // 沒必要做額外動作，selectedRowIndex 已在 highlightSelectedRow 中更新
    }
  }

function calculateVolume(items) {
  return Object.values(items).reduce((s,it) => s + (it.pages?Object.keys(it.pages).length:0), 0);
}
function calculateAppear(items) {
  return Object.values(items).reduce((s,it) => s + (parseInt(it.count)||0), 0);
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\\\]\\]/g, '\\\\$&');
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

