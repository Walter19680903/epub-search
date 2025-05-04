import os
import json
import logging
import re
from logging.handlers import RotatingFileHandler
from flask import Flask, request, jsonify, render_template
from modules import search_epub

# ------------------------------------------
# 常數與目錄設定
# ------------------------------------------
UPDATE_DATE = '2025/05/04'
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(BASE_DIR, 'cache')
EPUB_DIR = os.path.join(BASE_DIR, 'epubs')
# 確保 cache 目錄存在
os.makedirs(CACHE_DIR, exist_ok=True)

# ------------------------------------------
# Flask 應用與 Logger 設定
# ------------------------------------------
app = Flask(__name__)
logger = logging.getLogger('app')
logger.setLevel(logging.INFO)

# Console Handler
ch = logging.StreamHandler()
ch.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'))
logger.addHandler(ch)

# File Handler（輪替）
LOG_DIR = os.path.join(BASE_DIR, 'logs')
os.makedirs(LOG_DIR, exist_ok=True)
fh = RotatingFileHandler(os.path.join(LOG_DIR, 'app.log'), maxBytes=5*1024*1024, backupCount=3, encoding='utf-8')
fh.setFormatter(ch.formatter)
logger.addHandler(fh)

# ------------------------------------------
# 工具函式：移除重疊段落
# ------------------------------------------
def remove_overlap(prev: str, curr: str) -> str:
    max_len = min(len(prev), len(curr))
    for l in range(max_len, 0, -1):
        if prev.endswith(curr[:l]):
            return curr[l:]
    return curr

# ------------------------------------------
# 載入 titles.json
# ------------------------------------------
titles_path = os.path.join(BASE_DIR, 'titles', 'titles.json')
try:
    with open(titles_path, 'r', encoding='utf-8') as f:
        full_data = json.load(f)
    # 判斷結構
    if isinstance(full_data, dict) and full_data:
        if len(full_data) == 1 and isinstance(list(full_data.values())[0], dict):
            books_dict = list(full_data.values())[0]
        else:
            books_dict = full_data
    else:
        raise ValueError('titles.json 格式不正確')
    logger.info('成功載入 titles.json，條目數：%d', len(books_dict))
except Exception as e:
    logger.error('讀取 titles.json 失敗：%s', e)
    raise RuntimeError('初始化失敗：無法載入 titles.json')

# ------------------------------------------
# 首頁路由：使用模板
# ------------------------------------------
@app.route('/', methods=['GET'])
def index():
    logger.info('Render index.html，update_date=%s', UPDATE_DATE)
    return render_template('index.html', update_date=UPDATE_DATE)

# ------------------------------------------
# AJAX 路由：關鍵字搜尋
# ------------------------------------------
@app.route('/search_ajax', methods=['POST'])
def search_ajax():
    keyword = request.form.get('keyword', '').strip()
    if not keyword:
        return jsonify({'error': '請輸入關鍵字'})
    # 安全化檔名
    safe_kw = search_epub.sanitize_filename(keyword)
    cache_file = os.path.join(CACHE_DIR, f'{safe_kw}.json')
    logger.info('搜尋關鍵字：%s，cache 檔案：%s', keyword, cache_file)

    results = None
    # 嘗試讀取快取
    if os.path.exists(cache_file):
        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                results = json.load(f)
            logger.info('使用快取結果')
        except Exception as e:
            logger.warning('讀取快取失敗，移除檔案：%s', e)
            os.remove(cache_file)
    # 若無快取或讀取失敗，重新搜尋
    if results is None:
        epub_list = [os.path.join(EPUB_DIR, fn) for fn in os.listdir(EPUB_DIR) if fn.endswith('.epub')]
        results = search_epub.search_wildcard_multiple_epubs_stat(epub_list, keyword, logger)
        try:
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
            logger.info('已儲存搜尋結果至快取')
        except Exception as e:
            logger.error('寫入快取失敗：%s', e)

    # 轉換結果
    transformed = {}
    for key, value in results.items():
        if key == '_stat_':
            continue
        entry = {}
        entry['book_key'] = key
        # 判斷經號對應書名
        note, title = '', key
        if key in books_dict and isinstance(books_dict[key], list) and len(books_dict[key]) >= 2:
            note, title = books_dict[key][0], books_dict[key][1]
        entry['note'] = note
        entry['title'] = title
        entry['count'] = value.get('total', 0)
        # 收集段落
        paras = []
        for lst in value.get('sentences', {}).values():
            paras.extend(lst)
        # 去重
        dedup = []
        for p in paras:
            if p not in dedup:
                dedup.append(p)
        # 處理重疊
        processed = []
        prev = None
        for p in dedup:
            occ = [m.start() for m in re.finditer(re.escape(keyword), p)]
            if len(occ) < 2 or prev is None:
                processed.append(p)
            else:
                trimmed = remove_overlap(prev, p)
                if trimmed.strip():
                    processed.append(trimmed)
            prev = p
        entry['paragraphs'] = processed
        entry['pages'] = value.get('pages', {})
        transformed[key] = entry

    return jsonify({'data': transformed})

# ------------------------------------------
# 啟動伺服器
# ------------------------------------------
if __name__ == '__main__':
    logger.info('啟動 Flask 伺服器：0.0.0.0:5000')
    app.run(host='0.0.0.0', port=5000, debug=False)
