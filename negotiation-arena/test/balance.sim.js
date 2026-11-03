/*
 * Negotiation Arena · 策略平衡性模拟（node test/balance.sim.js）
 * 用四种典型策略 × 多个随机种子跑完整对局，检查博弈是否"既打得通也不白送"。
 */
var A = require('../src/engine/arena.js');

function play(seed, strategy) {
  var g = A.createGame({ seed: seed });
  var guard = 0;
  while (g.status === 'active' && guard < 14) {
    var t = strategy(g, guard);
    var r = A.submitOffer(g, { terms: t.terms, move: t.move, note: 'sim' });
    if (!r.ok) { // 被财务否决 → 抬价重试一次
      t.terms.price += 0.8;
      r = A.submitOffer(g, { terms: t.terms, move: t.move, note: 'sim' });
      if (!r.ok) { return { status: 'cfo-block', msg: r.message }; }
    }
    guard++;
  }
  var rep = A.judgeReport(g);
  return {
    status: g.status, rounds: rep.rounds, price: rep.terms.price, qty: rep.terms.qty,
    profit: rep.profit, margin: rep.marginRatio, score: rep.scores.total,
    reserve: rep.reveal.reservePrice, left: rep.leftOnTable
  };
}

var strategies = {
  '硬派不让': function () {
    return { terms: { price: 27, qty: 20, depositPct: 25, netDays: 30, warrantyMonths: 12, exclusivity: false }, move: 'pressure' };
  },
  '稳健让步': function (g, i) {
    return { terms: { price: Math.max(21.5, 26.5 - i * 0.6), qty: 20, depositPct: 20, netDays: 45, warrantyMonths: 12, exclusivity: false }, move: i % 2 ? 'structured' : 'tradeoff' };
  },
  '快速投降': function (g, i) {
    return { terms: { price: Math.max(19.5, 26 - i * 1.8), qty: 20, depositPct: 15, netDays: 60, warrantyMonths: 18, exclusivity: false }, move: 'rapport' };
  },
  '探询后收口': function (g, i) {
    return i < 2
      ? { terms: { price: 27, qty: 18, depositPct: 20, netDays: 45, warrantyMonths: 12, exclusivity: false }, move: 'probe' }
      : { terms: { price: Math.max(22.5, 26.5 - (i - 1) * 0.8), qty: 22, depositPct: 20, netDays: 60, warrantyMonths: 12, exclusivity: false }, move: 'tradeoff' };
  }
};

var seeds = ['s1', 's2', 's3', 's4', 's5'];
var agg = {};
Object.keys(strategies).forEach(function (n) { agg[n] = { deal: 0, profit: 0, score: 0, n: 0 }; });

seeds.forEach(function (seed) {
  console.log('\n--- seed=' + seed + ' ---');
  Object.keys(strategies).forEach(function (name) {
    var r = play(seed, strategies[name]);
    var a = agg[name];
    a.n++;
    if (r.status === 'deal') { a.deal++; a.profit += r.profit; a.score += r.score; }
    console.log('  ' + name + '  ' + JSON.stringify(r));
  });
});

console.log('\n=== 汇总（' + seeds.length + ' 局）===');
Object.keys(agg).forEach(function (n) {
  var a = agg[n];
  console.log('  ' + n + ' | 成交 ' + a.deal + '/' + a.n +
    ' | 均毛利 ' + (a.deal ? (a.profit / a.deal).toFixed(1) : '-') + ' 万美元' +
    ' | 均分 ' + (a.deal ? (a.score / a.deal).toFixed(0) : '-'));
});

// 平衡性断言
var problems = [];
if (agg['硬派不让'].deal === agg['硬派不让'].n) { problems.push('纯施压也能必成交 → 博弈太软'); }
if (agg['稳健让步'].deal === 0) { problems.push('合理策略无法成交 → 博弈太硬'); }
if (agg['快速投降'].deal && agg['稳健让步'].deal &&
    agg['快速投降'].profit / agg['快速投降'].deal >= agg['稳健让步'].profit / agg['稳健让步'].deal) {
  problems.push('快速投降的毛利不低于稳健让步 → 让步没有代价');
}
console.log('\n平衡性检查：' + (problems.length ? '⚠ ' + problems.join('；') : '✓ 通过'));
process.exit(problems.length ? 1 : 0);
