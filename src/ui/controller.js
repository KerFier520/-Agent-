/* Negotiation Arena · UI 控制器（在 fragment 内运行，依赖已内联的 NegotiationArena） */
(function () {
  'use strict';
  var A = window.NegotiationArena;
  var root = document.getElementById('na-root');
  if (!root || !A) { return; }

  var $ = function (id) { return document.getElementById(id); };
  var game = null;
  var selectedMove = 'structured';
  var termInputs = {};

  var SPEAKER = { you: '我', buyer: 'D', cfo: '财', advisor: '顾', system: '系', judge: '裁' };

  function fmt(n, d) { var p = Math.pow(10, d || 0); return (Math.round(n * p) / p).toFixed(d || 0); }

  /* ---------------- 初始化 ---------------- */
  function boot(seed) {
    game = A.createGame({ seed: seed || ('arena-' + Math.floor(Math.random() * 1e9)) });
    $('na-scen').textContent = A.SCENARIO.you.brief + ' 你的对手是 ' + A.SCENARIO.counterpart.name +
      '（' + A.SCENARIO.counterpart.org + ' · ' + A.SCENARIO.counterpart.role + '）。';
    $('na-seed').textContent = '对局 ' + game.seed.slice(-6);
    buildTerms();
    buildMoves();
    buildPhases();
    renderLog(true);
    refresh();
    $('na-rep').className = 'na-rep';
    $('na-note').value = '';
  }

  /* ---------------- 条款滑块 ---------------- */
  function buildTerms() {
    var host = $('na-terms');
    host.innerHTML = '';
    termInputs = {};
    A.TERMS_META.forEach(function (m) {
      if (m.type === 'bool') { return; }
      var wrap = document.createElement('div');
      wrap.className = 'na-f';
      var id = 'na-t-' + m.key;
      var lab = document.createElement('label');
      lab.setAttribute('for', id);
      lab.innerHTML = m.label + ' <b id="' + id + '-v"></b>';
      var inp = document.createElement('input');
      inp.type = 'range'; inp.id = id;
      inp.min = m.min; inp.max = m.max; inp.step = m.step;
      inp.value = A.DEFAULT_OPENING[m.key];
      inp.addEventListener('input', function () { syncTermLabel(m); refresh(); });
      wrap.appendChild(lab); wrap.appendChild(inp);
      host.appendChild(wrap);
      termInputs[m.key] = inp;
      syncTermLabel(m);
    });
    var ex = $('na-excl');
    ex.checked = !!A.DEFAULT_OPENING.exclusivity;
    ex.onchange = refresh;
  }

  function syncTermLabel(m) {
    var el = $('na-t-' + m.key + '-v');
    if (el) {
      var v = Number(termInputs[m.key].value);
      el.textContent = (m.step < 1 ? v.toFixed(1) : String(v)) + (m.unit ? ' ' + m.unit : '');
    }
  }

  function currentTerms() {
    var t = {};
    A.TERMS_META.forEach(function (m) {
      t[m.key] = m.type === 'bool' ? $('na-excl').checked : Number(termInputs[m.key].value);
    });
    return A.normalizeTerms(t);
  }

  /* ---------------- 策略按钮 ---------------- */
  function buildMoves() {
    var host = $('na-moves');
    host.innerHTML = '';
    Object.keys(A.MOVES).forEach(function (key) {
      var m = A.MOVES[key];
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'na-mv';
      b.setAttribute('aria-pressed', key === selectedMove ? 'true' : 'false');
      b.dataset.move = key;
      b.innerHTML = '<span class="t"></span><span class="h"></span>';
      b.querySelector('.t').textContent = m.label;
      b.querySelector('.h').textContent = m.hint;
      b.addEventListener('click', function () {
        selectedMove = key;
        Array.prototype.forEach.call(host.querySelectorAll('.na-mv'), function (x) {
          x.setAttribute('aria-pressed', x.dataset.move === key ? 'true' : 'false');
        });
      });
      host.appendChild(b);
    });
  }

  /* ---------------- 阶段条 ---------------- */
  function buildPhases() {
    var host = $('na-phases');
    host.innerHTML = '';
    A.PHASES.forEach(function (p) {
      var d = document.createElement('div');
      d.className = 'na-ph'; d.dataset.phase = p.id;
      d.innerHTML = '<div class="dot"></div><div class="lb"></div>';
      d.querySelector('.lb').textContent = p.label;
      d.title = p.desc;
      host.appendChild(d);
    });
  }

  function paintPhases() {
    var order = A.PHASES.map(function (p) { return p.id; });
    var cur = order.indexOf(game.phase);
    Array.prototype.forEach.call($('na-phases').children, function (el, i) {
      el.className = 'na-ph' + (i < cur ? ' done' : (i === cur ? ' cur' : ''));
    });
  }

  /* ---------------- 刷新仪表 / 核算 ---------------- */
  function refresh() {
    var s = A.publicState(game);
    var t = currentTerms();

    $('na-round').innerHTML = Math.min(game.round, game.maxRounds) + '<small>/' + game.maxRounds + '</small>';
    var tr = s.meters.trust, te = s.meters.tension;
    $('na-trust').textContent = fmt(tr, 0);
    $('na-tension').textContent = fmt(te, 0);
    var tb = $('na-trust-b'), eb = $('na-tension-b');
    tb.style.width = tr + '%';
    tb.style.background = tr > 62 ? 'var(--na-good)' : (tr > 38 ? 'var(--na-warn)' : 'var(--na-bad)');
    eb.style.width = te + '%';
    eb.style.background = te > 65 ? 'var(--na-bad)' : (te > 40 ? 'var(--na-warn)' : 'var(--na-good)');

    var profit = A.yourProfit(t), ratio = A.marginRatio(t) * 100;
    $('na-profit').innerHTML = fmt(profit, 1) + '<small>万$</small>';
    $('na-margin').innerHTML = fmt(ratio, 1) + '<small>%</small>';
    $('na-margin').style.color = ratio < 12 ? 'var(--na-bad)' : (ratio < 16 ? 'var(--na-warn)' : 'var(--na-fg)');
    $('na-uc').textContent = '$' + fmt(A.unitCost(t.qty), 2);
    $('na-um').textContent = '$' + fmt(A.yourUnitMargin(t), 2);
    $('na-ex').textContent = fmt(A.creditExposure(t), 0) + '万';

    var bp = s.buyerPosition;
    $('na-vs').textContent = '对方当前立场 $' + fmt(bp.price, 2) + ' / ' + bp.qty + '万台 / ' + bp.netDays + '天';

    // CFO 实时审核
    var rev = A.cfoReview(t);
    var box = $('na-cfo');
    if (!rev.approved) {
      box.className = 'na-cfo-box veto';
      box.innerHTML = '<b>' + A.SCENARIO.cfo.name + ' 不批准：</b>' + rev.vetoes.map(function (v) { return v.text; }).join(' ');
    } else if (rev.flags.length) {
      box.className = 'na-cfo-box';
      box.innerHTML = '<b>' + A.SCENARIO.cfo.name + '：</b>' + rev.flags.map(function (f) { return f.text; }).join(' ');
    } else {
      box.className = 'na-cfo-box';
      box.innerHTML = '<b>' + A.SCENARIO.cfo.name + '：</b>该版本在毛利与信用口径内，可以提。';
    }

    var over = game.status !== 'active';
    $('na-send').disabled = over || !rev.approved;
    $('na-send').textContent = over ? '谈判已结束' : (rev.approved ? '提交本轮报价' : '财务未批准');

    paintPhases();
    renderSnaps();
  }

  /* ---------------- 对话渲染 ---------------- */
  var renderedCount = 0;
  function renderLog(full) {
    var log = $('na-log');
    if (full) { log.innerHTML = ''; renderedCount = 0; }
    if (game.transcript.length < renderedCount) { log.innerHTML = ''; renderedCount = 0; }
    for (var i = renderedCount; i < game.transcript.length; i++) {
      log.appendChild(msgNode(game.transcript[i]));
    }
    renderedCount = game.transcript.length;
    log.scrollTop = log.scrollHeight;
  }

  function msgNode(m) {
    var d = document.createElement('div');
    d.className = 'na-msg ' + m.speaker;
    var av = document.createElement('div');
    av.className = 'na-av'; av.textContent = SPEAKER[m.speaker] || '·';
    var bd = document.createElement('div');
    bd.className = 'bd';
    var nm = document.createElement('div');
    nm.className = 'na-nm';
    nm.textContent = m.name;
    if (m.move) {
      var tg = document.createElement('span');
      tg.className = 'tag'; tg.textContent = m.move;
      nm.appendChild(tg);
    }
    var tx = document.createElement('div');
    tx.className = 'na-tx'; tx.textContent = m.text;
    bd.appendChild(nm); bd.appendChild(tx);
    if (m.terms) {
      var tm = document.createElement('div');
      tm.className = 'na-terms';
      tm.textContent = '单价 $' + fmt(m.terms.price, 2) + ' · ' + m.terms.qty + ' 万台 · 预付 ' +
        m.terms.depositPct + '% · 账期 ' + m.terms.netDays + ' 天 · 质保 ' + m.terms.warrantyMonths +
        ' 月 · ' + (m.terms.exclusivity ? '区域独家' : '非独家');
      bd.appendChild(tm);
    }
    d.appendChild(av); d.appendChild(bd);
    return d;
  }

  /* ---------------- 快照 / 回溯 ---------------- */
  function renderSnaps() {
    var host = $('na-snaps');
    host.innerHTML = '';
    var snaps = A.publicState(game).snapshots;
    snaps.forEach(function (sn, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'na-sn';
      var isLast = i === snaps.length - 1;
      b.innerHTML = '<span class="l"></span><span class="m"></span>';
      b.children[0].textContent = sn.label;
      b.children[1].textContent = isLast ? '当前' : ('信任 ' + sn.trust + ' · ' + fmt(sn.profit, 0) + '万$');
      if (isLast) { b.disabled = true; b.style.opacity = '.5'; }
      else {
        b.addEventListener('click', function () {
          var r = A.rewind(game, sn.id);
          if (r.ok) {
            selectedMove = 'structured';
            buildMoves();
            syncSlidersFromState();
            renderLog(true);
            $('na-rep').className = 'na-rep';
            refresh();
          }
        });
      }
      host.appendChild(b);
    });
  }

  function syncSlidersFromState() {
    A.TERMS_META.forEach(function (m) {
      if (m.type === 'bool') { $('na-excl').checked = !!game.terms.exclusivity; return; }
      termInputs[m.key].value = game.terms[m.key];
      syncTermLabel(m);
    });
  }

  /* ---------------- 提交一轮 ---------------- */
  $('na-send').addEventListener('click', function () {
    if (game.status !== 'active') { return; }
    var res = A.submitOffer(game, {
      terms: currentTerms(),
      move: selectedMove,
      note: $('na-note').value
    });
    if (!res.ok) { refresh(); return; }
    $('na-note').value = '';
    renderLog(false);
    refresh();
    if (res.report) { renderReport(res.report); }
  });

  $('na-reset').addEventListener('click', function () { boot(); });

  /* ---------------- 复盘报告 ---------------- */
  function renderReport(rep) {
    var h = [];
    h.push('<h3>谈判复盘 · ' + (rep.dealt ? '协议达成' : (rep.status === 'walkout' ? '对方离场' : '回合用尽')) + '</h3>');
    h.push('<div class="na-verdict">' + esc(rep.verdict) + '</div>');

    var sc = rep.scores;
    h.push('<div class="na-scores">');
    h.push(card('总分', sc.total, true));
    h.push(card('利润', sc.profit));
    h.push(card('风险', sc.risk));
    h.push(card('关系', sc.relation));
    h.push(card('协议质量', sc.quality));
    h.push(card('效率', sc.efficiency));
    h.push('</div>');

    h.push('<div class="na-rsec"><h4>最终条款与结果</h4><div class="na-rev">');
    h.push(kv('成交单价', rep.dealt ? '$' + fmt(rep.terms.price, 2) : '未成交'));
    h.push(kv('年度毛利', fmt(rep.profit, 1) + ' 万$'));
    h.push(kv('毛利率', fmt(rep.marginRatio, 1) + '%'));
    h.push(kv('信用敞口', fmt(rep.exposure, 0) + ' 万$'));
    h.push('</div></div>');

    h.push('<div class="na-rsec"><h4>对手的隐藏信息（本局首次揭示）</h4><div class="na-rev">');
    h.push(kv('谈判画像', rep.reveal.profileLabel));
    h.push(kv('真实保留价', '$' + fmt(rep.reveal.reservePrice, 2)));
    h.push(kv('内部目标价', '$' + fmt(rep.reveal.targetPrice, 2)));
    h.push(kv('最低铺货量', rep.reveal.minVolume + ' 万台'));
    h.push(kv('渠道上限', rep.reveal.channelCap + ' 万台'));
    h.push(kv('账期硬需求', rep.reveal.cashCycleNeed + ' 天'));
    h.push(kv('锁量窗口', '第 ' + rep.reveal.deadlineRound + ' 轮'));
    h.push(kv('备选方案价值', fmt(rep.reveal.batnaUtility, 0) + ' 万$'));
    h.push('</div>');
    h.push('<div style="font-size:11.5px;color:var(--na-muted);margin-top:7px">她的处境：' +
      esc(rep.reveal.situation) + '</div>');
    if (rep.leftOnTable !== null && rep.leftOnTable > 0) {
      h.push('<div style="font-size:12px;color:var(--na-warn);margin-top:6px">单价上你距离她的保留价还有 $' +
        fmt(rep.leftOnTable, 2) + ' 的空间 ≈ ' + fmt(rep.leftOnTable * rep.terms.qty, 1) + ' 万美元年毛利。</div>');
    }
    h.push('</div>');

    h.push('<div class="na-rsec"><h4>关键转折点</h4>');
    rep.turning.forEach(function (t) {
      h.push('<div class="na-tp"><div class="s">' + esc(t.summary) + '</div>' +
        '<div class="e">' + esc(t.effect) + ' · ' + esc(t.verdict) + '</div>' +
        '<div class="cf">反事实：' + esc(t.counterfactual) + '</div></div>');
    });
    h.push('</div>');

    h.push('<div class="na-rsec"><h4>裁判建议</h4><ul class="na-adv">');
    rep.advice.forEach(function (a) { h.push('<li>' + esc(a) + '</li>'); });
    h.push('</ul></div>');
    h.push('<div style="font-size:11.5px;color:var(--na-muted)">想验证另一条路线？在右侧「时间回溯」里选一个节点，换一个沟通策略重新谈——对手的隐藏信息会同步回滚，结果可复现。</div>');

    var box = $('na-rep');
    box.innerHTML = h.join('');
    box.className = 'na-rep show';

    game.transcript.push({
      round: rep.rounds, speaker: 'judge', name: A.SCENARIO.judge.name,
      text: rep.verdict + ' 综合得分 ' + rep.scores.total + '/100。完整复盘见下方。'
    });
    renderLog(false);
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function card(k, v, total) {
    var color = v >= 75 ? 'var(--na-good)' : (v >= 50 ? 'var(--na-warn)' : 'var(--na-bad)');
    return '<div class="na-sc' + (total ? ' total' : '') + '"><div class="k">' + k +
      '</div><div class="v" style="color:' + color + '">' + v + '</div></div>';
  }  function kv(k, v) { return '<div><div class="k">' + k + '</div><div class="v">' + esc(String(v)) + '</div></div>'; }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  boot();
})();
