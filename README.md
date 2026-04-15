# Portsigma

**Live: [https://portsigma.vercel.app](https://portsigma.vercel.app)**

Portsigma is a portfolio risk dashboard built with Next.js and FastAPI.

Combine Yahoo Finance price history and custom CSV price data, then analyze a multi-asset portfolio with currency conversion, GARCH-based volatility, VaR/CVaR, drawdown, DCC correlation, Sharpe ratio, and AI-powered hedge guidance.

## Stack

### Frontend

- Next.js App Router
- TypeScript
- Tailwind CSS
- Recharts

### Backend

- FastAPI
- Pydantic
- pandas / numpy
- yfinance
- arch (GARCH)

## Project Structure

```text
Portsigma/
├─ frontend/
│  ├─ app/
│  ├─ components/
│  ├─ lib/
│  ├─ package.json
│  └─ ...
├─ backend/
│  ├─ app/
│  │  ├─ analytics/
│  │  ├─ rag/
│  │  ├─ routers/
│  │  ├─ schemas/
│  │  ├─ services/
│  │  └─ main.py
│  ├─ main.py
│  ├─ requirements.txt
│  └─ ...
├─ render.yaml
└─ README.md
```

## Main Features

- Yahoo Finance historical price loading with autocomplete (Korean stock support)
- CSV price input for assets not covered by Yahoo Finance (up to 15 assets)
- Portfolio CSV export and restore
- Purchase price and quantity tracking
- Reporting-currency conversion
- Korean / English language toggle
- Portfolio name with inline edit
- Auto-save draft to localStorage
- Summary metrics: total cost basis, market value, unrealized P&L, portfolio volatility, Sharpe ratio
- GARCH-based asset-level and portfolio-level volatility
- Portfolio volatility time series chart
- VaR 95% with normal distribution chart
- CVaR 95% with normal distribution chart
- Maximum drawdown time series chart
- DCC-based correlation matrix
- Market value weights pie chart
- Normalized price trend chart
- Risk factor analysis:
  - portfolio-to-target correlation
  - beta
  - hedge ratio
- RAG-based AI hedge strategy recommendation (bring-your-own OpenAI key)
- Backend cold-start warmup banner (Render free tier)
- Rate limiting on all API endpoints

## Local Run

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend default URL: `http://localhost:8000`

Health check:

```bash
curl http://localhost:8000/health
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend default URL: `http://localhost:3000`

## Environment Variables

### Frontend

Use `frontend/.env.example` as a template.

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### Backend

Use `backend/.env.example` as a template.

```env
FRONTEND_ORIGINS=http://localhost:3000
OPENAI_API_KEY=sk-...   # optional — users can supply their own key in the UI
```

## API Overview

### `POST /api/v1/portfolio/analyze`

Runs the main portfolio analysis.

Example payload:

```json
{
  "portfolio_name": "My Portfolio",
  "report_currency": "KRW",
  "period": "5y",
  "assets": [
    {
      "name": "Asset 1",
      "source_type": "yahoo_finance",
      "ticker": "AAPL",
      "purchase_price": 180,
      "purchase_currency": "USD",
      "quantity": 2,
      "csv_text": ""
    }
  ]
}
```

### `POST /api/v1/portfolio/risk-strategy`

Returns risk metrics for a selected hedge target:

- portfolio-to-target correlation
- beta
- hedge ratio

### `POST /api/v1/portfolio/strategy-recommend`

Streams RAG-based hedge guidance using the analysis result plus internal reference documents.

Guidance is intentionally educational:

- no specific stock picks
- no specific ETF ticker recommendations
- no direct buy/sell instruction style output

## RAG Documents

Reference documents live in `backend/app/rag/documents/` and currently cover:

- hedge basics
- beta hedge concepts
- FX hedge concepts
- correlation-based diversification
- volatility management
- index-level hedge instruments
- VaR and position sizing
- practical hedge process

The recommendation service is implemented in `backend/app/services/strategy_recommend.py`.

## Deployment

### Backend — Render

- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Environment Variable: `FRONTEND_ORIGINS=https://portsigma.vercel.app`

Starter config: [render.yaml](render.yaml)

### Frontend — Vercel

- Root Directory: `frontend`
- Framework Preset: `Next.js`
- Environment Variable: `NEXT_PUBLIC_API_BASE_URL=https://your-render-backend.onrender.com`

Starter config: `frontend/vercel.json`

## Notes

- CSV-based assets are useful when Yahoo Finance does not cover a ticker or price history.
- Volatility values are based on GARCH, not simple standard deviation.
- Correlation analysis uses DCC-based conditional correlation, not a static matrix.
- Sharpe ratio is computed from GARCH volatility and the annualized portfolio return.
- This repository focuses on analytics and educational hedge guidance, not account management or billing.
