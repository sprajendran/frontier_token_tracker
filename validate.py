"""Run browser tests with installed Chrome; no third-party Python packages needed."""
import base64
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import time
import functools
import http.server
import threading
from urllib.parse import urlparse
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
ARTIFACTS = ROOT / "test-artifacts"


class CDP:
    def __init__(self, url):
        target = urlparse(url)
        self.sock = socket.create_connection((target.hostname, target.port), timeout=10)
        self.sock.sendall((f"GET {target.path} HTTP/1.1\r\nHost: {target.netloc}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {base64.b64encode(os.urandom(16)).decode()}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        header = b""
        while not header.endswith(b"\r\n\r\n"):
            header += self.sock.recv(1)
        if not header.startswith(b"HTTP/1.1 101 "):
            raise RuntimeError(header.decode())
        self.seq = 0

    def read(self, count):
        data = b""
        while len(data) < count:
            chunk = self.sock.recv(count - len(data))
            if not chunk:
                raise RuntimeError("Chrome disconnected")
            data += chunk
        return data

    def call(self, method, params=None):
        self.seq += 1
        data = json.dumps({"id": self.seq, "method": method, "params": params or {}}).encode()
        mask = os.urandom(4)
        length = len(data)
        header = bytes([0x81, 0x80 | length]) if length < 126 else bytes([0x81, 0xFE]) + struct.pack("!H", length)
        self.sock.sendall(header + mask + bytes(value ^ mask[i % 4] for i, value in enumerate(data)))
        while True:
            first, second = self.read(2)
            length = second & 127
            if length == 126:
                length = struct.unpack("!H", self.read(2))[0]
            elif length == 127:
                length = struct.unpack("!Q", self.read(8))[0]
            payload = self.read(length)
            if first & 15 != 1:
                continue
            result = json.loads(payload)
            if result.get("id") == self.seq:
                if "error" in result:
                    raise RuntimeError(result["error"])
                return result["result"]


def main():
    class QuietHandler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def do_POST(self):
            self.rfile.read(int(self.headers.get('Content-Length', 0)))
            body = b'data: {"usage":{"input_tokens":9,"output_tokens":6}}\n\n'
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        def do_GET(self):
            if self.path == '/test/stream':
                body = b'event: message_delta\ndata: {"usage":{"output_tokens":11}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n'
                self.send_response(200)
                self.send_header('Content-Type', 'text/event-stream')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                super().do_GET()
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    manifest = json.loads((ROOT / "manifest.json").read_text())
    files = [f for item in manifest["content_scripts"] for f in item["js"]]
    files += [manifest["background"]["service_worker"], manifest["action"]["default_popup"], manifest["options_page"], manifest["side_panel"]["default_path"]]
    assert all((ROOT / name).exists() for name in files), "Missing manifest asset"
    profiles = ARTIFACTS / "chrome-profiles"
    profiles.mkdir(parents=True, exist_ok=True)
    profile = profiles / ("test-profile-" + str(time.time_ns()))
    chrome = Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "Google/Chrome/Application/chrome.exe"
    proc = subprocess.Popen([str(chrome), "--headless", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0", "--allow-file-access-from-files", "--user-data-dir=" + str(profile), "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    client = None
    try:
        deadline = time.monotonic() + 40
        port_file = profile / "DevToolsActivePort"
        while not port_file.exists():
            if time.monotonic() > deadline:
                raise RuntimeError("Chrome did not start")
            time.sleep(0.1)
        port = port_file.read_text().splitlines()[0]
        pages = json.load(urlopen("http://127.0.0.1:" + port + "/json"))
        client = CDP(next(page["webSocketDebuggerUrl"] for page in pages if page["type"] == "page"))
        client.call("Page.enable")
        client.call("Runtime.enable")
        # Compile every production JS file without executing it.
        for path in ROOT.glob("*.js"):
            result = client.call("Runtime.compileScript", {"expression": path.read_text(encoding="utf-8"), "sourceURL": path.name, "persistScript": False})
            assert "exceptionDetails" not in result, str(result)
        client.call("Page.navigate", {"url": 'http://127.0.0.1:' + str(server.server_port) + '/tests.html'})
        output = ""
        while time.monotonic() < deadline:
            result = client.call("Runtime.evaluate", {"expression": "document.getElementById('results')?.textContent || ''", "returnByValue": True})
            output = result.get("result", {}).get("value", "")
            if "ALL " in output or "FAIL " in output:
                break
            time.sleep(0.1)
        print(output)
        html = client.call("Runtime.evaluate", {"expression": "document.documentElement.outerHTML", "returnByValue": True})["result"]["value"]
        (ARTIFACTS / "test-results.html").write_text(html, encoding="utf-8")
        assert "TESTS PASSED" in output and "FAIL " not in output, "Browser tests failed or timed out"
        fixture = {"id": "smoke", "provider": "Test", "model": "Test model", "timestamp": int(time.time()*1000), "input": 12, "output": 7, "source": "reported", "inputQuality": "reported", "outputQuality": "reported", "status": "completed", "categories": {}, "cost": None}
        mock = """globalThis.chrome={runtime:{async sendMessage(m){if(m.type==='query')return {ok:true,records:[FIXTURE]};if(m.type==='settings')return {ok:true,enabled:true,overlay:true,rates:[]};return {ok:true};},onMessage:{addListener(){}},async openOptionsPage(){}},windows:{async getCurrent(){return {id:1};}},sidePanel:{async open(){}}};""".replace('FIXTURE', json.dumps(fixture))
        client.call('Page.addScriptToEvaluateOnNewDocument', {'source': mock})
        for page, expression in [
            ('dashboard.html', "document.getElementById('input')?.textContent==='12' && document.getElementById('models')?.textContent.includes('Test model') && document.getElementById('diagnostics')?.textContent.includes('unavailable')"),
            ('popup.html', "document.getElementById('input')?.textContent==='12' && document.getElementById('models')?.textContent.includes('Test model')"),
            ('options.html', "document.getElementById('enabled')?.checked===true && document.getElementById('rates')?.value==='[]'")]:
            client.call('Page.navigate', {'url': 'http://127.0.0.1:' + str(server.server_port) + '/' + page})
            ui_deadline = time.monotonic() + 5
            ok = False
            while time.monotonic() < ui_deadline:
                result = client.call('Runtime.evaluate', {'expression': expression, 'returnByValue': True})
                ok = result.get('result', {}).get('value') is True
                if ok:
                    break
                time.sleep(0.1)
            assert ok, 'UI smoke test failed: ' + page
            print('PASS UI renders: ' + page)
        client.call('Page.navigate', {'url': 'http://127.0.0.1:' + str(server.server_port) + '/popup.html'})
        popup_deadline = time.monotonic() + 5
        while time.monotonic() < popup_deadline:
            loaded = client.call('Runtime.evaluate', {'expression': "!!document.getElementById('inputQuality') && typeof load==='function'", 'returnByValue': True})
            if loaded.get('result', {}).get('value'):
                break
            time.sleep(0.1)
        preview_check = """(async()=>{
          chrome.runtime.sendMessage=async()=>({ok:true,records:[{model:'Partial',provider:'Test',timestamp:Date.now(),input:null,output:0,inputQuality:'unavailable',outputQuality:'reported'}]});
          await load();
          return document.getElementById('input').textContent==='Unavailable' && document.getElementById('output').textContent==='0' && document.getElementById('inputQuality').textContent.includes('1 unavailable') && document.getElementById('models').textContent.includes('Input unavailable · Output 0');
        })()"""
        result = client.call('Runtime.evaluate', {'expression': preview_check, 'awaitPromise': True, 'returnByValue': True})
        assert result.get('result', {}).get('value') is True, 'Popup unavailable/zero counts failed: ' + str(result)
        print('PASS Popup distinguishes unavailable counts from reported zero')
        print("All JavaScript compiled; manifest assets verified.")
    finally:
        server.shutdown()
        if client:
            try:
                client.call("Browser.close")
            except (OSError, RuntimeError):
                pass
            client.sock.close()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.terminate()


if __name__ == "__main__":
    main()
