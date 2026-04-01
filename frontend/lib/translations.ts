export type Lang = "ko" | "en";

export type Translations = {
  // Hero
  heroTitle: string;
  heroDesc: string;
  serverStarting: string;
  serverSlow: string;
  // Settings
  portfolioName: string;
  reportCurrency: string;
  period: string;
  loadCsv: string;
  // Buttons
  addAsset: string;
  reset: string;
  saveCsv: string;
  analyzing: string;
  runAnalysis: string;
  // Metric cards
  totalCostBasis: string;
  totalMarketValue: string;
  totalPnl: string;
  portfolioVolatility: string;
  // VaR
  varDesc: string;
  returnLabel: string;
  tailProb: string;
  varCutoffReturn: string;
  varAmount: string;
  // Volatility section
  volatilityTitle: string;
  volatilityDesc: string;
  latestVolatility: string;
  dateLabel: string;
  volatilityLabel: string;
  // Drawdown
  drawdownDesc: string;
  maxDrawdown: string;
  // Charts
  assetVolatility: string;
  assetValueTrend: string;
  // Asset table
  assetSummary: string;
  asset: string;
  currentPrice: string;
  marketValue: string;
  weight: string;
  pnl: string;
  returnPct: string;
  volatilityCol: string;
  // Correlation
  correlation: string;
  // Risk section
  riskSectionTitle: string;
  riskPrefix: string;
  riskConnector: string;
  riskSuffix: string;
  directionUp: string;
  directionDown: string;
  riskAnalyzing: string;
  riskAnalyzeBtn: string;
  selectedFactor: string;
  corrWithPortfolio: string;
  beta: string;
  betaAriaLabel: string;
  betaDesc: string;
  hedgeRatio: string;
  // AI recommendation
  aiHedgeTitle: string;
  generating: string;
  getRecommendation: string;
  sessionSaved: string;
  hide: string;
  show: string;
  additionalContext: string;
  optional: string;
  contextPlaceholder: string;
  // Errors
  errNoResponse: string;
  errRecommend: string;
  errAnalyze: string;
  errLoadCsv: string;
  errRiskAnalyze: string;
  // FX
  fxRate: string;
  // AssetEditor
  remove: string;
  ticker: string;
  tickerPlaceholder: string;
  serverStartingSearch: string;
  priceCsv: string;
  priceSource: string;
  csvInput: string;
  purchasePrice: string;
  quantity: string;
  // Quote types
  qtEquity: string;
  qtCrypto: string;
  qtCurrency: string;
  qtIndex: string;
  qtFuture: string;
  qtFund: string;
  // Language toggle label
  langToggle: string;
};

const ko: Translations = {
  heroTitle: "포트폴리오 위험관리 대시보드",
  heroDesc: "내 주식·코인·펀드를 한 곳에 모아 수익률, 위험도, 통화별 환산까지 한눈에 파악하세요.",
  serverStarting: "서버 시작 중입니다. 처음 검색·분석은 잠시 기다려 주세요.",
  serverSlow: "서버 응답이 늦습니다. 검색·분석이 안 될 경우 잠시 후 다시 시도해 주세요.",
  portfolioName: "포트폴리오 이름",
  reportCurrency: "기준 통화",
  period: "조회 기간",
  loadCsv: "포트폴리오 CSV 불러오기",
  addAsset: "자산 추가",
  reset: "초기화",
  saveCsv: "CSV 저장",
  analyzing: "분석 중...",
  runAnalysis: "분석 실행",
  totalCostBasis: "총 투자원가",
  totalMarketValue: "총 평가금액",
  totalPnl: "총 손익",
  portfolioVolatility: "포트폴리오 변동성",
  varDesc:
    "VaR 95%는 포트폴리오의 하루 수익률이 정규분포를 따른다고 가정할 때, 하위 5% 구간에 들어가는 손실 임계값입니다. 평소와 비슷한 시장 조건이 이어진다면 100일 중 약 5일 정도는 이 손실보다 더 나쁠 수 있습니다.",
  returnLabel: "수익률",
  tailProb: "하위 꼬리 확률",
  varCutoffReturn: "VaR 컷오프 수익률",
  varAmount: "VaR 금액",
  volatilityTitle: "포트폴리오 변동성",
  volatilityDesc: "포트폴리오 연간 변동성 변화 추이입니다.",
  latestVolatility: "최근 변동성",
  dateLabel: "날짜",
  volatilityLabel: "변동성",
  drawdownDesc: "포트폴리오가 이전 고점 대비 얼마나 하락했는지 시간 흐름에 따라 보여줍니다.",
  maxDrawdown: "최대 낙폭",
  assetVolatility: "자산별 변동성",
  assetValueTrend: "자산 가치 추이",
  assetSummary: "자산별 평가표",
  asset: "자산",
  currentPrice: "현재가",
  marketValue: "평가금액",
  weight: "비중",
  pnl: "손익",
  returnPct: "수익률",
  volatilityCol: "변동성",
  correlation: "상관관계",
  riskSectionTitle: "리스크 대비 전략 분석",
  riskPrefix: "나는",
  riskConnector: "이",
  riskSuffix: "하는 리스크에 대비하고 싶어",
  directionUp: "상승",
  directionDown: "하락",
  riskAnalyzing: "분석 중...",
  riskAnalyzeBtn: "리스크 대비 전략 분석",
  selectedFactor: "선택 요인:",
  corrWithPortfolio: "포트폴리오와 대상자산의 상관계수",
  beta: "베타",
  betaAriaLabel: "베타 설명",
  betaDesc: "포트폴리오가 전체 시장 움직임에 얼마나 민감하게 반응하는지를 나타내는 상대적 변동성 지표입니다.",
  hedgeRatio: "헤지비율",
  aiHedgeTitle: "AI 헤지 전략 추천",
  generating: "추천 생성 중...",
  getRecommendation: "전략 추천받기",
  sessionSaved: "(세션 동안 저장됩니다)",
  hide: "숨기기",
  show: "보기",
  additionalContext: "추가 요청사항",
  optional: "(선택)",
  contextPlaceholder: "예: 국내 주식 위주 포트폴리오입니다. 환헤지 방법도 같이 설명해주세요.",
  errNoResponse: "응답을 받지 못했습니다. API 키를 확인하거나 다시 시도해주세요.",
  errRecommend: "전략 추천에 실패했습니다.",
  errAnalyze: "분석 요청에 실패했습니다.",
  errLoadCsv: "포트폴리오 CSV를 읽지 못했습니다.",
  errRiskAnalyze: "리스크 대비 전략 분석에 실패했습니다.",
  fxRate: "환율",
  remove: "제거",
  ticker: "종목코드",
  tickerPlaceholder: "종목명 또는 코드 검색 (예: 삼성, AAPL)",
  serverStartingSearch: "서버가 시작 중입니다. 잠시 후 다시 시도해 주세요.",
  priceCsv: "가격 CSV",
  priceSource: "가격 소스",
  csvInput: "CSV 입력",
  purchasePrice: "매수가",
  quantity: "수량",
  qtEquity: "주식",
  qtCrypto: "암호화폐",
  qtCurrency: "통화",
  qtIndex: "지수",
  qtFuture: "선물",
  qtFund: "펀드",
  langToggle: "English",
};

const en: Translations = {
  heroTitle: "Portfolio Risk Management Dashboard",
  heroDesc: "Track your stocks, crypto, and funds in one place — returns, risk, and currency conversion at a glance.",
  serverStarting: "Server is starting up. The first search or analysis may take a moment.",
  serverSlow: "Server response is slow. If search or analysis fails, please try again in a moment.",
  portfolioName: "Portfolio Name",
  reportCurrency: "Report Currency",
  period: "Historical Period",
  loadCsv: "Load Portfolio CSV",
  addAsset: "Add Asset",
  reset: "Reset",
  saveCsv: "Save CSV",
  analyzing: "Analyzing...",
  runAnalysis: "Run Analysis",
  totalCostBasis: "Total Cost Basis",
  totalMarketValue: "Total Market Value",
  totalPnl: "Total P&L",
  portfolioVolatility: "Portfolio Volatility",
  varDesc:
    "VaR 95% is the loss threshold at the 5th percentile of the portfolio's daily return distribution, assuming normality. Under normal market conditions, losses are expected to exceed this level on roughly 5 out of every 100 days.",
  returnLabel: "Return",
  tailProb: "Tail Probability",
  varCutoffReturn: "VaR Cutoff Return",
  varAmount: "VaR Amount",
  volatilityTitle: "Portfolio Volatility",
  volatilityDesc: "Annualised volatility trend of the portfolio.",
  latestVolatility: "Latest Volatility",
  dateLabel: "Date",
  volatilityLabel: "Volatility",
  drawdownDesc: "Shows how far the portfolio has fallen from its previous peak over time.",
  maxDrawdown: "Maximum Drawdown",
  assetVolatility: "Asset Volatility",
  assetValueTrend: "Asset Value Trend",
  assetSummary: "Asset Summary",
  asset: "Asset",
  currentPrice: "Current Price",
  marketValue: "Market Value",
  weight: "Weight",
  pnl: "P&L",
  returnPct: "Return",
  volatilityCol: "Volatility",
  correlation: "Correlation",
  riskSectionTitle: "Risk Strategy Analysis",
  riskPrefix: "I want to hedge against",
  riskConnector: "",
  riskSuffix: "risk",
  directionUp: "Rising",
  directionDown: "Falling",
  riskAnalyzing: "Analyzing...",
  riskAnalyzeBtn: "Analyze Risk Strategy",
  selectedFactor: "Selected Factor:",
  corrWithPortfolio: "Correlation with Portfolio",
  beta: "Beta",
  betaAriaLabel: "Beta description",
  betaDesc: "A relative volatility measure of how sensitively the portfolio reacts to overall market movements.",
  hedgeRatio: "Hedge Ratio",
  aiHedgeTitle: "AI Hedge Strategy Recommendation",
  generating: "Generating...",
  getRecommendation: "Get Recommendation",
  sessionSaved: "(saved for this session)",
  hide: "Hide",
  show: "Show",
  additionalContext: "Additional Context",
  optional: "(optional)",
  contextPlaceholder: "e.g. My portfolio is focused on domestic equities. Please also explain how to hedge currency risk.",
  errNoResponse: "No response received. Please check your API key or try again.",
  errRecommend: "Failed to get strategy recommendation.",
  errAnalyze: "Analysis request failed.",
  errLoadCsv: "Failed to read portfolio CSV.",
  errRiskAnalyze: "Risk strategy analysis failed.",
  fxRate: "FX Rate",
  remove: "Remove",
  ticker: "Ticker",
  tickerPlaceholder: "Search by name or ticker (e.g. Apple, AAPL)",
  serverStartingSearch: "Server is starting up. Please try again in a moment.",
  priceCsv: "Price CSV",
  priceSource: "Price Source",
  csvInput: "CSV Input",
  purchasePrice: "Purchase Price",
  quantity: "Quantity",
  qtEquity: "Stock",
  qtCrypto: "Crypto",
  qtCurrency: "Currency",
  qtIndex: "Index",
  qtFuture: "Futures",
  qtFund: "Fund",
  langToggle: "한국어",
};

export const translations: Record<Lang, Translations> = { ko, en };
