import type { AnalyzeRequest, AnalyzeResponse, RiskStrategyRequest, RiskStrategyResponse, StrategyRecommendRequest } from "@/lib/types";

export type TickerSearchResult = {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function parseError(response: Response) {
  const detail = await response.text();
  throw new Error(detail || "Request failed.");
}

export async function warmupBackend(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// null = network/server error, [] = no results, TickerSearchResult[] = success
export async function searchTicker(q: string): Promise<TickerSearchResult[] | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/portfolio/search-ticker?q=${encodeURIComponent(q)}`);
    if (!response.ok) return null;
    return response.json() as Promise<TickerSearchResult[]>;
  } catch {
    return null;
  }
}

export async function analyzePortfolio(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/portfolio/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json() as Promise<AnalyzeResponse>;
}

export async function analyzeRiskStrategy(payload: RiskStrategyRequest): Promise<RiskStrategyResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/portfolio/risk-strategy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json() as Promise<RiskStrategyResponse>;
}

export async function streamStrategyRecommendation(
  payload: StrategyRecommendRequest,
  onChunk: (text: string) => void,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/portfolio/strategy-recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "전략 추천 요청에 실패했습니다.");
  }

  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
}
