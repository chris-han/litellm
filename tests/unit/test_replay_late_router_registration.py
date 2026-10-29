import copy

import litellm
from litellm.litellm_core_utils.get_model_cost_map import adopt_model_cost_map


def test_router_populated_after_construction_replays_deployment_pricing():
    base = copy.deepcopy(litellm.model_cost)
    router = litellm.Router()
    router.set_model_list([{
        'model_name': 'fixture-alias',
        'litellm_params': {'model': 'openai/gpt-4o', 'api_key': 'fixture-only'},
        'model_info': {'id': 'fixture-late-registration', 'input_cost_per_token': 0.001},
    }])
    try:
        assert litellm.model_cost['fixture-late-registration']['input_cost_per_token'] == 0.001
        adopt_model_cost_map(copy.deepcopy(base))
        assert litellm.model_cost['fixture-late-registration']['input_cost_per_token'] == 0.001
        assert router.get_deployment('fixture-late-registration') is not None
    finally:
        router.discard()
        adopt_model_cost_map(base)
