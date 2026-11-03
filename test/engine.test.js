/*
 * Negotiation Arena · 引擎回归测试（零依赖，node test/engine.test.js）
 * 覆盖：经济模型、财务否决、隐藏信息封装、状态机、策略适应、回溯、持久化、评分。
 */
var A = require('../src/engine/arena.js');

var passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-6); }
function section(t) { console.log('\n' + t); }

/* ---------- 1. 经济模型 ---------- */
section('1. 经济模型');
var t1 = { price: 24, qty: 20, depositPct: 20, netDays: 60, warrantyMonths: 12, exclusivity: false };
ok('规模效应：量越大单位成本越低', A.unitCost(30) < A.unitCost(10));
ok('单位成本在合理区间', A.unitCost(20) > 14 && A.unitCost(20) < 16, A.unitCost(20));
ok('提价提高毛利', A.yourUnitMargin({ ...t1, price: 25 }) > A.yourUnitMargin(t1));
ok('账期拉长降低毛利', A.yourUnitMargin({ ...t1, netDays: 90 }) < A.yourUnitMargin(t1));
ok('预付提高降低资金成本', A.yourUnitMargin({ ...t1, depositPct: 40 }) > A.yourUnitMargin(t1));
ok('独家增加你方机会成本', A.yourUnitMargin({ ...t1, exclusivity: true }) < A.yourUnitMargin(t1));
ok('毛利率 = 单位毛利 / 单价', near(A.marginRatio(t1), A.yourUnitMargin(t1) / t1.price, 1e-9));

// 手工独立核算一次毛利，防止模型被改坏
var manualCost = 14.6 + 24 / (20 + 5);
var manualFinance = 24 * (60 / 365) * 0.085;
var manualDeposit = 24 * 0.2 * (45 / 365) * 0.085;
var manualMargin = 24 - manualCost - manualFinance + manualDeposit; // netDays=60 不触发保险
ok('独立核算单位毛利一致', near(A.yourUnitMargin(t1), manualMargin, 1e-9),
  A.yourUnitMargin(t1) + ' vs ' + manualMargin);
ok('年度毛利 = 单位毛利 × 量', near(A.yourProfit(t1), manualMargin * 20, 1e-9));

// 账期 60→75 跨过保险阈值，成本应跳变
var noIns = A.yourUnitMargin({ ...t1, netDays: 60 });
var withIns = A.yourUnitMargin({ ...t1, netDays: 75 });
ok('账期越过 60 天触发信用保险成本', noIns - withIns > 24 * 0.012 * 0.9);

ok('信用敞口随账期单调上升', A.creditExposure({ ...t1, netDays: 90 }) > A.creditExposure(t1));
ok('预付降低信用敞口', A.creditExposure({ ...t1, depositPct: 40 }) < A.creditExposure(t1));

/* ---------- 2. 财务 Agent 的硬否决 ---------- */
section('2. 财务负责人（内部约束 Agent）');
ok('健康条款可获批', A.cfoReview({ price: 24, qty: 20, depositPct: 20, netDays: 45, warrantyMonths: 12, exclusivity: false }).approved);
var lowMargin = A.cfoReview({ price: 17, qty: 20, depositPct: 20, netDays: 45, warrantyMonths: 12, exclusivity: false });
ok('毛利率过低被否决', !lowMargin.approved && lowMargin.vetoes.some(v => v.code === 'MARGIN'));
var creditRisk = A.cfoReview({ price: 24, qty: 20, depositPct: 5, netDays: 90, warrantyMonths: 12, exclusivity: false });
ok('长账期+低预付被否决', !creditRisk.approved && creditRisk.vetoes.some(v => v.code === 'CREDIT'));
var smallQty = A.cfoReview({ price: 26, qty: 6, depositPct: 20, netDays: 30, warrantyMonths: 12, exclusivity: false });
ok('低于最小排产量被否决', !smallQty.approved && smallQty.vetoes.some(v => v.code === 'MOQ'));
var badExclusive = A.cfoReview({ price: 26, qty: 12, depositPct: 20, netDays: 30, warrantyMonths: 12, exclusivity: true });
ok('独家但量不足被否决', !badExclusive.approved && badExclusive.vetoes.some(v => v.code === 'EXCLUSIVE'));

/* ---------- 3. 隐藏信息封装 ---------- */
section('3. 隐藏信息（不可全知全能）');
var g = A.createGame({ seed: 'test-seed-1' });
var pub = A.publicState(g);
var pubJson = JSON.stringify(pub);
ok('publicState 不含下划线私有字段', Object.keys(pub).every(k => k.charAt(0) !== '_'));
ok('保留价未泄露', pubJson.indexOf(String(g._private.buyer.reservePrice)) === -1);
ok('截止轮次未泄露为字段', pubJson.indexOf('deadlineRound') === -1);
ok('BATNA 未泄露', pubJson.indexOf('batna') === -1);
ok('inspect 只返回已披露信息', A.inspect(g).knownAboutBuyer.length === 0);

/* ---------- 4. 可复现性 ---------- */
section('4. 可复现（同 seed 同结果）');
var ga = A.createGame({ seed: 'repro' });
var gb = A.createGame({ seed: 'repro' });
ok('同 seed 隐藏参数一致',
  JSON.stringify(ga._private.buyer) === JSON.stringify(gb._private.buyer));
var oa = A.submitOffer(ga, { terms: { price: 25, qty: 18, depositPct: 20, netDays: 45, warrantyMonths: 12, exclusivity: false }, move: 'structured', note: '首轮结构化报价，附成本拆解。' });
var ob = A.submitOffer(gb, { terms: { price: 25, qty: 18, depositPct: 20, netDays: 45, warrantyMonths: 12, exclusivity: false }, move: 'structured', note: '首轮结构化报价，附成本拆解。' });
ok('同 seed 同动作 → 同还价', JSON.stringify(oa.counter) === JSON.stringify(ob.counter));
var gc = A.createGame({ seed: 'other-seed' });
ok('不同 seed → 不同隐藏参数',
  JSON.stringify(ga._private.buyer) !== JSON.stringify(gc._private.buyer));

/* ---------- 5. 状态演化与状态机 ---------- */
section('5. 状态演化 / 有限状态机');
var g5 = A.createGame({ seed: 'fsm' });
ok('初始阶段 = opening', g5.phase === 'opening');
var blocked = A.submitOffer(g5, { terms: { price: 17, qty: 20, depositPct: 20, netDays: 45, warrantyMonths: 12, exclusivity: false }, move: 'structured' });
ok('财务否决会阻断提交', blocked.ok === false && blocked.blockedBy === 'cfo');
ok('被阻断时回合不前进', g5.round === 1);

var baseTerms = { price: 25.5, qty: 18, depositPct: 20, netDays: 45, warrantyMonths: 12, exclusivity: false };
var r1 = A.submitOffer(g5, { terms: baseTerms, move: 'structured', note: '附成本拆解的首版条款清单。' });
ok('合法报价被接受进入流程', r1.ok === true);
ok('回合推进到 2', g5.round === 2);
ok('terms 已更新为你的报价', g5.terms.price === 25.5);
ok('买方给出了还价', !!r1.counter);
ok('买方还价价格 ≤ 你的报价', r1.counter.price <= 25.5);
ok('买方还价高于其开局 19.5', r1.counter.price > 19.5);
ok('结构化动作提升信任', g5.meters.trust > 50, g5.meters.trust);
ok('history 记录了该轮', g5.history.length === 1 && g5.history[0].move === 'structured');
ok('快照随之增加', g5.snapshots.length === 2);

// 阶段推进
var g5b = A.createGame({ seed: 'fsm2' });
for (var i = 0; i < 4 && g5b.status === 'active'; i++) {
  A.submitOffer(g5b, { terms: { price: 25 - i * 0.2, qty: 18, depositPct: 20, netDays: 45, warrantyMonths: 12, exclusivity: false }, move: 'tradeoff' });
}
ok('多轮后离开 opening 阶段', ['exploring', 'bargaining', 'endgame', 'closed'].indexOf(g5b.phase) >= 0, g5b.phase);

/* ---------- 6. 买方策略适应 ---------- */
section('6. 策略适应（AI 读对手模式）');
// 软对手：每轮大幅让价
var soft = A.createGame({ seed: 'adapt' });
var softPrices = [27, 25.5, 24, 22.5, 21.5];
for (var s = 0; s < softPrices.length && soft.status === 'active'; s++) {
  A.submitOffer(soft, { terms: { price: softPrices[s], qty: 20, depositPct: 20, netDays: 45, warrantyMonths: 12, exclusivity: false }, move: 'structured' });
}
// 硬对手：立场几乎不动
var hard = A.createGame({ seed: 'adapt' });
for (var h = 0; h < softPrices.length && hard.status === 'active'; h++) {
  A.submitOffer(hard, { terms: { price: 27 - h * 0.05, qty: 20, depositPct: 20, netDays: 45, warrantyMonths: 12, exclusivity: false }, move: 'structured' });
}
ok('软对手被识别（avgConcession > 0）', soft._private.buyerMemory.avgConcession > 0,
  soft._private.buyerMemory.avgConcession);
ok('硬对手的让步信号更低',
  hard._private.buyerMemory.avgConcession < soft._private.buyerMemory.avgConcession);
ok('面对硬对手，买方期望衰减更快',
  hard._private.buyer.aspiration < soft._private.buyer.aspiration,
  hard._private.buyer.aspiration + ' vs ' + soft._private.buyer.aspiration);

// 过早最后通牒的惩罚
var ult = A.createGame({ seed: 'ultimatum-test' });
var ultBefore = ult.meters.trust;
A.submitOffer(ult, { terms: baseTerms, move: 'ultimatum', note: '这是我们的最终价格。' });
ok('过早最后通牒重挫信任', ult.meters.trust < ultBefore - 15, ult.meters.trust);
ok('过早最后通牒抬高张力', ult.meters.tension > 20 + 20);
var normal = A.createGame({ seed: 'ultimatum-test' });
A.submitOffer(normal, { terms: baseTerms, move: 'structured', note: '这是我们的条款清单与成本依据。' });
ok('最后通牒导致买方让步更小',
  ult.history[0].buyerUtility !== undefined &&
  A.publicState(ult).buyerPosition.price <= A.publicState(normal).buyerPosition.price + 1e-9,
  JSON.stringify([A.publicState(ult).buyerPosition.price, A.publicState(normal).buyerPosition.price]));

// 探询可换到隐藏信息
var probe = A.createGame({ seed: 'probe-test' });
A.submitOffer(probe, { terms: baseTerms, move: 'probe', note: '想先了解你们的审批流程和铺货节奏。' });
ok('探询动作可换取隐藏信息', probe.infoGained >= 1 && A.inspect(probe).knownAboutBuyer.length >= 1,
  JSON.stringify(A.inspect(probe).knownAboutBuyer));

/* ---------- 7. 成交路径 ---------- */
section('7. 成交 / 终止');
var deal = A.createGame({ seed: 'deal-path' });
var guard = 0;
while (deal.status === 'active' && guard < 12) {
  var p = Math.max(21.2, 26 - guard * 0.7);
  var res = A.submitOffer(deal, {
    terms: { price: p, qty: 20, depositPct: 20, netDays: 60, warrantyMonths: 12, exclusivity: false },
    move: guard % 2 === 0 ? 'tradeoff' : 'structured', note: '阶梯让价并绑定对等条款。'
  });
  if (!res.ok) { break; }
  guard++;
}
ok('持续收敛最终可以成交', deal.status === 'deal', deal.status + ' @round' + deal.round);
ok('成交后 agreedTerms 被写入', deal.status !== 'deal' || !!deal.agreedTerms);
ok('成交后阶段 = closed', deal.status !== 'deal' || deal.phase === 'closed');
var afterDeal = A.submitOffer(deal, { terms: baseTerms, move: 'structured' });
ok('结束后无法继续提交', afterDeal.ok === false);

// 超时路径
var timeout = A.createGame({ seed: 'timeout-path' });
var tg = 0;
while (timeout.status === 'active' && tg < 20) {
  var r = A.submitOffer(timeout, { terms: { price: 27.5, qty: 20, depositPct: 25, netDays: 30, warrantyMonths: 12, exclusivity: false }, move: 'pressure' });
  if (!r.ok) { break; }
  tg++;
}
ok('不让步会走到终止状态', timeout.status !== 'active', timeout.status);

/* ---------- 8. 时间回溯 ---------- */
section('8. 时间回溯（反事实分支）');
var rw = A.createGame({ seed: 'rewind-test' });
A.submitOffer(rw, { terms: baseTerms, move: 'structured', note: 'A 线：结构化。' });
var snapAfter1 = rw.snapshots[rw.snapshots.length - 1].id;
var trustAfter1 = rw.meters.trust;
var roundAfter1 = rw.round;
A.submitOffer(rw, { terms: { ...baseTerms, price: 24.8 }, move: 'pressure', note: 'A 线：施压。' });
var trustAfter2 = rw.meters.trust;
ok('施压降低了信任', trustAfter2 < trustAfter1);

var back = A.rewind(rw, snapAfter1);
ok('回溯成功', back.ok === true);
ok('回合数还原', rw.round === roundAfter1, rw.round + ' vs ' + roundAfter1);
ok('信任仪表还原', near(rw.meters.trust, trustAfter1, 1e-9));
ok('历史被截断到该节点', rw.history.length === 1);
ok('买方记忆同步回滚', rw._private.buyerMemory.concessions.length === 0);
ok('被放弃的分支被保留', rw.branches && rw.branches.length === 1 && rw.branches[0].abandoned.length === 1);

// 同一节点换动作 → 不同演化
var afterRewind = A.submitOffer(rw, { terms: { ...baseTerms, price: 24.8 }, move: 'rapport', note: 'B 线：关系铺垫。' });
ok('换动作产生不同信任轨迹', rw.meters.trust > trustAfter2, rw.meters.trust + ' vs ' + trustAfter2);
ok('回溯后仍可正常推进', afterRewind.ok === true && rw.round === roundAfter1 + 1);

// 回溯重放同一动作应得到相同结果（rng 可复现）
var rp1 = A.createGame({ seed: 'replay' });
A.submitOffer(rp1, { terms: baseTerms, move: 'structured' });
var sid = rp1.snapshots[rp1.snapshots.length - 1].id;
var first = A.submitOffer(rp1, { terms: { ...baseTerms, price: 24.5 }, move: 'tradeoff' });
A.rewind(rp1, sid);
var second = A.submitOffer(rp1, { terms: { ...baseTerms, price: 24.5 }, move: 'tradeoff' });
ok('回溯后重放同一动作结果一致',
  JSON.stringify(first.counter) === JSON.stringify(second.counter),
  JSON.stringify(first.counter) + ' vs ' + JSON.stringify(second.counter));

/* ---------- 9. 持久化 ---------- */
section('9. 长期状态存储');
var sv = A.createGame({ seed: 'save-load' });
A.submitOffer(sv, { terms: baseTerms, move: 'probe', note: '探询审批流程。' });
var json = A.save(sv);
var restored = A.load(json);
ok('存档为合法 JSON 字符串', typeof json === 'string' && json.length > 100);
ok('载入后回合一致', restored.round === sv.round);
ok('载入后隐藏信息保留', restored._private.buyer.reservePrice === sv._private.buyer.reservePrice);
ok('载入后可继续推进',
  A.submitOffer(restored, { terms: { ...baseTerms, price: 24.9 }, move: 'tradeoff' }).ok === true);
ok('载入后仍可回溯', A.rewind(restored, restored.snapshots[1].id).ok === true);

/* ---------- 10. 裁判评估 ---------- */
section('10. 结构化评估与复盘');
var rep = A.judgeReport(deal);
ok('裁判给出总分', typeof rep.scores.total === 'number' && rep.scores.total >= 0 && rep.scores.total <= 100, rep.scores.total);
ok('五个维度齐备', ['profit', 'risk', 'relation', 'quality', 'efficiency'].every(k => typeof rep.scores[k] === 'number'));
ok('复盘揭示隐藏信息', rep.reveal.reservePrice === deal._private.buyer.reservePrice);
ok('识别出转折点', Array.isArray(rep.turning) && rep.turning.length >= 1);
ok('每个转折点带反事实解释', rep.turning.every(t => typeof t.counterfactual === 'string' && t.counterfactual.length > 10));
ok('给出可执行建议', Array.isArray(rep.advice) && rep.advice.length >= 1);
ok('成交报告利润与模型一致', near(rep.profit, Math.round(A.yourProfit(deal.agreedTerms) * 10) / 10, 1e-9));

// 更好的成交应该得更高利润分
var repTimeout = A.judgeReport(timeout);
ok('未成交利润分为 0', repTimeout.scores.profit === 0);
ok('未成交 verdict 明确', /未成交|谈崩/.test(repTimeout.verdict), repTimeout.verdict);

/* ---------- 11. 输入归一化与边界 ---------- */
section('11. 输入边界');
var n = A.normalizeTerms({ price: 999, qty: -5, depositPct: 97, netDays: 1000, warrantyMonths: 7, exclusivity: 'yes' });
ok('价格被钳到上限', n.price === 32);
ok('数量被钳到下限', n.qty === 5);
ok('预付对齐 5 的倍数且不超上限', n.depositPct % 5 === 0 && n.depositPct <= 40);
ok('账期对齐 15 的倍数且不超上限', n.netDays % 15 === 0 && n.netDays <= 90);
ok('质保吸附到合法档位', [12, 18, 24].indexOf(n.warrantyMonths) >= 0);
ok('布尔字段归一化', n.exclusivity === true);

/* ---------- 12. 文化建模的可验证性 ---------- */
section('12. 文化建模（情境化而非刻板印象）');
var ctx = A.SCENARIO.counterpart.context.join(' ');
var stereotypes = ['德国人', '中国人', '美国人', '欧洲人', '亚洲人', 'Germans', 'Chinese people'];
ok('人物设定不含国籍群体标签', stereotypes.every(s => ctx.indexOf(s) === -1));
ok('人物设定均为可验证的组织事实', A.SCENARIO.counterpart.context.length >= 4);
ok('规范项可被引擎实际引用',
  typeof A.SCENARIO.counterpart.norms.prefersWritten === 'boolean' &&
  typeof A.SCENARIO.counterpart.norms.escalationCeiling === 'number');

console.log('\n==============================');
console.log('  通过 ' + passed + ' 项，失败 ' + failed + ' 项');
console.log('==============================');
process.exit(failed === 0 ? 0 : 1);
