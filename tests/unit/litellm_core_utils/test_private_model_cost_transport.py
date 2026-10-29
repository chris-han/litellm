"""Private metadata fetch must not borrow the admitted model transport."""
import importlib
import os
import unittest
from unittest.mock import patch
import httpx
m=importlib.import_module('litellm.litellm_core_utils.get_model_cost_map')

class PrivateMetadataTransport(unittest.IsolatedAsyncioTestCase):
 async def test_private_metadata_has_exact_service_auth_and_closes_client(self):
  seen=[];clients=[];real=httpx.AsyncClient
  def handler(request):
   seen.append(request);return httpx.Response(401,json={'detail':'controlled rejection'})
  def client(**options):
   self.assertEqual(options,{"trust_env":False,"follow_redirects":False})
   c=real(transport=httpx.MockTransport(handler),trust_env=False,follow_redirects=False);clients.append(c);return c
  with patch.dict(os.environ,{'LITELLM_LOCAL_MODEL_COST_MAP':'False','LITELLM_MODEL_COST_MAP_URL':'http://backend:8899/cost-map','LITELLM_MODEL_COST_MAP_API_KEY':'fixture-service'}),patch.object(m,'_default_reload_client',side_effect=RuntimeError('model admission transport must not be used')),patch.object(m.httpx,'AsyncClient',side_effect=client):
   result=await m.refetch_model_cost_map('http://backend:8899/cost-map',max_attempts=1)
  self.assertIsInstance(result,m.ModelCostMapReloadUnavailable)
  self.assertEqual(len(seen),1);self.assertEqual(seen[0].method,'GET');self.assertEqual(seen[0].headers['authorization'],'Bearer fixture-service');self.assertTrue(clients[0].is_closed)
 async def test_other_url_retains_existing_guard_and_never_inherits_key(self):
  with patch.dict(os.environ,{'LITELLM_LOCAL_MODEL_COST_MAP':'False','LITELLM_MODEL_COST_MAP_URL':'http://backend:8899/cost-map','LITELLM_MODEL_COST_MAP_API_KEY':'fixture-service'}),patch.object(m,'_default_reload_client',side_effect=RuntimeError('guard retained')):
   self.assertIsNone(m._private_source_headers('http://other/model'))
   with self.assertRaisesRegex(RuntimeError,'guard retained'):await m.refetch_model_cost_map('http://other/model')
