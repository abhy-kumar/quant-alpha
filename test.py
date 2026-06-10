import yfinance as yf; info=yf.Ticker('MAHABANK.NS').info; print('ROE:', info.get('returnOnEquity'), 'PE:', info.get('trailingPE'), 'DIV:', info.get('dividendYield'))
