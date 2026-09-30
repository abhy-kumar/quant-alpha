const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Readable } = require('node:stream')
const path = require('node:path')
const Module = require('node:module')
const esbuild = require('esbuild')
function load(relative) {
  const filename = path.resolve(relative)
  const code = esbuild.buildSync({ entryPoints: [filename], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text
  const mod = new Module(filename, module); mod.paths = module.paths; mod._compile(code, filename)
  return mod.exports
}
const auth = load('server/auth.ts')
const login = load('api/login.ts').default
const data = load('api/data.ts').default
const { simulateStrategy, filterUniverse, STRATEGY_PRESETS } = load('src/utils/strategyEngine.ts')
async function call(handler, method, url, body, headers = {}) {
  const req = Readable.from(body ? [JSON.stringify(body)] : [])
  Object.assign(req, { method, url, headers: { host: 'localhost', ...headers }, socket: { remoteAddress: 'test' } })
  const result = { headers: {}, statusCode: 200, setHeader(k,v) { this.headers[k] = v }, end(body) { this.body = body ? JSON.parse(body) : null } }
  await handler(req,result)
  return result
}
test('login fails closed, rejects old browser flag, validates signed cookie and deletes it', async () => {
  delete process.env.AUTH_EMAIL; delete process.env.AUTH_PASSWORD
  assert.equal((await call(login,'POST','/api/login',{email:'anything',password:'anything'})).statusCode,503)
  process.env.AUTH_EMAIL='test@example.invalid';process.env.AUTH_PASSWORD='test-only-secret';process.env.AUTH_SESSION_SECRET='test-only-signing-key'
  const logged = await call(login,'POST','/api/login',{email:process.env.AUTH_EMAIL,password:process.env.AUTH_PASSWORD})
  assert.equal(logged.statusCode,200)
  assert.match(logged.headers['Set-Cookie'],/HttpOnly.*SameSite=Strict/)
  const cookie = logged.headers['Set-Cookie'].split(';')[0]
  assert.equal((await call(login,'GET','/api/login',null,{cookie})).body.authenticated,true)
  assert.equal(auth.authenticated({headers:{cookie:'qa_auth=true; qa_session=qa_session_valid'}}),false)
  assert.equal(auth.authenticated({headers:{cookie:cookie+'corrupt'}}),false)
  assert.match((await call(login,'DELETE','/api/login')).headers['Set-Cookie'],/Max-Age=0/)
})
test('restricted resources reject guests and traversal', async () => {
  assert.equal((await call(data,'GET','/api/data?resource=quant')).statusCode,401)
  assert.equal((await call(data,'GET','/api/data?resource=run&slug=../../password')).statusCode,400)
  assert.equal((await call(data,'GET','/api/data?resource=market')).body.data.some(s => s.Composite_Score != null),false)
})
test('strategy history pages fit the hosted response limit and validate bounds', async () => {
  const cookie = 'qa_session=' + auth.newSession()
  const index = await call(data,'GET','/api/data?resource=strategies',null,{cookie})
  assert(index.body.pages > 0)
  for (let page=0;page<index.body.pages;page++) {
    const result = await call(data,'GET',`/api/data?resource=strategies&page=${page}`,null,{cookie})
    assert.equal(result.statusCode,200)
    assert(Buffer.byteLength(JSON.stringify(result.body)) < 4_000_000)
    assert(result.body.dates.length <= 10)
  }
  assert.equal((await call(data,'GET','/api/data?resource=strategies&page=-1',null,{cookie})).statusCode,400)
})
const stock = { Ticker:'A.NS',Price:100,Piotroski_F:8,'ROE_%':25,Debt_to_Equity:50,'P/E':20,RS_Percentile:90,RSI_Value:55,Sig_Price_vs_SMA50:1,Sig_VPT:1,Tech_Score:8,Fund_Score:8,Composite_Score:8,ATR_Value:4,Vol_60D:20 }
const config = { ...STRATEGY_PRESETS.quality, topN:1, minMomentumRank:0, maxDebtEquity:.6 }
test('debt units are normalized and missing fundamentals fail filters', () => {
  assert.equal(filterUniverse([stock],config).length,1)
  assert.equal(filterUniverse([{...stock,Debt_to_Equity:70}],config).length,0)
  assert.equal(filterUniverse([{...stock,'ROE_%':undefined}],config).length,0)
})
function history(close=[100,100,80,80]) {
  const dates=['2025-01-01','2025-01-02','2025-01-03','2025-01-06']
  return { dates,benchmark:[100,100,100,100],prices:Object.fromEntries(dates.map((d,i)=>[d,{'A.NS':close[i]}])),factors:{'2025-01-01':[stock]} }
}
test('sandbox uses real losses, close-triggered ATR stops and transaction costs', () => {
  const result = simulateStrategy(history(),{...config,stopLossAtr:2})
  assert(result.chart.at(-1).portfolio < 81)
  assert.equal(result.trades[0].exitPrice,80)
  assert.equal(result.trades[0].exitReason,'Stop-Loss')
  assert(result.trades[0].returnPct < -20)
})
test('sandbox never fabricates a benchmark or forces unmatched stocks', () => {
  assert.equal(simulateStrategy(null,config).chart.length,0)
  const result = simulateStrategy(history(),{...config,minPiotroski:9})
  assert.equal(result.trades.length,0)
  assert.match(result.message,/No historical stocks/)
  assert(result.chart.at(-1).portfolio < 101)
})
test('only prior factor snapshots can enter historical positions', () => {
  const h=history(); h.factors={'2025-01-06':[stock]}
  assert.equal(simulateStrategy(h,config).trades.length,0)
})
test('take-profit uses the observed close and weighting changes realized holdings', () => {
  const result=simulateStrategy(history([100,100,140,140]),{...config,takeProfitPct:25})
  assert.equal(result.trades[0].exitPrice,140)
  assert.equal(result.trades[0].exitReason,'Take-Profit')
  const h=history([100,100,200,200]); h.factors['2025-01-01'].push({...stock,Ticker:'B.NS',Vol_60D:80})
  h.dates.forEach(d => {h.prices[d]['B.NS']=100})
  const equal=simulateStrategy(h,{...config,topN:2,weightingScheme:'equal'})
  const vol=simulateStrategy(h,{...config,topN:2,weightingScheme:'volatility_parity'})
  assert(vol.chart.at(-1).portfolio > equal.chart.at(-1).portfolio)
})
