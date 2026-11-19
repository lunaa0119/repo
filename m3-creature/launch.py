"""啟動本機觀察室；既有同一頁面正在運作時，直接開啟它。"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen
import webbrowser


def main():
    root = Path(__file__).resolve().parent.parent
    for port in range(8765, 8770):
        url = f"http://127.0.0.1:{port}/m3-creature/"
        try:
            with urlopen(url, timeout=1) as response:
                if "石殻姆".encode() in response.read(16384):
                    webbrowser.open(url)
                    print(f"已開啟正在運作的觀察室：{url}")
                    return
        except Exception:
            pass
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), partial(SimpleHTTPRequestHandler, directory=str(root)))
        except OSError:
            continue
        print(f"石殻姆觀察室：{url}\n請保留此終端機視窗；Control+C 可停止。", flush=True)
        webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\n觀察室已停止。")
        finally:
            server.server_close()
        return
    raise SystemExit("8765–8769 連接埠皆已使用，請先關閉舊的預覽伺服器。")


if __name__ == "__main__":
    main()
