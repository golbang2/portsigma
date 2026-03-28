import { DEFAULT_PRICE_CSV } from "@/lib/constants";
import type { AssetDraft } from "@/lib/types";

function escapeCsvValue(value: string): string {
  const escaped = value.replaceAll('"', '""');
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(current);
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current);
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }
  return rows;
}

export function assetsToPortfolioCsv(assets: AssetDraft[]): string {
  const headers = ["name", "source_type", "ticker", "purchase_price", "purchase_currency", "quantity", "csv_text"];
  const rows = assets.map((asset) =>
    [
      asset.name,
      asset.source_type,
      asset.ticker,
      String(asset.purchase_price),
      asset.purchase_currency,
      String(asset.quantity),
      asset.csv_text.replaceAll("\r\n", "\n")
    ]
      .map(escapeCsvValue)
      .join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

export function parsePortfolioCsv(csvText: string): AssetDraft[] {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    throw new Error("포트폴리오 CSV에 자산 행이 없습니다.");
  }

  const [header, ...body] = rows;
  const requiredHeaders = ["name", "source_type", "ticker", "purchase_price", "purchase_currency", "quantity", "csv_text"];
  for (const field of requiredHeaders) {
    if (!header.includes(field)) {
      throw new Error(`포트폴리오 CSV에 '${field}' 컬럼이 없습니다.`);
    }
  }

  return body.map((columns, index) => {
    const getValue = (field: string) => columns[header.indexOf(field)] ?? "";
    return {
      id: `${Date.now()}-${index}`,
      name: getValue("name") || `Asset ${index + 1}`,
      source_type: getValue("source_type") === "csv" ? "csv" : "yahoo_finance",
      ticker: getValue("ticker"),
      purchase_price: Number(getValue("purchase_price") || 0),
      purchase_currency: (getValue("purchase_currency") || "KRW").toUpperCase(),
      quantity: Number(getValue("quantity") || 0),
      csv_text: getValue("csv_text") || DEFAULT_PRICE_CSV
    };
  });
}
