# Portsigma

Portsigma is a portfolio risk dashboard built with `Next.js` and `FastAPI`.

It lets you combine Yahoo Finance price history and custom CSV price data, then analyze a multi-asset portfolio with currency conversion, GARCH-based volatility, VaR, drawdown, DCC correlation, and hedge-oriented risk diagnostics.

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
- arch

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

- Yahoo Finance historical price loading
- CSV price input for unsupported assets
- Portfolio CSV export and restore
- Purchase price and quantity tracking
- Reporting-currency conversion
- Asset-level and portfolio-level volatility using GARCH
- DCC-based correlation matrix
- VaR 95% with normal-distribution chart
- Portfolio volatility time series
- Maximum drawdown time series
- Market value weights pie chart
- Normalized price trend chart
- Risk factor analysis with:
  - portfolio-to-target correlation
  - beta
  - hedge ratio
- RAG-based hedge guidance flow

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
http://localhost:8000/health
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

Use [frontend/.env.example](F:\Portsigma\frontend\.env.example) as a template.

Main variable:

- `NEXT_PUBLIC_API_BASE_URL`

Example:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### Backend

Use [backend/.env.example](F:\Portsigma\backend\.env.example) as a template.

Main variables:

- `FRONTEND_ORIGINS`
- `OPENAI_API_KEY` (optional, only if the server should use its own OpenAI key)

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
      "name": "Apple",
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

Returns risk metrics for a selected hedge target, including:

- portfolio-to-target correlation
- beta
- hedge ratio

### `POST /api/v1/portfolio/strategy-recommend`

Streams RAG-based hedge guidance using the analysis result plus internal reference documents.

Current RAG guidance is intentionally written at a general, educational level:

- no specific stock picks
- no specific ETF ticker recommendations
- no direct buy/sell instruction style output

## RAG Documents

RAG reference documents live in:

- [backend/app/rag/documents](F:\Portsigma\backend\app\rag\documents)

These documents currently cover:

- hedge basics
- beta hedge concepts
- FX hedge concepts
- correlation-based diversification
- volatility management
- index-level hedge instruments
- VaR and position sizing
- practical hedge process

The recommendation service is implemented in:

- [strategy_recommend.py](F:\Portsigma\backend\app\services\strategy_recommend.py)

## Deployment

### Render

Deploy the backend from the `backend` directory.

- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Environment Variable: `FRONTEND_ORIGINS=https://your-frontend-domain.vercel.app`

Starter config:

- [render.yaml](F:\Portsigma\render.yaml)

### Vercel

Deploy the frontend from the `frontend` directory.

- Root Directory: `frontend`
- Framework Preset: `Next.js`
- Environment Variable: `NEXT_PUBLIC_API_BASE_URL=https://your-render-backend.onrender.com`

Starter config:

- [vercel.json](F:\Portsigma\frontend\vercel.json)

## Notes

- CSV-based assets are useful when Yahoo Finance does not provide a ticker or price history.
- Volatility values shown in the product are based on GARCH, not simple standard deviation.
- Correlation analysis uses DCC-based conditional correlation rather than a static correlation matrix.
- This repository currently focuses on analytics and educational hedge guidance, not account management or billing.
