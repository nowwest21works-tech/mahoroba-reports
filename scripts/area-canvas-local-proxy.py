"""Area Canvas local-only XKT026 proxy + restricted static server (stdlib only)."""
import argparse
import gzip
import io
import json
import math
import os
from pathlib import Path
import threading
import time
from collections import OrderedDict
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlencode, urlsplit, unquote
from urllib.request import Request, build_opener, HTTPRedirectHandler

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = 'https://www.reinfolib.mlit.go.jp/ex-api/external/XKT026'
FIELDS = ('A31a_201', 'A31a_202', 'A31a_203', 'A31a_204', 'A31a_205')
LIMIT = 32 * 1024 * 1024

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def tile_query(query):
    args = parse_qs(query, keep_blank_values=True)
    if set(args) != {'z', 'x', 'y'} or any(len(v) != 1 or not v[0].isascii() or not v[0].isdigit() for v in args.values()):
        raise ValueError('Invalid tile')
    z, x, y = (int(args[k][0]) for k in ('z', 'x', 'y'))
    if z not in (14, 15) or not 0 <= x < 2 ** z or not 0 <= y < 2 ** z:
        raise ValueError('Invalid tile')
    return z, x, y

def sanitize_collection(body):
    if body == []:
        return {'type': 'FeatureCollection', 'features': []}
    if not isinstance(body, dict) or body.get('type') != 'FeatureCollection' or not isinstance(body.get('features'), list):
        raise ValueError('Invalid response')
    features = []
    for item in body['features']:
        if not isinstance(item, dict):
            features.append(None)  # Browser treats malformed items as incomplete, never No Hit.
            continue
        props = item.get('properties')
        props = props if isinstance(props, dict) else {}
        features.append({'type': item.get('type'), 'geometry': item.get('geometry'),
                         'properties': {k: props.get(k) for k in FIELDS}})
    return {'type': 'FeatureCollection', 'features': features}

class TileService:
    def __init__(self, fetcher=None):
        self.cache = OrderedDict()
        self.lock = threading.Lock()
        self.last_request = 0
        self.fetcher = fetcher or self.fetch

    def fetch(self, tile):
        key = os.environ.get('REINFOLIB_API_KEY')
        if not key:
            raise ValueError('Unavailable')
        z, x, y = tile
        req = Request(UPSTREAM + '?' + urlencode({'response_format': 'geojson', 'z': z, 'x': x, 'y': y}),
                      headers={'Ocp-Apim-Subscription-Key': key, 'Accept': 'application/json', 'Accept-Encoding': 'gzip'})
        with build_opener(NoRedirect()).open(req, timeout=20) as response:
            raw = response.read(LIMIT + 1)
            if len(raw) > LIMIT:
                raise ValueError('Oversize')
            if 'gzip' in (response.headers.get('Content-Encoding') or '').lower():
                raw = gzip.GzipFile(fileobj=io.BytesIO(raw)).read(LIMIT + 1)
                if len(raw) > LIMIT:
                    raise ValueError('Oversize')
        # Raw payload is never printed or saved; reject any reflected secret.
        if key.encode() in raw:
            raise ValueError('Unavailable')
        return sanitize_collection(json.loads(raw))

    def get(self, tile):
        with self.lock:
            now = time.monotonic()
            prior = self.cache.get(tile)
            if prior and now - prior[0] < 300:
                return prior[1]
            time.sleep(max(0, 0.5 - (now - self.last_request)))
            self.last_request = time.monotonic()
            body = self.fetcher(tile)
            self.cache[tile] = (time.monotonic(), body)
            while len(self.cache) > 16:
                self.cache.popitem(last=False)
            return body

class Handler(SimpleHTTPRequestHandler):
    service = TileService()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *args):
        pass  # No request/header/error logging, including upstream failures.

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def local_request(self):
        authority = f'127.0.0.1:{self.server.server_port}'
        return (self.headers.get('Host') == authority
                and self.headers.get('Origin') in (None, f'http://{authority}')
                and self.headers.get('Sec-Fetch-Site') not in ('cross-site', 'same-site'))

    def send_json(self, status, body):
        raw = json.dumps(body, ensure_ascii=False, allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        try:
            self.wfile.write(raw)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def static_allowed(self, path):
        resolved = (ROOT / unquote(path).lstrip('/')).resolve()
        area = (ROOT / 'area-canvas').resolve()
        if not resolved.is_relative_to(area) or any(part.startswith('.') for part in resolved.relative_to(area).parts):
            return False
        if resolved.is_dir():
            return (resolved / 'index.html').is_file()
        return resolved.suffix.lower() in ('.html', '.js', '.css', '.json', '.geojson', '.md', '.png', '.jpg', '.svg', '.woff', '.woff2')

    def do_GET(self):
        if not self.local_request():
            self.send_json(403, {'status': 'UNAVAILABLE'})
            return
        url = urlsplit(self.path)
        if url.path == '/api/flood':
            try:
                tile = tile_query(url.query)
            except (ValueError, OverflowError):
                self.send_json(400, {'status': 'UNAVAILABLE'})
                return
            try:
                body = self.service.get(tile)
                self.send_json(200, body)
            except Exception:
                self.send_json(503, {'status': 'UNAVAILABLE', 'message': '公式Flood資料を取得できません。'})
            return
        if not self.static_allowed(url.path):
            self.send_json(404, {'status': 'UNAVAILABLE'})
            return
        super().do_GET()

    def do_HEAD(self):
        if not self.local_request() or not self.static_allowed(urlsplit(self.path).path):
            self.send_response(404)
            self.end_headers()
            return
        super().do_HEAD()

    def do_POST(self):
        self.send_json(405, {'status': 'UNAVAILABLE'})

    def list_directory(self, path):
        self.send_error(404)
        return None

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'Area Canvas local Pilot: http://127.0.0.1:{server.server_port}/area-canvas/', flush=True)
    print('REINFOLIB_API_KEY: ' + ('存在する' if os.environ.get('REINFOLIB_API_KEY') else '存在しない'), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
