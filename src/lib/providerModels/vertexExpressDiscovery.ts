const VERTEX_EXPRESS_VALIDATION_URL =
  "https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.7-flash";

export interface VertexExpressCuratedModel {
  id: string;
  name?: string;
}

export interface VertexExpressDiscoveryResult {
  models: VertexExpressCuratedModel[];
  failureStatus?: number;
  unavailable?: boolean;
}

export async function discoverVertexExpressModels(options: {
  apiKey: string;
  curatedModels: VertexExpressCuratedModel[];
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
}): Promise<VertexExpressDiscoveryResult> {
  try {
    const response = await options.fetchImpl(VERTEX_EXPRESS_VALIDATION_URL, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": options.apiKey,
      },
    });

    if (!response.ok) {
      return {
        models: [],
        failureStatus: response.status,
        unavailable: ![400, 401, 403].includes(response.status),
      };
    }

    return { models: options.curatedModels };
  } catch {
    return { models: [], unavailable: true };
  }
}
