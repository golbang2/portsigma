import type { AnalyzeRequest, AnalyzeResponse, RiskStrategyRequest, RiskStrategyResponse } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function parseError(response: Response) {
  const detail = await response.text();
  throw new Error(detail || "Request failed.");
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
