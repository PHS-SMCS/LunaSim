import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findLiveApiReferences,
  resolveLiveApiExpression,
  resolveEngineLiveApis,
  stripLiveApiReferences
} from '../sim/liveApi.js';

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('detects and strips API references without removing model references', () => {
  const expression = '[Population] * [humidity][10001] + [gdp][US]';
  assert.deepEqual(findLiveApiReferences(expression).map(r => r.type), ['humidity', 'gdp']);
  assert.equal(stripLiveApiReferences(expression), '[Population] * 0 + 0');
});

test('resolves current weather through Nominatim and Open-Meteo', async () => {
  const urls = [];
  const fetchImpl = async url => {
    urls.push(url);
    if (url.includes('nominatim')) return response([{ lat: '40.75', lon: '-73.99' }]);
    return response({ current: { temperature_2m: 21.5 } });
  };
  const result = await resolveLiveApiExpression('[temp][10001] + 2', { fetchImpl });
  assert.equal(result, '21.5 + 2');
  assert.equal(urls.length, 2);
});

test('falls back to ZIP geocoding when Nominatim is blocked', async () => {
  const fetchImpl = async url => {
    if (url.includes('nominatim')) throw new TypeError('blocked');
    if (url.includes('zippopotam')) return response({ places: [{ latitude: '40.75', longitude: '-73.99' }] });
    return response({ current: { wind_speed_10m: 14.2 } });
  };
  assert.equal(await resolveLiveApiExpression('[wind][10001]', { fetchImpl }), '14.2');
});

test('resolves World Bank indicators using an ISO alpha-2 country code', async () => {
  const fetchImpl = async url => {
    assert.match(url, /country\/US\/indicator\/NY\.GDP\.MKTP\.CD/);
    return response([{ page: 1 }, [{ value: 27360935000000 }]]);
  };
  assert.equal(await resolveLiveApiExpression('[gdp][US]', { fetchImpl }), '27360935000000');
});

test('requires a Finnhub key and resolves a current quote when supplied', async () => {
  await assert.rejects(
    resolveLiveApiExpression('[stock][AAPL]', { fetchImpl: async () => response({ c: 200 }) }),
    /Finnhub API key required/
  );
  const fetchImpl = async url => {
    assert.match(url, /symbol=AAPL/);
    assert.match(url, /token=test-key/);
    return response({ c: 212.34 });
  };
  assert.equal(await resolveLiveApiExpression('[stock][AAPL]', { fetchImpl, finnhubKey: 'test-key' }), '212.34');
});

test('caches duplicate references and resolves all engine equation locations', async () => {
  let requests = 0;
  const fetchImpl = async url => {
    requests++;
    if (url.includes('nominatim')) return response([{ lat: '1', lon: '2' }]);
    return response({ current: { relative_humidity_2m: 55 } });
  };
  const engine = {
    stocks: {
      Tank: {
        equation: '[humidity][10001]',
        inflows: { rate: { equation: '[humidity][10001] / 10' } },
        outflows: {}
      }
    },
    converters: { Humidity: { equation: '[humidity][10001]' } },
    variables: [], valves: []
  };
  const resolved = await resolveEngineLiveApis(engine, { fetchImpl });
  assert.equal(resolved.stocks.Tank.equation, '55');
  assert.equal(resolved.stocks.Tank.inflows.rate.equation, '55 / 10');
  assert.equal(resolved.converters.Humidity.equation, '55');
  assert.equal(requests, 2, 'one geocode and one weather request should be shared');
  assert.equal(engine.stocks.Tank.equation, '[humidity][10001]', 'base model must not be mutated');
});

test('reports invalid parameters and non-numeric API responses', async () => {
  await assert.rejects(
    resolveLiveApiExpression('[temp][ABCDE]', { fetchImpl: async () => response([]) }),
    /Invalid US ZIP code/
  );
  await assert.rejects(
    resolveLiveApiExpression('[population][USA]', { fetchImpl: async () => response([]) }),
    /Invalid ISO country code/
  );
});
