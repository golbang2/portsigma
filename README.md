# Portsigma

`Portsigma` is organized as a full-stack application.

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
│  │  ├─ main.py
│  │  ├─ routers/
│  │  ├─ schemas/
│  │  ├─ services/
│  │  └─ analytics/
│  ├─ main.py
│  ├─ requirements.txt
│  └─ ...
├─ render.yaml
└─ README.md
```

## Frontend

- Next.js App Router
- TypeScript
- Tailwind CSS
- Recharts

```bash
cd frontend
npm install
npm run dev
```

Default frontend URL: `http://localhost:3000`

Use `frontend/.env.example` as the template for local environment variables.

## Backend

- FastAPI
- Pydantic
- pandas / numpy
- yfinance
- arch

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Default backend URL: `http://localhost:8000`

Use `backend/.env.example` as the template for local environment variables.

## Deploy

### Render

Deploy the backend from the `backend` directory.

- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Environment Variable: `FRONTEND_ORIGINS=https://your-frontend-domain.vercel.app`

A starter `render.yaml` is included at the repo root.

### Vercel

Deploy the frontend from the `frontend` directory.

- Root Directory: `frontend`
- Framework Preset: `Next.js`
- Environment Variable: `NEXT_PUBLIC_API_BASE_URL=https://your-render-backend.onrender.com`

A minimal `frontend/vercel.json` is included.

## Features

- Yahoo Finance historical price loading
- CSV price input for unsupported assets
- Portfolio CSV save/load on the frontend
- FX conversion into a selected reporting currency
- Volatility for each asset and the total portfolio
- DCC-based conditional correlation matrix
- VaR visualization with a normal-distribution tail chart
- Pie chart for market value weights
- Normalized price trend chart
- Asset valuation table

## API

### `POST /api/v1/portfolio/analyze`

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
