"""僅供本機畫布錄影：將瀏覽器生成的影片與驗證影格存至桌面。"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = Path.home() / "Desktop/物件導向式程式設計/石殻姆活動影片"


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.headers.get("X-Stone-Mu-Recording") != "1" or not self.path.startswith("/__recording/"):
            self.send_error(403)
            return
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length < 300_000_000:
            self.send_error(413)
            return
        kind = self.path.rsplit("/", 1)[-1]
        content_type = self.headers.get("Content-Type", "")
        if kind == "video" and content_type.startswith("video/"):
            extension = "mp4" if "mp4" in content_type else "webm"
            target = OUTPUT / f"石殻姆-活動與環境展示-v1.{extension}"
        elif kind == "metadata" and content_type == "application/json":
            target = OUTPUT / "錄製資料-v1.json"
        elif kind == "frames-metadata" and content_type == "application/json":
            target = OUTPUT / "逐格錄製資料-v2.json"
        elif kind.startswith("jpeg-") and kind[5:].isdigit() and content_type == "image/jpeg":
            target = OUTPUT / "逐格影格" / f"{int(kind[5:]):05d}.jpg"
        elif kind.startswith("frame-") and kind[6:].isdigit() and content_type == "image/png":
            target = OUTPUT / "驗證影格" / f"{int(kind[6:]):02d}秒.png"
        else:
            self.send_error(400)
            return
        data = self.rfile.read(length)
        if len(data) != length:
            self.send_error(400)
            return
        target.parent.mkdir(parents=True, exist_ok=True)
        if kind in ("metadata", "frames-metadata"):
            data = json.dumps(json.loads(data), ensure_ascii=False, indent=2).encode()
        temporary = target.with_suffix(target.suffix + ".part")
        temporary.write_bytes(data)
        temporary.replace(target)
        result = json.dumps({"saved": str(target), "bytes": len(data)}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(result)))
        self.end_headers()
        self.wfile.write(result)
        if not kind.startswith("jpeg-") or int(kind[5:]) % 100 == 0:
            print(f"SAVED {target.name} {len(data)} bytes", flush=True)


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(ROOT)))
    print(f"錄影頁：http://127.0.0.1:{port}/m3-creature/?film=1&save-local=1", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
