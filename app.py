import os
import json
import logging
import re
import unicodedata
from logging.handlers import RotatingFileHandler
from flask import Flask, request, jsonify, abort
# from bs4 import BeautifulSoup
# import concurrent.futures
from modules import search_epub  # 從 modules 目錄導入

# 在網頁 "經文名相查詢" 右邊, 用灰色小字顯示 "更新日期: {UPDATE_DATE}"
UPDATE_DATE = '2025/04/26'

MY_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# 設定目錄
CACHE_DIR = os.path.join(MY_SCRIPT_DIR, "cache")    # 存放預先處理好的 JSON
EPUB_DIR = os.path.join(MY_SCRIPT_DIR, "epubs")       # 存放 EPUB 檔案
os.makedirs(CACHE_DIR, exist_ok=True)

app = Flask(__name__)

# 創建 logger
logger = logging.getLogger('app.py' + UPDATE_DATE)
logger.setLevel(logging.INFO)

# 建立 stream handler (輸出到 console)
stream_handler = logging.StreamHandler()
stream_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
stream_handler.setFormatter(stream_formatter)
logger.addHandler(stream_handler)

# 新增 RotatingFileHandler, 寫到子目錄 logs/app.log
# LOGS_DIR = os.path.join(MY_SCRIPT_DIR, "logs")        # 日誌存放目錄
# os.makedirs(LOGS_DIR, exist_ok=True)
# log_file = os.path.join(LOGS_DIR, "app.log")
# file_handler = RotatingFileHandler(log_file, mode='a', maxBytes=5*1024*1024, backupCount=5, encoding='utf-8')
# file_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
# file_handler.setFormatter(file_formatter)
# logger.addHandler(file_handler)

# 讀取書籍資料 (titles.json)
# 結構範例: { "大正藏密教部經典清單-614本.docx": { "T0848": ["7", "大毘盧遮那成佛神變加持經"], ... } }
BOOK_JSON_PATH = os.path.join(MY_SCRIPT_DIR, "titles", "titles.json")
books_dict = {}
try:
    with open(BOOK_JSON_PATH, "r", encoding="utf-8") as f:
        full_data = json.load(f)
        if isinstance(full_data, dict) and full_data:
            if len(full_data) == 1:
                key0 = list(full_data.keys())[0]
                if isinstance(full_data[key0], dict):
                    books_dict = full_data[key0]
                else:
                    books_dict = full_data
            else:
                books_dict = full_data
            logger.info(f"成功載入 titles.json，包含 {len(books_dict)} 本書")
        else:
            logger.error("titles.json 格式不正確")
            raise ValueError("titles.json 格式不正確")
except Exception as e:
    logger.error(f"讀取 titles.json 時發生錯誤: {e}")
    raise RuntimeError("初始化失敗：無法載入 titles.json")

@app.route("/search_ajax", methods=["POST"])
def search_ajax():
    keyword = request.form.get("keyword", "").strip()
    if not keyword:
        return jsonify({"error": "請輸入關鍵字"})
    
    # 使用 search_epub.sanitize_filename 將 "*" 替換為 "～"
    safe_keyword = search_epub.sanitize_filename(keyword)
    # 保留原始 cache 檔名，不加入 MD5 後綴
    cache_filename = f"{safe_keyword}.json"
    json_file = os.path.join(CACHE_DIR, cache_filename)
    
    logger.info(f"keyword = {keyword}, safe_keyword = {safe_keyword}, cache_filename = {cache_filename}")
    results = None
    if os.path.exists(json_file):
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                results = json.load(f)
                logger.info("The stat of return result:\n" + json.dumps(results.get("_stat_", {}), ensure_ascii=False, indent=4))
        except json.JSONDecodeError:
            logger.warning(f"⚠️ JSON 格式錯誤，刪除無效 cache: {json_file}")
            os.remove(json_file)
    
    if results is None:
        logger.info(f"🔍 在 cache/ 找不到 '{cache_filename}'，開始搜尋 EPUB 檔案...")
        epub_paths = [
            os.path.join(EPUB_DIR, fname)
            for fname in os.listdir(EPUB_DIR)
            if fname.lower().endswith('.epub')
        ]
        results = search_epub.search_wildcard_multiple_epubs_stat(epub_paths, keyword, logger)
        logger.info("The stat of return result:\n" + json.dumps(results.get("_stat_", {}), ensure_ascii=False, indent=4))
        try:
            with open(json_file, 'w', encoding='utf-8') as f:
                json.dump(results, f, ensure_ascii=False, indent=4)
            logger.info(f"Saved result to {json_file}")
        except Exception as e:
            logger.error(f"寫入 cache 檔案失敗: {e}")
    
    # 將搜尋結果轉換成前端所需格式，依據 books_dict 查詢 note 與 title
    transformed = {}
    for key, value in results.items():
        if key == "_stat_":
            continue
        entry = {}
        entry["book_key"] = key
        if key in books_dict and isinstance(books_dict[key], list) and len(books_dict[key]) >= 2:
            entry["note"] = books_dict[key][0]
            entry["title"] = books_dict[key][1]
        else:
            entry["note"] = ""
            entry["title"] = key

        entry["count"] = value.get("total", 0)

        # 收集所有匹配段落
        paragraphs = []
        if "sentences" in value:
            for sub_key, snippet_list in value["sentences"].items():
                paragraphs.extend(snippet_list)

        # 以「關鍵字在段落中出現>=2次」為條件，做子字串比對去重
        deduped = []
        first_sub = None
        for para in paragraphs:
            # 找出關鍵字在段落中的所有位置
            occs = [m.start() for m in re.finditer(re.escape(keyword), para)]
            # 出現不足兩次：一定保留，並重置 first_sub
            if len(occs) < 2:
                deduped.append(para)
                first_sub = None
                continue

            # 擷取「第一個關鍵字前5字」到「最後一個關鍵字後」之子字串
            start_idx = max(0, occs[0] - 5)
            end_idx = occs[-1] + len(keyword)
            sub = para[start_idx:end_idx]

            if first_sub is None:
                # 第一個含重複字串段落：保留並設為 first_sub
                deduped.append(para)
                first_sub = sub
            else:
                if first_sub.find(sub) != -1:
                    # 重複段落：跳過
                    logger.info(f"跳過重複內文，子字串：{sub}")
                    continue
                else:
                    # 新子字串不在 first_sub 內：保留，並更新 first_sub
                    deduped.append(para)
                    first_sub = sub

        entry["paragraphs"] = deduped
        
        # 注意：這裡原 note 改成以 pages 的 key 數量表示卷數，供表格顯示使用
        entry["pages"] = value.get("pages", {})
        transformed[key] = entry
        logger.info("entry = " + str(entry))

    output = {
        "data": transformed,
        "_stat_": results.get("_stat_", {})
    }
    return jsonify(output)

@app.route("/", methods=["GET"])
def index():
    # 此 f-string 僅替換 {UPDATE_DATE}，其他 JavaScript 部分原封不動輸出
    return f"""
    <html>
    <head>
      <meta charset="utf-8">
      <title>經文名相查詢</title>
      <style>
        body {{ font-size: 18px; }}
        h1 {{ font-size: 24px; }}
        input, button {{ font-size: 18px; padding: 8px 12px; }}
        input[type="text"] {{ width: 450px; }}
        table {{ font-size: 18px; border-collapse: collapse; width: 100%; }}
        th, td {{ border: 1px solid #999; padding: 10px; text-align: left; }}
        th {{ cursor: pointer; user-select: none; font-size: 18px; }}
        #searchStatus {{ font-size: 20px; font-weight: bold; margin-top: 10px; margin-bottom: 10px; }}
        .hidden {{ display: none; }}
        .scroll-btn {{
        position: fixed;
        right: 20px;
        width: 40px;
        height: 40px;
        background: rgba(0, 0, 0, 0.5);
        border: none;
        border-radius: 50%;
        color: #fff;
        font-size: 24px;
        cursor: pointer;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.6;
        transition: opacity 0.2s;
        }}
        .scroll-btn:hover {{
        opacity: 1;
        }}
        .scroll-btn-top   {{ bottom: 80px; }}
        .scroll-btn-bottom{{ bottom: 20px; }}
      </style>
      <script>
      // 定義 escapeRegExp 函式以處理關鍵字中的特殊字元
      function escapeRegExp(string) {{
          return string.replace(/[.*+?^{{}}()|[\\]\\\\]/g, '\\\\$&');
      }}

      var sortDirections = {{}};

      function sortTableByColumn(tableId, colIndex) {{
          var table = document.getElementById(tableId);
          var tbody = table.getElementsByTagName("tbody")[0];
          var rows = Array.from(tbody.getElementsByTagName("tr"));
          sortDirections[colIndex] = (sortDirections[colIndex] === "asc") ? "desc" : "asc";
          var direction = sortDirections[colIndex];
          rows.sort(function(a, b) {{
              var aText = a.getElementsByTagName("td")[colIndex].innerText.trim().toLowerCase();
              var bText = b.getElementsByTagName("td")[colIndex].innerText.trim().toLowerCase();
              var aNum = parseFloat(aText);
              var bNum = parseFloat(bText);
              if (!isNaN(aNum) && !isNaN(bNum)) {{
                  return direction === "asc" ? aNum - bNum : bNum - aNum;
              }}
              if (aText < bText) return direction === "asc" ? -1 : 1;
              if (aText > bText) return direction === "asc" ? 1 : -1;
              return 0;
          }});
          rows.forEach(function(row) {{
              tbody.appendChild(row);
          }});
          var headers = table.getElementsByTagName("th");
          for (var i = 0; i < headers.length; i++) {{
              var iconSpan = headers[i].querySelector(".sort-icon");
              if (i == colIndex) {{
                  iconSpan.innerHTML = direction === "asc" ? "&#x25B2;" : "&#x25BC;";
              }} else {{
                  iconSpan.innerHTML = "&#x25B2;&#x25BC;";
              }}
          }}
      }}

      function sortTable(colIndex) {{
          sortTableByColumn("resultTable", colIndex);
      }}

      function searchKeyword() {{
          var keyword = document.getElementById("keyword").value.trim();
          var searchStatus = document.getElementById("searchStatus");
          var resultContainer = document.getElementById("resultContainer");
          var csvContainer = document.getElementById("csvContainer");
          var textContainer = document.getElementById("textContainer");

          if (!keyword) {{
              resultContainer.innerHTML = "<p style='color:red;'>請輸入關鍵字</p>";
              csvContainer.classList.add("hidden");
              textContainer.innerHTML = "";
              return;
          }}
          clearSearchResults();
          var startTime = performance.now();
          var elapsedTime = 0;
          searchStatus.innerHTML = "<span style=\\"color:red;\\">搜尋中, 費時 " + elapsedTime.toFixed(2) + " 秒...</span>";
          
          var timer = setInterval(function() {{
              elapsedTime = (performance.now() - startTime) / 1000;
              searchStatus.innerHTML = "<span style=\\"color:red;\\">搜尋中, 費時 " + elapsedTime.toFixed(0) + " 秒...</span>";
          }}, 1000);

          fetch("/search_ajax", {{
              method: "POST",
              headers: {{ "Content-Type": "application/x-www-form-urlencoded" }},
              body: "keyword=" + encodeURIComponent(keyword)
          }})
          .then(function(response) {{ return response.json(); }})
          .then(function(data) {{
              clearInterval(timer);
              var endTime = performance.now();
              var searchTime = ((endTime - startTime) / 1000).toFixed(0);
              searchStatus.innerHTML = "<span style=\\"color:black;\\">搜尋完畢, 費時 " + searchTime + " 秒.</span>";
              var items = data.data || {{}};
              if (Object.keys(items).length === 0) {{
                  resultContainer.innerHTML = "<p>沒有找到匹配的經文。</p>";
                  csvContainer.classList.add("hidden");
                  textContainer.innerHTML = "";
              }} else {{
                  var tableHTML = "<table id='resultTable'><thead><tr>" +
                                  "<th onclick='sortTable(0)'><span class='header-label'>經號</span> <span class='sort-icon'>&#x25B2;&#x25BC;</span></th>" +
                                  // 卷數改為 pages 物件中 key 的數量
                                  "<th onclick='sortTable(1)'><span class='header-label'>卷數</span> <span class='sort-icon'>&#x25B2;&#x25BC;</span></th>" +
                                  "<th onclick='sortTable(2)'><span class='header-label'>經名</span> <span class='sort-icon'>&#x25B2;&#x25BC;</span></th>" +
                                  "<th onclick='sortTable(3)'><span class='header-label'>名相總筆數</span> <span class='sort-icon'>&#x25B2;&#x25BC;</span></th>" +
                                  "</tr></thead><tbody>";
                  var totalBookCount = 0, totalVol = 0, totalCount = 0;
                  for (var key in items) {{
                      var item = items[key];
                      totalBookCount++;
                      var pageCount = (item.pages && typeof item.pages === 'object') ? Object.keys(item.pages).length : 0;
                      totalVol += pageCount;
                      if (item.count && !isNaN(parseInt(item.count))) {{
                          totalCount += parseInt(item.count);
                      }}
                      tableHTML += "<tr>" +
                                   "<td>" + (item.book_key || "") + "</td>" +
                                   "<td>" + pageCount + "</td>" +
                                   "<td>" + (item.title || "") + "</td>" +
                                   "<td>" + (item.count || "") + "</td>" +
                                   "</tr>";
                  }}
                  tableHTML += "</tbody></table>";
                  // 統計資訊：在 "關鍵字相關內文：" 標題後空兩格，括號內的內容以咖啡色呈現
                  var headerHTML = "<hr><h3>關鍵字相關內文：  (<span style=\\"color:chocolate;\\">經號總數: " 
                                   + totalBookCount + "，出於 " + totalVol + " 卷，共出現 " + totalCount + " 次</span>)</h3>";
                  var contentHTML = headerHTML;
                  // 每筆經號與經名以大綠色粗體呈現（不受關鍵字替換影響）
                  for (var key in items) {{
                      var item = items[key];
                      //contentHTML += "<hr><p style=\\"color:green; font-size:larger;\\"><strong>(" 
                      //  + (item.book_key || "") + ") " + (item.title || "") + "</strong></p>";
                      // 【說明】計算卷數與名相筆數
                      var pageCount = (item.pages && typeof item.pages === 'object') ? Object.keys(item.pages).length : 0;
                      var countNum = item.count || 0;
                      console.log("[Display] " + item.book_key
                        + ": 卷數=" + pageCount
                        + ", 名相筆數=" + countNum);
                      contentHTML += '<hr><p style="color:green; font-size:larger;"><strong>('
                        + item.book_key + ') ' + item.title
                        + ' (卷數:' + pageCount + ', 名相筆數:' + countNum + ')'
                        + '</strong></p>';
                      if (item.paragraphs) {{
                          item.paragraphs.forEach(function(para) {{
                              // 處理內文中若出現搜尋關鍵字，進行紅色粗體替換
                              var patternStr = "";
                              if (keyword.indexOf('*') !== -1) {{
                                  // 將 '*' 替換為特殊標記，先轉義，再替換成 '.' (表示任一一個字元)
                                  var temp = keyword.replace(/\*/g, "___WILDCARD___");
                                  var escapedTemp = escapeRegExp(temp);
                                  patternStr = "(" + escapedTemp.replace(/___WILDCARD___/g, ".") + ")";
                              }} else {{
                                  patternStr = "(" + escapeRegExp(keyword) + ")";
                              }}
                              var pattern = new RegExp(patternStr, "g");
                              var replacedPara = para.replace(pattern, "<span style=\\"color:red; font-weight:bold;\\">$1</span>");
                              contentHTML += "<p>" + replacedPara + "</p>";
                          }});
                      }}
                  }}
                  var combinedHTML = contentHTML;
                  resultContainer.innerHTML = tableHTML;
                  textContainer.innerHTML = combinedHTML;
                  csvContainer.classList.remove("hidden");
              }}
          }})
          .catch(function(error) {{
              searchStatus.innerHTML = "<span style=\\"color:red;\\">搜尋發生錯誤，請稍後再試。</span>";
              resultContainer.innerHTML = "";
              textContainer.innerHTML = "";
              csvContainer.classList.add("hidden");
          }});
      }}

      function clearSearch() {{
          document.getElementById("keyword").value = "";
          document.getElementById("searchStatus").innerHTML = "";
          document.getElementById("resultContainer").innerHTML = "";
          document.getElementById("csvContainer").classList.add("hidden");
          document.getElementById("textContainer").innerHTML = "";
      }}

      function clearSearchResults() {{
          document.getElementById("searchStatus").innerHTML = "";
          document.getElementById("resultContainer").innerHTML = "";
          document.getElementById("csvContainer").classList.add("hidden");
          document.getElementById("textContainer").innerHTML = "";
      }}

      function downloadCSV() {{
          var table = document.getElementById("resultTable");
          var rows = Array.from(table.rows);
          var csvContent = "data:text/csv;charset=utf-8,";
          rows.forEach(function(row) {{
              var rowData = Array.from(row.cells).map(function(cell) {{ return '"' + cell.innerText + '"'; }}).join(",");
              csvContent += rowData + "\\n";
          }});
          var encodedUri = encodeURI(csvContent);
          var link = document.createElement("a");
          link.setAttribute("href", encodedUri);
          link.setAttribute("download", "搜尋結果.csv");
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      }}

      document.addEventListener("DOMContentLoaded", function() {{
          var input = document.getElementById("keyword");
          input.addEventListener("keydown", function(e) {{
              if (e.key === "Enter") {{
                  searchKeyword();
              }}
              if (e.key === "Escape") {{
                  clearSearch();
              }}
          }});
      }});
      function scrollToTop() {{
        window.scrollTo({{top: 0, behavior: 'smooth'}});
        }}
      function scrollToBottom() {{
        window.scrollTo({{top: document.body.scrollHeight, behavior: 'smooth'}});
        }}
     </script>
    </head>
    <body>
      <div style="display: flex; justify-content: space-between; align-items: center;">
         <h1 style="margin: 0;">經文名相查詢</h1>         
      </div>
      <input type="text" id="keyword" placeholder="輸入關鍵字 (可使用 * 為萬用字元)">
      <button onclick="searchKeyword()">搜尋</button>
      <button onclick="clearSearch()">清除</button>
      <div id="searchStatus"></div>
      <div id="resultContainer"></div>
      <div id="csvContainer" class="hidden">
          <button id="downloadCsv" onclick="downloadCSV()">下載 CSV 檔</button>
      </div>
      <div id="textContainer"></div>
      <!-- 新增：懸浮上下捲動按鈕 -->
      <button class="scroll-btn scroll-btn-top" onclick="scrollToTop()" title="回到頂部">↑</button>
      <button class="scroll-btn scroll-btn-bottom" onclick="scrollToBottom()" title="回到底部">↓</button>
    </body>
    </html>
    """
    
if __name__ == "__main__":
    logger.info("Flask 伺服器啟動中，監聽 0.0.0.0:5000")
    app.run(host="0.0.0.0", port=5000, debug=False)
