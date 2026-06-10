import yahooFinance from 'yahoo-finance2';

async function run() {
  const quotes = await yahooFinance.quote(['RELIANCE.NS', 'TCS.NS', '^NSEI']);
  console.log(quotes.map(q => ({
    symbol: q.symbol,
    price: q.regularMarketPrice,
    change: q.regularMarketChangePercent
  })));
}

run();
