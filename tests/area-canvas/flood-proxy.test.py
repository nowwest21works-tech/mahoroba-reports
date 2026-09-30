"""No live API or secrets are needed for these proxy tests."""
import importlib.util
from pathlib import Path
import threading
import unittest
from unittest.mock import patch
import urllib.request
import urllib.error
import json
import sys
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('proxy', Path(__file__).resolve().parents[2] / 'scripts/area-canvas-local-proxy.py')
proxy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proxy)

class ProxyTest(unittest.TestCase):
    def test_tile_validation(self):
        self.assertEqual(proxy.tile_query('z=14&x=14381&y=6489'),(14,14381,6489))
        for query in ('z=13&x=1&y=1','z=14&x=16384&y=0','z=14&x=-1&y=0','z=14&x=0&y=0&url=other','z=14&x=0&x=1&y=0'):
            with self.assertRaises(ValueError): proxy.tile_query(query)
    def test_sanitizer_and_missing_key(self):
        self.assertEqual(proxy.sanitize_collection([])['features'],[])
        with self.assertRaises(ValueError): proxy.sanitize_collection({})
        result=proxy.sanitize_collection({'type':'FeatureCollection','features':[{'type':'Feature','geometry':None,'properties':{'unexpected':'discard','A31a_202':'試験'}}]})
        self.assertNotIn('unexpected',result['features'][0]['properties'])
        with patch.dict(proxy.os.environ, {'REINFOLIB_API_KEY':''}):
            with self.assertRaises(ValueError): proxy.TileService().fetch((14,0,0))
    def test_proxy_boundaries_cache_and_errors(self):
        requests=[]
        def fetcher(tile):
            requests.append(tile)
            return {'type':'FeatureCollection','features':[]}
        proxy.Handler.service=proxy.TileService(fetcher)
        server=proxy.ThreadingHTTPServer(('127.0.0.1',0),proxy.Handler)
        worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
        base=f'http://127.0.0.1:{server.server_port}'
        def request(path,headers=None):
            return urllib.request.urlopen(urllib.request.Request(base+path,headers=headers or {}),timeout=3)
        try:
            for _ in range(2):
                with request('/api/flood?z=14&x=0&y=0') as response:
                    self.assertEqual(json.load(response)['features'],[])
                    self.assertIsNone(response.headers.get('Access-Control-Allow-Origin'))
            self.assertEqual(len(requests),1)
            with request('/area-canvas/') as response: self.assertEqual(response.status,200)
            for path,headers,code in [('/.git/config',{},404),('/scripts/area-canvas-local-proxy.py',{},404),('/area-canvas/.env',{},404),('/area-canvas/../package.json',{},404),('/api/flood?z=14&x=0&y=0',{'Origin':'https://example.invalid'},403),('/api/flood?z=14&x=0&y=0',{'Host':'example.invalid'},403),('/api/flood?z=14&x=0&y=0',{'Sec-Fetch-Site':'cross-site'},403),('/api/flood?z=13&x=0&y=0',{},400)]:
                with self.assertRaises(urllib.error.HTTPError) as error: request(path,headers)
                self.assertEqual(error.exception.code,code)
                error.exception.close()
            proxy.Handler.service=proxy.TileService(lambda tile: (_ for _ in ()).throw(ValueError('PRIVATE_ERROR')))
            with self.assertRaises(urllib.error.HTTPError) as error: request('/api/flood?z=14&x=1&y=1')
            self.assertEqual(error.exception.code,503)
            self.assertNotIn(b'PRIVATE_ERROR',error.exception.read())
            error.exception.close()
        finally:
            server.shutdown();server.server_close();worker.join()

if __name__ == '__main__': unittest.main()
