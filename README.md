# Portsigma

`Portsigma` is now organized as a full-stack application.

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
│  ├─ requirements.txt
│  └─ ...
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

If the backend is hosted elsewhere, set `NEXT_PUBLIC_API_BASE_URL`.

## Backend

- FastAPI
- Pydantic
- pandas / numpy
- yfinance
- arch

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Default backend URL: `http://localhost:8000`

## Features

- Yahoo Finance historical price loading
- CSV price input for unsupported assets
- Portfolio CSV save/load on the frontend
- FX conversion into a selected reporting currency
- Volatility for each asset and the total portfolio
- Pie chart for market value weights
- Normalized price trend chart
- Correlation table and asset valuation table

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
      "quantity": 2,
      "csv_text": ""
    }
  ]
}
```

