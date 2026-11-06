import { observabilityStore } from './store';

export async function withApiMetric(
  endpointGroup: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  const startedAt = performance.now();
  try {
    const response = await handler();
    observabilityStore.recordApiMetric({
      endpoint_group: endpointGroup,
      duration_ms: Math.round(performance.now() - startedAt),
      status_code: response.status,
    });
    return response;
  } catch (error) {
    observabilityStore.recordApiMetric({
      endpoint_group: endpointGroup,
      duration_ms: Math.round(performance.now() - startedAt),
      status_code: 500,
    });
    throw error;
  }
}
