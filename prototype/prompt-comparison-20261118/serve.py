"""Serve the resource-selection prototype and read-only Catalog queries."""

import argparse
import json
import re
from concurrent.futures import ThreadPoolExecutor
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT / "resource-catalog.json").read_text())
PRESENTATION = json.loads((ROOT.parents[1] / "src/catalog/presentation.json").read_text())
KINDS = {item["id"]: item for item in CONFIG["kinds"]}


def source_query(path, payload=None):
    body = json.dumps(payload).encode() if payload is not None else None
    request = Request(
        CONFIG["source_origin"] + path,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST" if payload is not None else "GET",
    )
    with urlopen(request, timeout=20) as response:
        result = json.load(response)
    if payload is not None and result.get("status") != "ok":
        raise ValueError(result.get("message") or "资源目录查询失败，请重试。")
    return result


def all_support_records(path):
    records = []
    page = 1
    while True:
        result = source_query(path, {"mode": "search", "query": "", "page": page, "page_size": 100})
        records.extend(result["results"])
        if not result["results"] or len(records) >= result["total_count"]:
            return [{**item, "id": str(item["id"])} for item in records]
        page += 1


def metadata():
    with ThreadPoolExecutor(max_workers=3) as pool:
        discovery = pool.submit(source_query, CONFIG["discovery_path"])
        bases = pool.submit(all_support_records, CONFIG["base_models_path"])
        instances = pool.submit(all_support_records, CONFIG["instances_path"])
        available = discovery.result()["paths"]
        return {
            "kinds": [item for item in CONFIG["kinds"] if item["path"] in available],
            "base_models": bases.result(),
            "instances": instances.result(),
            "presentation": PRESENTATION,
        }


def text_value(value):
    if value is None:
        return ""
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)


def catalog_item(kind, record):
    definition = KINDS[kind]
    source_id = str(record["id"])
    return {
        "id": kind + ":" + source_id,
        "sourceId": source_id,
        "kind": kind,
        "name": text_value(record.get(definition["label_field"])) or source_id,
        "base_model_id": str(record["base_model_id"]) if record.get("base_model_id") is not None else None,
        "description": next((text_value(record[field]) for field in ("description", "style_description", "prompt_text", "artist_string", "works.name", "category_name", "canonical_tag", "template_type") if record.get(field)), ""),
        "file": record.get("file_name"),
        "weight": record.get("weight"),
        "triggers": ", ".join(record.get("trigger_words_json") or []),
        "cover_url": record.get("cover_url"),
        "sample_image_urls": record.get("sample_image_urls") or [],
        "fields": record,
    }


def stable_id(value):
    if not re.fullmatch(r"[1-9][0-9]{0,19}", value):
        raise ValueError("资源 ID 须为正整数，请重新选择资源。")
    return value


def catalog_query(query):
    kind = query.get("kind", [""])[0]
    if kind not in KINDS:
        raise ValueError("资源类型无效，请从资源分类中重新选择。")
    definition = KINDS[kind]
    if query.get("id"):
        payload = {"mode": "resolve", "id": stable_id(query["id"][0])}
    else:
        page_text = query.get("page", ["1"])[0]
        size_text = query.get("page_size", ["8"])[0]
        if not re.fullmatch(r"[0-9]+", page_text) or not 1 <= int(page_text) <= 100000:
            raise ValueError("页码须为 1 至 100000，请返回第 1 页重试。")
        if not re.fullmatch(r"[0-9]+", size_text) or not 1 <= int(size_text) <= 100:
            raise ValueError("每页数量须为 1 至 100，请调整后重试。")
        page, page_size = int(page_text), int(size_text)
        search = query.get("query", [""])[0]
        if len(search) > 200:
            raise ValueError("搜索关键词不能超过 200 个字符，请缩短后重试。")
        payload = {"mode": "search", "query": search, "page": page, "page_size": page_size}
        if definition["scoped"] and query.get("base_model_id", [""])[0]:
            payload["base_model_id"] = stable_id(query["base_model_id"][0])
    result = source_query(definition["path"], payload)
    return {**{key: result.get(key) for key in ("page", "page_size", "total_count")}, "items": [catalog_item(kind, row) for row in result["results"]]}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        location = urlsplit(self.path)
        if not location.path.startswith("/api/"):
            return super().do_GET()
        try:
            if location.path == "/api/catalog/meta":
                return self.send_json(200, metadata())
            if location.path == "/api/catalog":
                return self.send_json(200, catalog_query(parse_qs(location.query)))
            return self.send_json(404, {"error": "查询入口不存在，请返回资源目录。"})
        except (ValueError, TypeError) as error:
            self.send_json(400, {"error": str(error)})
        except HTTPError as error:
            self.send_json(502, {"error": f"资源目录返回 HTTP {error.code}，请重试。"})
        except (URLError, TimeoutError, OSError):
            self.send_json(503, {"error": "无法连接资源目录，请确认数据源已启动后重试。"})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=18764)
    arguments = parser.parse_args()
    print(f"http://127.0.0.1:{arguments.port}/?view=resources", flush=True)
    ThreadingHTTPServer(("127.0.0.1", arguments.port), Handler).serve_forever()
