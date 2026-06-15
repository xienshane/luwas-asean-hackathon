import { describe, it, expect, vi, afterEach } from 'vitest';
import { predictImpact } from './impact';

afterEach(() => vi.restoreAllMocks());

describe('predictImpact', () => {
  it('POSTs features to /predict-impact and returns predictions', async () => {
    process.env.AI_SERVICE_URL = 'http://ai.test';
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        predictions: [{ affected: 500, affected_confidence: 0.8, confidence: 0.8, source: 'tabpfn', id: 'b1' }],
        model_framing: 'regressor', latency_ms: 12,
      }), { status: 200 }),
    );
    const out = await predictImpact([{
      category_ordinal: 4, total_houses: 1000, province_housing_units: 1058512,
      province_households: 1077180, structural_vuln_frac: 0.395, unimproved_water_frac: 0.078, id: 'b1',
    }]);
    expect(out.predictions[0].affected).toBe(500);
    expect(fetchMock).toHaveBeenCalledWith('http://ai.test/predict-impact', expect.objectContaining({ method: 'POST' }));
  });

  it('throws when AI_SERVICE_URL is unset', async () => {
    delete process.env.AI_SERVICE_URL;
    await expect(predictImpact([])).rejects.toThrow('AI_SERVICE_URL');
  });
});
