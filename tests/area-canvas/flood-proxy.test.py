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

class CoastalProxyTest(unittest.TestCase):
    def test_independent_api_zooms_and_attribute_allowlists(self):
        self.assertEqual(proxy.tile_query('z=13&x=0&y=0',proxy.PROVIDERS['storm-surge']['zooms']),(13,0,0))
        with self.assertRaises(ValueError): proxy.tile_query('z=13&x=0&y=0',proxy.PROVIDERS['tsunami']['zooms'])
        for kind,prefix in [('storm-surge','A49'),('tsunami','A40')]:
            fields=proxy.PROVIDERS[kind]['fields']
            result=proxy.sanitize_collection({'type':'FeatureCollection','features':[{'type':'Feature','geometry':None,
                'properties':{prefix+'_003':'3m以上5m未満','target_year':2022,'A31a_205':2,'unapproved':'discard'}}]},fields)
            self.assertEqual(set(result['features'][0]['properties']),set(fields))
            self.assertEqual(result['features'][0]['properties']['target_year'],2022)
            self.assertNotIn('A31a_205',result['features'][0]['properties'])
        with self.assertRaises(ValueError): proxy.TileService(provider='unsupported')

    def test_coastal_missing_key(self):
        with patch.dict(proxy.os.environ, {'REINFOLIB_API_KEY':''}):
            for kind in ('storm-surge','tsunami'):
                with self.assertRaises(ValueError): proxy.TileService(provider=kind).fetch((14,0,0))

    def test_coastal_http_endpoints_cache_and_boundaries(self):
        calls=[]
        def service(kind):
            def fetcher(tile):
                calls.append((kind,tile))
                return {'type':'FeatureCollection','features':[]}
            return proxy.TileService(fetcher,provider=kind)
        proxy.Handler.coastal_services={kind:service(kind) for kind in ('storm-surge','tsunami')}
        server=proxy.ThreadingHTTPServer(('127.0.0.1',0),proxy.Handler)
        worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
        base=f'http://127.0.0.1:{server.server_port}'
        def request(path,headers=None):
            return urllib.request.urlopen(urllib.request.Request(base+path,headers=headers or {}),timeout=4)
        try:
            for kind in ('storm-surge','tsunami'):
                for _ in range(2):
                    with request(f'/api/{kind}?z=14&x=0&y=0') as response:
                        self.assertEqual(json.load(response)['features'],[])
                        self.assertIsNone(response.headers.get('Access-Control-Allow-Origin'))
                for headers in ({'Origin':'https://example.invalid'},{'Host':'example.invalid'},{'Sec-Fetch-Site':'cross-site'}):
                    with self.assertRaises(urllib.error.HTTPError) as error: request(f'/api/{kind}?z=14&x=0&y=0',headers)
                    self.assertEqual(error.exception.code,403);error.exception.close()
            self.assertEqual(len(calls),2)
            with request('/api/storm-surge?z=13&x=0&y=0') as response: self.assertEqual(response.status,200)
            for path,code in [('/api/tsunami?z=13&x=0&y=0',400),('/api/unsupported?z=14&x=0&y=0',404),
                              ('/api/storm-surge?z=14&x=0&y=0&url=other',400)]:
                with self.assertRaises(urllib.error.HTTPError) as error: request(path)
                self.assertEqual(error.exception.code,code);error.exception.close()
            for kind in ('storm-surge','tsunami'):
                proxy.Handler.coastal_services[kind]=proxy.TileService(lambda tile: (_ for _ in ()).throw(ValueError('PRIVATE_ERROR')),provider=kind)
                with self.assertRaises(urllib.error.HTTPError) as error: request(f'/api/{kind}?z=14&x=1&y=1')
                self.assertEqual(error.exception.code,503)
                self.assertNotIn(b'PRIVATE_ERROR',error.exception.read());error.exception.close()
        finally:
            server.shutdown();server.server_close();worker.join()

class LandslideProxyTest(unittest.TestCase):
    def test_schema_zooms_and_missing_key(self):
        source=proxy.PROVIDERS['landslide']
        self.assertTrue(source['url'].endswith('/XKT029'))
        self.assertEqual(source['fields'],tuple(f'A33_{i:03d}' for i in range(1,9)))
        for z in range(11,16): self.assertEqual(proxy.tile_query(f'z={z}&x=0&y=0',source['zooms']),(z,0,0))
        for z in (10,16):
            with self.assertRaises(ValueError): proxy.tile_query(f'z={z}&x=0&y=0',source['zooms'])
        collection=proxy.sanitize_collection({'type':'FeatureCollection','features':[{'type':'Feature','geometry':None,
            'properties':{'A33_001':99,'A33_007':'2018/03/15','target_year':2024,'unapproved':'discard'}}]},source['fields'])
        self.assertEqual(collection['features'][0]['properties']['A33_001'],99)
        self.assertNotIn('target_year',collection['features'][0]['properties'])
        with patch.dict(proxy.os.environ,{'REINFOLIB_API_KEY':''}):
            with self.assertRaises(ValueError): proxy.TileService(provider='landslide').fetch((14,0,0))

    def test_http_cache_boundaries_and_unavailable(self):
        calls=[]
        def fetcher(tile):
            calls.append(tile)
            return {'type':'FeatureCollection','features':[]}
        proxy.Handler.landslide_service=proxy.TileService(fetcher,provider='landslide')
        server=proxy.ThreadingHTTPServer(('127.0.0.1',0),proxy.Handler)
        worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
        base=f'http://127.0.0.1:{server.server_port}/api/landslide'
        def request(query,headers=None):
            return urllib.request.urlopen(urllib.request.Request(base+query,headers=headers or {}),timeout=4)
        try:
            for _ in range(2):
                with request('?z=11&x=0&y=0') as response:
                    self.assertEqual(json.load(response)['features'],[])
                    self.assertIsNone(response.headers.get('Access-Control-Allow-Origin'))
            self.assertEqual(len(calls),1)
            for headers in ({'Origin':'https://example.invalid'},{'Host':'example.invalid'},{'Sec-Fetch-Site':'cross-site'}):
                with self.assertRaises(urllib.error.HTTPError) as error: request('?z=14&x=0&y=0',headers)
                self.assertEqual(error.exception.code,403);error.exception.close()
            for query in ('?z=10&x=0&y=0','?z=14&x=0&y=0&url=other'):
                with self.assertRaises(urllib.error.HTTPError) as error: request(query)
                self.assertEqual(error.exception.code,400);error.exception.close()
            proxy.Handler.landslide_service=proxy.TileService(lambda tile: (_ for _ in ()).throw(ValueError('PRIVATE_ERROR')),provider='landslide')
            with self.assertRaises(urllib.error.HTTPError) as error: request('?z=14&x=1&y=1')
            self.assertEqual(error.exception.code,503);self.assertNotIn(b'PRIVATE_ERROR',error.exception.read());error.exception.close()
        finally:
            server.shutdown();server.server_close();worker.join()

if __name__ == '__main__': unittest.main()
