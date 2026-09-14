import os
import re
import json
import sys
import urllib.request
import urllib.error
import urllib.parse
import socket
from concurrent.futures import ThreadPoolExecutor

sys.stdout.reconfigure(encoding='utf-8')

base_dir = r"c:\Users\teacher.TICNET\Desktop\06Laragon_ip_url"

# 欠席者リスト（番号または名前の一部で指定可能）
ABSENT_STUDENTS = ["06", "菊池", "10", "蔣心悦", "23", "柳澤"]

def parse_name(item_name):
    name_part = os.path.splitext(item_name)[0]
    m = re.match(r"^(\d+)[_\-\s]*(.+)$", name_part)
    if m:
        num = m.group(1).zfill(2)
        name = m.group(2).strip()
        return num, name
    return "", name_part

def clean_url(raw_url):
    if not raw_url:
        return ""
    raw_url = raw_url.strip()
    if not raw_url:
        return ""
    if not (raw_url.startswith("http://") or raw_url.startswith("https://")):
        return "http://" + raw_url
    return raw_url

def encode_url_if_needed(url):
    try:
        parts = urllib.parse.urlsplit(url)
        path = urllib.parse.quote(parts.path)
        query = urllib.parse.quote(parts.query, safe='=&?%')
        encoded_url = urllib.parse.urlunsplit((parts.scheme, parts.netloc, path, query, parts.fragment))
        return encoded_url
    except Exception:
        return url

def check_url_health(url, timeout=2.0):
    if not url:
        return {"status": "error", "code": 0, "msg": "URL未設定"}
    try:
        safe_url = encode_url_if_needed(url)
        req = urllib.request.Request(
            safe_url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req, timeout=timeout) as response:
            code = response.getcode()
            if 200 <= code < 400:
                return {"status": "online", "code": code, "msg": f"HTTP {code} OK"}
            else:
                return {"status": "error", "code": code, "msg": f"HTTP {code} エラー"}
    except urllib.error.HTTPError as e:
        return {"status": "error", "code": e.code, "msg": f"HTTP {e.code} エラー"}
    except urllib.error.URLError as e:
        reason_str = str(e.reason)
        if "timed out" in reason_str.lower() or "timeout" in reason_str.lower():
            return {"status": "error", "code": 0, "msg": "接続タイムアウト"}
        return {"status": "error", "code": 0, "msg": f"接続エラー ({e.reason})"}
    except socket.timeout:
        return {"status": "error", "code": 0, "msg": "接続タイムアウト"}
    except Exception as e:
        return {"status": "error", "code": 0, "msg": f"アクセスエラー ({str(e)})"}

def check_is_absent(num, name, folder_files=None):
    if folder_files:
        for f in folder_files:
            if "欠席" in f or "休" in f or "absent" in f.lower():
                return True
    for a in ABSENT_STUDENTS:
        if a and (a == num or a in name):
            return True
    return False

def extract_all():
    items = sorted(os.listdir(base_dir))
    
    folder_entries = {}
    file_entries = []

    for item in items:
        if item.startswith('.') or item == 'index.html' or item.endswith('.py') or item.endswith('.json'):
            continue
        full_path = os.path.join(base_dir, item)
        num, name = parse_name(item)

        if os.path.isdir(full_path):
            folder_entries[item] = {
                "item_name": item,
                "num": num,
                "name": name,
                "full_path": full_path
            }
        else:
            file_entries.append({
                "item_name": item,
                "num": num,
                "name": name,
                "full_path": full_path
            })

    students_map = {}

    # Process folders first
    for item_name, info in folder_entries.items():
        num = info["num"]
        name = info["name"]
        full_path = info["full_path"]

        key = f"{num}_{name}" if num else name
        
        folder_files_list = []
        for root, dirs, files in os.walk(full_path):
            for f in files:
                folder_files_list.append(f)

        is_absent = check_is_absent(num, name, folder_files_list)

        student = {
            "id": key,
            "num": num,
            "name": name,
            "folder_name": item_name,
            "folders": [item_name],
            "urls": [],
            "notes": [],
            "local_files": [],
            "is_absent": is_absent
        }

        # Walk inside folder
        for root, dirs, files in os.walk(full_path):
            for f in files:
                f_path = os.path.join(root, f)
                rel_f = os.path.relpath(f_path, full_path)
                
                if f.endswith('.txt'):
                    try:
                        with open(f_path, 'r', encoding='utf-8', errors='ignore') as fp:
                            txt_content = fp.read().strip()
                        if txt_content:
                            if "10." in txt_content or "localhost" in txt_content or "http" in txt_content:
                                url = clean_url(txt_content)
                                is_latest = ("最新" in f) or ("最新" in rel_f)
                                label = f"最新版 ({f})" if is_latest else f"作品リンク ({f})"
                                student["urls"].append({"label": label, "url": url, "source_file": rel_f, "is_latest": is_latest})
                            else:
                                student["notes"].append({"title": f, "content": txt_content})
                    except Exception:
                        pass
                elif f.endswith('.html'):
                    student["local_files"].append(rel_f)

        students_map[key] = student

    # Process root files
    for info in file_entries:
        item_name = info["item_name"]
        num = info["num"]
        name = info["name"]
        full_path = info["full_path"]

        matched_key = None
        for k, st in students_map.items():
            if num and st["num"] == num:
                matched_key = k
                break
            if name and st["name"] == name:
                matched_key = k
                break

        try:
            with open(full_path, 'r', encoding='utf-8', errors='ignore') as fp:
                txt_content = fp.read().strip()
        except Exception:
            txt_content = ""

        if matched_key:
            student = students_map[matched_key]
            if txt_content and ("10." in txt_content or "http" in txt_content or "localhost" in txt_content):
                url = clean_url(txt_content)
                student["urls"].append({"label": f"作品リンク ({item_name})", "url": url, "source_file": item_name, "is_latest": False})
            elif txt_content:
                student["notes"].append({"title": item_name, "content": txt_content})
        else:
            key = f"{num}_{name}" if num else name
            is_absent = check_is_absent(num, name, [item_name])
            student = {
                "id": key,
                "num": num,
                "name": name,
                "folder_name": "",
                "folders": [],
                "urls": [],
                "notes": [],
                "local_files": [],
                "is_absent": is_absent
            }
            if txt_content and ("10." in txt_content or "http" in txt_content or "localhost" in txt_content):
                url = clean_url(txt_content)
                student["urls"].append({"label": f"作品リンク ({item_name})", "url": url, "source_file": item_name, "is_latest": False})
            elif txt_content:
                student["notes"].append({"title": item_name, "content": txt_content})
            students_map[key] = student

    # Deduplicate & Sort URLs for each student
    for st in students_map.values():
        unique_urls = []
        seen = set()
        for u in st["urls"]:
            if u["url"] not in seen:
                seen.add(u["url"])
                unique_urls.append(u)
        unique_urls.sort(key=lambda u: (0 if u.get("is_latest") else 1, u["label"]))
        st["urls"] = unique_urls

    # Parallel HTTP Access Health Check
    print("Checking URL accessibility for all student works...")
    all_urls = []
    for st in students_map.values():
        for u in st["urls"]:
            all_urls.append(u["url"])
    
    health_results = {}
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(check_url_health, url): url for url in all_urls}
        for future in futures:
            url = futures[future]
            try:
                res = future.result()
                health_results[url] = res
            except Exception as e:
                health_results[url] = {"status": "error", "code": 0, "msg": f"チェック失敗 ({e})"}

    # Attach health status to student URLs
    for st in students_map.values():
        for u in st["urls"]:
            u["health"] = health_results.get(u["url"], {"status": "error", "code": 0, "msg": "未確認"})

    def sort_key(st):
        n = st["num"]
        return (0, int(n)) if n.isdigit() else (1, st["name"])

    result_list = sorted(students_map.values(), key=sort_key)

    return result_list


def generate_html(students_data):
    json_data_str = json.dumps(students_data, ensure_ascii=False)

    html_content = f"""<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Laragon 学生作品一覧 & IPポータル</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+JP:wght@400;500;700;800&display=swap" rel="stylesheet">
    <style>
        :root {{
            --bg-main: #0f172a;
            --bg-card: #1e293b;
            --bg-card-hover: #334155;
            --border-color: #334155;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --text-muted: #64748b;
            --accent-blue: #38bdf8;
            --accent-indigo: #818cf8;
            --accent-emerald: #34d399;
            --accent-amber: #fbbf24;
            --accent-rose: #fb7185;
            --gradient-hero: linear-gradient(135deg, #0284c7 0%, #6366f1 50%, #8b5cf6 100%);
            --shadow-card: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
            --radius-lg: 16px;
            --radius-md: 12px;
            --radius-sm: 8px;
        }}

        * {{
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }}

        body {{
            font-family: 'Noto Sans JP', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background-color: var(--bg-main);
            color: var(--text-primary);
            line-height: 1.6;
            min-height: 100vh;
            padding-bottom: 60px;
        }}

        /* Header & Hero */
        .hero {{
            background: var(--gradient-hero);
            padding: 44px 24px 60px;
            text-align: center;
            position: relative;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
        }}

        .hero::before {{
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.15), transparent 70%);
            pointer-events: none;
        }}

        .hero-title {{
            font-size: 2.3rem;
            font-weight: 800;
            letter-spacing: -0.02em;
            margin-bottom: 8px;
            text-shadow: 0 2px 10px rgba(0,0,0,0.3);
        }}

        .hero-subtitle {{
            font-size: 1.05rem;
            opacity: 0.95;
            font-weight: 500;
            max-width: 650px;
            margin: 0 auto;
        }}

        /* Stats Bar */
        .stats-container {{
            max-width: 1240px;
            margin: -32px auto 28px;
            padding: 0 20px;
            position: relative;
            z-index: 10;
        }}

        .stats-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 14px;
        }}

        .stat-card {{
            background: rgba(30, 41, 59, 0.92);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: var(--radius-md);
            padding: 16px 18px;
            box-shadow: var(--shadow-card);
            display: flex;
            align-items: center;
            gap: 14px;
        }}

        .stat-icon {{
            font-size: 1.8rem;
            background: rgba(255, 255, 255, 0.08);
            width: 44px;
            height: 44px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
        }}

        .stat-val {{
            font-size: 1.5rem;
            font-weight: 800;
            color: var(--accent-blue);
            line-height: 1.2;
        }}

        .stat-lbl {{
            font-size: 0.8rem;
            color: var(--text-secondary);
        }}

        /* Main Container */
        .container {{
            max-width: 1240px;
            margin: 0 auto;
            padding: 0 20px;
        }}

        /* Controls Section (Search & Filter) */
        .controls-bar {{
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-lg);
            padding: 20px;
            margin-bottom: 28px;
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            align-items: center;
            justify-content: space-between;
            box-shadow: var(--shadow-card);
        }}

        .search-box {{
            position: relative;
            flex: 1;
            min-width: 280px;
        }}

        .search-box input {{
            width: 100%;
            padding: 12px 16px 12px 44px;
            background: var(--bg-main);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            color: var(--text-primary);
            font-size: 0.95rem;
            outline: none;
            transition: border-color 0.2s, box-shadow 0.2s;
        }}

        .search-box input:focus {{
            border-color: var(--accent-blue);
            box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
        }}

        .search-icon {{
            position: absolute;
            left: 14px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 1.1rem;
            color: var(--text-muted);
        }}

        .filter-tags {{
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }}

        .tag-btn {{
            background: var(--bg-main);
            border: 1px solid var(--border-color);
            color: var(--text-secondary);
            padding: 8px 14px;
            border-radius: 20px;
            font-size: 0.83rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }}

        .tag-btn:hover, .tag-btn.active {{
            background: var(--accent-blue);
            color: #0f172a;
            border-color: var(--accent-blue);
            font-weight: 700;
        }}

        .view-switcher {{
            display: flex;
            background: var(--bg-main);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            padding: 4px;
            gap: 4px;
        }}

        .view-btn {{
            background: transparent;
            border: none;
            color: var(--text-secondary);
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.88rem;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s;
        }}

        .view-btn.active {{
            background: var(--bg-card);
            color: var(--accent-blue);
            font-weight: 600;
        }}

        /* Cards Grid */
        .grid-view {{
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 24px;
        }}

        .student-card {{
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-lg);
            padding: 24px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease, opacity 0.25s ease;
            box-shadow: var(--shadow-card);
            position: relative;
        }}

        .student-card:hover {{
            transform: translateY(-4px);
            border-color: var(--accent-blue);
            box-shadow: 0 16px 30px -10px rgba(56, 189, 248, 0.25);
        }}

        /* Absent (Disabled) Card Style */
        .student-card.absent {{
            opacity: 0.55;
            background: rgba(30, 41, 59, 0.5);
            border-color: rgba(251, 113, 133, 0.3);
            filter: grayscale(40%);
        }}

        .student-card.absent:hover {{
            transform: none;
            box-shadow: var(--shadow-card);
            border-color: rgba(251, 113, 133, 0.5);
        }}

        .card-header {{
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 12px;
        }}

        .student-badge {{
            background: rgba(56, 189, 248, 0.15);
            color: var(--accent-blue);
            font-weight: 800;
            font-size: 0.85rem;
            padding: 4px 10px;
            border-radius: 6px;
            letter-spacing: 0.05em;
        }}

        .multi-badge {{
            background: rgba(129, 140, 248, 0.2);
            color: var(--accent-indigo);
            font-weight: 700;
            font-size: 0.75rem;
            padding: 3px 8px;
            border-radius: 6px;
            margin-left: 6px;
        }}

        .absent-badge {{
            background: rgba(251, 113, 133, 0.2);
            color: var(--accent-rose);
            font-weight: 800;
            font-size: 0.85rem;
            padding: 4px 10px;
            border-radius: 6px;
            letter-spacing: 0.05em;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }}

        .student-name {{
            font-size: 1.3rem;
            font-weight: 700;
            color: var(--text-primary);
            line-height: 1.3;
        }}

        .folder-badge {{
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 0.8rem;
            color: var(--text-muted);
            background: rgba(255, 255, 255, 0.04);
            padding: 4px 8px;
            border-radius: 6px;
            margin-top: 4px;
            word-break: break-all;
        }}

        .card-body {{
            margin: 16px 0;
            flex-grow: 1;
        }}

        /* URL Item Box */
        .url-item {{
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: var(--radius-md);
            padding: 14px;
            margin-bottom: 12px;
            transition: border-color 0.2s;
        }}

        .url-item.health-online {{
            border-left: 4px solid var(--accent-emerald);
        }}

        .url-item.health-error {{
            border-left: 4px solid var(--accent-rose);
            background: rgba(251, 113, 133, 0.04);
        }}

        .url-item-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
        }}

        .url-label {{
            font-size: 0.78rem;
            font-weight: 700;
            color: var(--text-secondary);
            display: flex;
            align-items: center;
            gap: 6px;
        }}

        /* Health status badge */
        .health-badge {{
            font-size: 0.72rem;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 12px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }}

        .health-badge.online {{
            background: rgba(52, 211, 153, 0.15);
            color: var(--accent-emerald);
            border: 1px solid rgba(52, 211, 153, 0.3);
        }}

        .health-badge.error {{
            background: rgba(251, 113, 133, 0.15);
            color: var(--accent-rose);
            border: 1px solid rgba(251, 113, 133, 0.3);
        }}

        .url-text {{
            font-family: monospace;
            font-size: 0.88rem;
            color: var(--text-primary);
            word-break: break-all;
            margin-bottom: 10px;
        }}

        .url-actions {{
            display: flex;
            gap: 8px;
        }}

        .btn-launch-single {{
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            flex: 1;
            padding: 9px 14px;
            background: var(--accent-blue);
            color: #0f172a;
            font-weight: 700;
            font-size: 0.88rem;
            border-radius: var(--radius-sm);
            text-decoration: none;
            transition: all 0.2s ease;
        }}

        .btn-launch-single:hover {{
            filter: brightness(1.15);
            transform: translateY(-1px);
        }}

        .btn-launch-single.warning {{
            background: rgba(251, 113, 133, 0.2);
            color: var(--accent-rose);
            border: 1px solid rgba(251, 113, 133, 0.4);
        }}

        .btn-launch-single.warning:hover {{
            background: var(--accent-rose);
            color: #ffffff;
        }}

        .btn-launch-single.disabled {{
            background: #334155 !important;
            color: #64748b !important;
            cursor: not-allowed;
            pointer-events: none;
        }}

        .btn-copy-small {{
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: var(--bg-main);
            border: 1px solid var(--border-color);
            color: var(--text-secondary);
            padding: 8px 12px;
            border-radius: var(--radius-sm);
            font-size: 0.82rem;
            cursor: pointer;
            transition: all 0.2s;
        }}

        .btn-copy-small:hover {{
            background: var(--bg-card-hover);
            color: var(--text-primary);
            border-color: var(--accent-blue);
        }}

        .notes-box {{
            background: rgba(251, 191, 36, 0.1);
            border: 1px dashed rgba(251, 191, 36, 0.3);
            border-radius: var(--radius-sm);
            padding: 10px;
            font-size: 0.85rem;
            color: #fde68a;
            margin-top: 10px;
        }}

        .no-url-badge {{
            text-align: center;
            padding: 16px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: var(--radius-md);
            color: var(--text-muted);
            font-size: 0.9rem;
        }}

        /* Table View */
        .table-view {{
            display: none;
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-lg);
            overflow: hidden;
            box-shadow: var(--shadow-card);
        }}

        .student-table {{
            width: 100%;
            border-collapse: collapse;
            text-align: left;
        }}

        .student-table th {{
            background: rgba(15, 23, 42, 0.8);
            padding: 16px 20px;
            font-size: 0.85rem;
            color: var(--text-secondary);
            font-weight: 700;
            border-bottom: 1px solid var(--border-color);
        }}

        .student-table td {{
            padding: 16px 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            font-size: 0.93rem;
            vertical-align: middle;
        }}

        .student-table tr.absent-row {{
            opacity: 0.5;
            background: rgba(251, 113, 133, 0.03);
        }}

        .student-table tr:hover {{
            background: rgba(255, 255, 255, 0.02);
        }}

        /* Toast notification */
        .toast {{
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: var(--accent-emerald);
            color: #0f172a;
            font-weight: 700;
            padding: 12px 24px;
            border-radius: var(--radius-md);
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
            transform: translateY(100px);
            opacity: 0;
            transition: all 0.3s ease;
            z-index: 1000;
        }}

        .toast.show {{
            transform: translateY(0);
            opacity: 1;
        }}

        .empty-state {{
            grid-column: 1 / -1;
            text-align: center;
            padding: 60px 20px;
            color: var(--text-muted);
        }}

        .empty-state-icon {{
            font-size: 3rem;
            margin-bottom: 12px;
        }}
    </style>
</head>
<body>

    <!-- Hero Header -->
    <header class="hero">
        <h1 class="hero-title">Laragon 学生作品 & IPアクセス ポータル</h1>
        <p class="hero-subtitle">全作品のアクセス自動診断機能付き！ワンクリックで各学生の複数作品へジャンプできます</p>
    </header>

    <!-- Stats Bar -->
    <div class="stats-container">
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon">🎓</div>
                <div>
                    <div class="stat-val" id="statTotal">0</div>
                    <div class="stat-lbl">対象学生数</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">🟢</div>
                <div>
                    <div class="stat-val" id="statOnline" style="color: var(--accent-emerald);">0</div>
                    <div class="stat-lbl">接続正常 (OK)</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">🔴</div>
                <div>
                    <div class="stat-val" id="statError" style="color: var(--accent-rose);">0</div>
                    <div class="stat-lbl">アクセスエラー</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">📁</div>
                <div>
                    <div class="stat-val" id="statMulti">0</div>
                    <div class="stat-lbl">複数作品所持数</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">💤</div>
                <div>
                    <div class="stat-val" id="statAbsent" style="color: var(--accent-amber);">0</div>
                    <div class="stat-lbl">本日欠席</div>
                </div>
            </div>
        </div>
    </div>

    <!-- Main Content Container -->
    <main class="container">
        
        <!-- Controls Bar -->
        <div class="controls-bar">
            <!-- Search Box -->
            <div class="search-box">
                <span class="search-icon">🔍</span>
                <input type="text" id="searchInput" placeholder="学生名、番号、IPアドレス、フォルダ名で検索..." oninput="filterData()">
            </div>

            <!-- Filter Tags -->
            <div class="filter-tags">
                <button class="tag-btn active" onclick="setFilter('all', this)">すべて</button>
                <button class="tag-btn" onclick="setFilter('online', this)">接続OK 🟢</button>
                <button class="tag-btn" onclick="setFilter('error', this)">アクセスエラー 🔴</button>
                <button class="tag-btn" onclick="setFilter('multi', this)">複数作品所持 📁</button>
                <button class="tag-btn" onclick="setFilter('present', this)">出席のみ 🟢</button>
                <button class="tag-btn" onclick="setFilter('absent', this)">欠席のみ 💤</button>
            </div>

            <!-- View Switcher -->
            <div class="view-switcher">
                <button class="view-btn active" id="btnGridView" onclick="switchView('grid')">
                    <span>🎴</span> カード
                </button>
                <button class="view-btn" id="btnTableView" onclick="switchView('table')">
                    <span>📑</span> リスト
                </button>
            </div>
        </div>

        <!-- Cards View -->
        <div id="gridView" class="grid-view"></div>

        <!-- Table View -->
        <div id="tableView" class="table-view">
            <table class="student-table">
                <thead>
                    <tr>
                        <th style="width: 70px;">番号</th>
                        <th style="width: 160px;">氏名</th>
                        <th style="width: 150px;">フォルダ情報</th>
                        <th>作品URL & 疎通診断</th>
                        <th style="width: 140px;">備考</th>
                        <th style="width: 180px; text-align: center;">アクション</th>
                    </tr>
                </thead>
                <tbody id="tableBody"></tbody>
            </table>
        </div>

    </main>

    <!-- Toast Notification -->
    <div id="toast" class="toast">クリップボードにコピーしました！</div>

    <script>
        const rawStudentsData = {json_data_str};

        let currentFilter = 'all';

        function initStats() {{
            const total = rawStudentsData.length;
            let absentCount = 0;
            let onlineCount = 0;
            let errorCount = 0;
            let multiCount = 0;

            rawStudentsData.forEach(st => {{
                if (st.is_absent) absentCount++;
                if (st.urls.length > 1) multiCount++;

                st.urls.forEach(u => {{
                    if (u.health && u.health.status === 'online') onlineCount++;
                    else errorCount++;
                }});
            }});

            document.getElementById('statTotal').textContent = total;
            document.getElementById('statOnline').textContent = onlineCount;
            document.getElementById('statError').textContent = errorCount;
            document.getElementById('statMulti').textContent = multiCount;
            document.getElementById('statAbsent').textContent = absentCount;
        }}

        function copyToClipboard(text) {{
            navigator.clipboard.writeText(text).then(() => {{
                showToast("URLをコピーしました！");
            }}).catch(err => {{
                showToast("コピーに失敗しました");
            }});
        }}

        function showToast(msg) {{
            const toast = document.getElementById('toast');
            toast.textContent = msg;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2500);
        }}

        function renderGrid(data) {{
            const container = document.getElementById('gridView');
            if (data.length === 0) {{
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🔍</div>
                        <h3>該当する作品が見つかりませんでした</h3>
                        <p>条件を変更して検索してください</p>
                    </div>
                `;
                return;
            }}

            let html = '';
            data.forEach(st => {{
                const isMulti = st.urls.length > 1;

                html += `
                    <div class="student-card ${{st.is_absent ? 'absent' : ''}}">
                        <div>
                            <div class="card-header">
                                <div>
                                    <span class="student-badge">#${{st.num || '---'}}</span>
                                    ${{isMulti ? `<span class="multi-badge">📁 複数作品 (${{st.urls.length}})</span>` : ''}}
                                    ${{st.is_absent ? '<span class="absent-badge">💤 本日欠席</span>' : ''}}
                                    <h2 class="student-name" style="margin-top: 6px;">${{escapeHtml(st.name)}}</h2>
                                </div>
                            </div>
                            
                            ${{st.folder_name ? `<div class="folder-badge">📁 ${{escapeHtml(st.folder_name)}}</div>` : ''}}

                            <div class="card-body">
                                ${{st.urls.length > 0 ? st.urls.map((u, idx) => {{
                                    const isOnline = u.health && u.health.status === 'online';
                                    const healthMsg = u.health ? u.health.msg : '未確認';

                                    return `
                                        <div class="url-item ${{isOnline ? 'health-online' : 'health-error'}}">
                                            <div class="url-item-header">
                                                <span class="url-label">
                                                    ${{isMulti ? `🎮 作品${{idx + 1}}: ` : ''}}${{escapeHtml(u.label)}}
                                                </span>
                                                <span class="health-badge ${{isOnline ? 'online' : 'error'}}">
                                                    ${{isOnline ? '🟢 接続OK' : '🔴 アクセスエラー'}} (${{escapeHtml(healthMsg)}})
                                                </span>
                                            </div>
                                            <div class="url-text">${{escapeHtml(u.url)}}</div>

                                            <div class="url-actions">
                                                ${{st.is_absent ? `
                                                    <a href="javascript:void(0)" class="btn-launch-single disabled">
                                                        本日欠席 (無効) 💤
                                                    </a>
                                                ` : isOnline ? `
                                                    <a href="${{escapeHtml(u.url)}}" target="_blank" class="btn-launch-single">
                                                        ${{isMulti ? `作品${{idx + 1}}を開く 🚀` : '作品を開く 🚀'}}
                                                    </a>
                                                ` : `
                                                    <a href="${{escapeHtml(u.url)}}" target="_blank" class="btn-launch-single warning">
                                                        ⚠️ アクセスエラー (それでも試す ↗️)
                                                    </a>
                                                `}}
                                                <button class="btn-copy-small" onclick="copyToClipboard('${{escapeHtml(u.url)}}')" title="URLをコピー">
                                                    📋 コピー
                                                </button>
                                            </div>
                                        </div>
                                    `;
                                }}).join('') : `
                                    <div class="no-url-badge">URL / IP 未登録</div>
                                `}}

                                ${{st.notes.map(n => `
                                    <div class="notes-box">
                                        <strong>💡 ${{escapeHtml(n.title)}}:</strong> ${{escapeHtml(n.content)}}
                                    </div>
                                `).join('')}}
                            </div>
                        </div>
                    </div>
                `;
            }});

            container.innerHTML = html;
        }}

        function renderTable(data) {{
            const tbody = document.getElementById('tableBody');
            if (data.length === 0) {{
                tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">該当するデータがありません</td></tr>`;
                return;
            }}

            let html = '';
            data.forEach(st => {{
                html += `
                    <tr class="${{st.is_absent ? 'absent-row' : ''}}">
                        <td><span class="student-badge">#${{st.num || '--'}}</span></td>
                        <td style="font-weight: 700; color: var(--text-primary);">
                            ${{escapeHtml(st.name)}}
                            ${{st.is_absent ? '<span class="absent-badge" style="font-size: 0.7rem; padding: 2px 6px; margin-left: 4px;">欠席</span>' : ''}}
                        </td>
                        <td><span style="font-size: 0.85rem; color: var(--text-secondary);">${{escapeHtml(st.folder_name || '---')}}</span></td>
                        <td>
                            ${{st.urls.map((u, idx) => {{
                                const isOnline = u.health && u.health.status === 'online';
                                const healthMsg = u.health ? u.health.msg : '未確認';

                                return `
                                    <div style="margin-bottom: 8px;">
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <span class="health-badge ${{isOnline ? 'online' : 'error'}}" style="font-size: 0.68rem; padding: 1px 6px;">
                                                ${{isOnline ? '🟢 OK' : '🔴 ERROR'}}
                                            </span>
                                            ${{!st.is_absent ? `
                                                <a href="${{escapeHtml(u.url)}}" target="_blank" style="color: var(--accent-blue); text-decoration: none; font-family: monospace; font-weight: bold;">
                                                    ${{escapeHtml(u.url)}}
                                                </a>
                                            ` : `
                                                <span style="color: var(--text-muted); font-family: monospace; text-decoration: line-through;">${{escapeHtml(u.url)}}</span>
                                            `}}
                                            <span style="font-size: 0.75rem; color: var(--text-muted);">(${{escapeHtml(u.label)}} - ${{escapeHtml(healthMsg)}})</span>
                                        </div>
                                    </div>
                                `;
                            }}).join('') || '<span style="color: var(--text-muted);">未登録</span>'}}
                        </td>
                        <td style="font-size: 0.85rem; color: var(--accent-amber);">
                            ${{st.notes.map(n => `<div>💡 ${{escapeHtml(n.content)}}</div>`).join('')}}
                        </td>
                        <td style="text-align: center;">
                            ${{st.is_absent ? `
                                <span style="font-size: 0.8rem; color: var(--accent-rose); font-weight: bold;">💤 本日欠席</span>
                            ` : st.urls.length > 0 ? st.urls.map((u, idx) => {{
                                const isOnline = u.health && u.health.status === 'online';
                                return `
                                    <a href="${{escapeHtml(u.url)}}" target="_blank" style="display: inline-block; margin: 2px; padding: 5px 10px; background: ${{isOnline ? 'var(--accent-blue)' : 'rgba(251, 113, 133, 0.2)'}}; color: ${{isOnline ? '#0f172a' : 'var(--accent-rose)'}}; border-radius: 6px; font-weight: 700; text-decoration: none; font-size: 0.78rem;">
                                        ${{st.urls.length > 1 ? `作品${{idx + 1}} 🚀` : '開く 🚀'}}
                                    </a>
                                `;
                            }}).join('') : '---'}}
                        </td>
                    </tr>
                `;
            }});

            tbody.innerHTML = html;
        }}

        function filterData() {{
            const query = document.getElementById('searchInput').value.toLowerCase().trim();

            const filtered = rawStudentsData.filter(st => {{
                if (currentFilter === 'present' && st.is_absent) return false;
                if (currentFilter === 'absent' && !st.is_absent) return false;
                if (currentFilter === 'multi' && st.urls.length <= 1) return false;
                if (currentFilter === 'online' && !st.urls.some(u => u.health && u.health.status === 'online')) return false;
                if (currentFilter === 'error' && !st.urls.some(u => u.health && u.health.status === 'error')) return false;

                if (!query) return true;

                const matchNum = (st.num || '').toLowerCase().includes(query);
                const matchName = (st.name || '').toLowerCase().includes(query);
                const matchFolder = (st.folder_name || '').toLowerCase().includes(query);
                const matchUrl = st.urls.some(u => u.url.toLowerCase().includes(query) || u.label.toLowerCase().includes(query));
                const matchNotes = st.notes.some(n => n.content.toLowerCase().includes(query) || n.title.toLowerCase().includes(query));

                return matchNum || matchName || matchFolder || matchUrl || matchNotes;
            }});

            renderGrid(filtered);
            renderTable(filtered);
        }}

        function setFilter(filterType, btnEl) {{
            currentFilter = filterType;
            document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
            btnEl.classList.add('active');
            filterData();
        }}

        function switchView(viewType) {{
            const gridEl = document.getElementById('gridView');
            const tableEl = document.getElementById('tableView');
            const btnGrid = document.getElementById('btnGridView');
            const btnTable = document.getElementById('btnTableView');

            if (viewType === 'grid') {{
                gridEl.style.display = 'grid';
                tableEl.style.display = 'none';
                btnGrid.classList.add('active');
                btnTable.classList.remove('active');
            }} else {{
                gridEl.style.display = 'none';
                tableEl.style.display = 'block';
                btnGrid.classList.remove('active');
                btnTable.classList.add('active');
            }}
        }}

        function escapeHtml(str) {{
            if (!str) return '';
            return str
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }}

        document.addEventListener('DOMContentLoaded', () => {{
            initStats();
            filterData();
        }});
    </script>
</body>
</html>
"""
    return html_content


if __name__ == '__main__':
    data = extract_all()
    html = generate_html(data)
    out_path = os.path.join(base_dir, "index.html")
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"Successfully generated {out_path} with {len(data)} student records. Absent: {[s['name'] for s in data if s['is_absent']]}")
