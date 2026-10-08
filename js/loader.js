'use strict';
let CYCLES = [];
function normalize(cycles) {
  cycles.forEach(cy => cy.scenarios.forEach(sc => {
    sc.cycle = cy; sc.kind = sc.kind || 'play'; sc.resolutions = sc.resolutions || {};
    // 示意劇本用簡寫（intro／agenda／act／text＋log），在這裡轉成統一格式
    if (!sc.flow) sc.flow = sc.intro ? [{ k: 'read', text: sc.intro }] : [];
    if (!sc.decks) sc.decks = [['agenda', '密謀'], ['act', '場景']].filter(([k]) => (sc[k] || []).length).map(([kind, label]) => ({ kind, label, cards: sc[kind] }));
    Object.values(sc.resolutions).forEach(r => { if (!r.flow) r.flow = [{ k: 'read', text: r.text }, ...(r.log || []).map(text => ({ k: 'note', text }))]; });
    sc.decks.forEach(d => d.cards.forEach((c, i) => {
      if (!c.stage) c.stage = i + 1;
      c.res = !c.res ? [] : Array.isArray(c.res) ? c.res : [c.res];
    }));
  }));
  return cycles;
}

async function fetchOne(u, kind) {
  let last;
  for (const url of [u, mirror(u)]) {
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
      const r = await fetch(url, { signal: ctl.signal }); clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return kind === 'json' ? await r.json() : await r.text();
    } catch (e) { last = e; }
  }
  throw new Error(`${u.split('/').slice(-2).join('/')}（${last && last.name === 'AbortError' ? '逾時' : (last && last.message) || '連不上'}）`);
}
function parsePo(text) {
  const map = Object.create(null); let cur = null, field = null;
  const unq = s => { s = s.trim(); try { return JSON.parse(s); } catch (e) { return s.slice(1, -1); } };
  // 原句裡的重音字母（café 等）兩邊寫法不一定相同，統一成 NFC 才對得上
  const push = () => { if (cur && cur.id && cur.str) map[cur.id.normalize('NFC')] = cur.str; };
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('msgid ')) { push(); cur = { id: unq(line.slice(6)), str: '' }; field = 'id'; }
    else if (line.startsWith('msgstr ')) { if (cur) { cur.str = unq(line.slice(7)); field = 'str'; } }
    else if (line.startsWith('"') && cur && field) cur[field] += unq(line);
    else if (line.startsWith('msgctxt')) field = null;
  }
  push(); return map;
}
const ICON = { action: '［行動］', reaction: '［反應］', free: '［免費］', fast: '［免費］', skull: '［骷髏］', cultist: '［異教徒］', tablet: '［石板］', elder_thing: '［古神］', auto_fail: '［觸手］', elder_sign: '［舊印］', willpower: '［意志］', intellect: '［智力］', combat: '［戰力］', agility: '［敏捷］', per_investigator: '［每位調查員］', bless: '［祝福］', curse: '［詛咒］' };
function clean(s) {
  return (s || '').replace(/<br\s*\/?>/gi, '\n').replace(/\\n/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/\[([a-z_]+)\]/g, (m, k) => ICON[k] || '').replace(/[ \t]+\n/g, '\n').trim();
}

/* ---------- 戰役指南 → 流程 ----------
   劇本檔是一張步驟圖（朗讀、指示、玩家選擇、依冒險日誌分支）。這裡把它走成一串節點：
     { k:'read', text }                 要朗讀的劇情
     { k:'note', text }                 要照做的指示（顯示在朗讀後的方框）
     { k:'ask', q, opts:[{label,nodes}] } 需要玩家回答才知道走哪條路
     { k:'goto', res }                  轉到另一個結局
   本工具不追蹤冒險日誌，所以依日誌分支的地方：分支裡有劇情就問玩家，只有指示就全部列出並註明條件。 */
const DIFFICULTY = { easy: '簡單', standard: '標準', hard: '困難', expert: '專家' };
const APP_ONLY_STEPS = ['app_note'];
function guideWalker(g, env) {
  const steps = Object.fromEntries(g.steps.map(s => [s.id, s]));
  const txt = s => clean(env.tr(s));
  const note = text => ({ k: 'note', text });
  const body = s => [txt(s.text), ...(s.bullets || []).map(b => '・' + txt(b.text))].filter(Boolean).join('\n');
  const effectNotes = effects => (effects || []).flatMap(e => {
    if (e.type === 'campaign_log' && e.text && e.text !== 'dummy' && e.section !== 'hidden') return [`在冒險日誌記下：${txt(e.text)}`];
    if (e.type === 'campaign_log_count' && e.operation === 'add') return [`冒險日誌「${env.sec(e.section)}」加 ${e.value}。`];
    if (e.type === 'campaign_log_cards' && env.card(e.id)) return [`在冒險日誌「${env.sec(e.section)}」記下：${env.card(e.id)}`];
    if (e.type === 'add_chaos_token') return [`將 ${e.tokens.map(t => ICON[t] || t).join('、')} 標記加入混亂袋。`];
    if (e.type === 'trauma' && e.investigator === 'all' && !e.insane) return [e.mental && `每位調查員受到 ${e.mental} 點精神創傷。`, e.physical && `每位調查員受到 ${e.physical} 點肉體創傷。`].filter(Boolean);
    if (e.type === 'campaign_data' && e.setting === 'skip_scenario' && env.scTitle(e.scenario)) return [`跳過「${env.scTitle(e.scenario)}」。`];
    return [];
  }).map(note);
  const walk = ids => (ids || []).flatMap(id => step(steps[id], id));

  function step(s, id) {
    if (!s || id.startsWith('$') || APP_ONLY_STEPS.includes(id)) return [];
    switch (s.type) {
      case 'story': return [{ k: 'read', text: txt(s.text) }];
      case 'encounter_sets': case 'location_setup': return [];
      case 'resolution': return [{ k: 'goto', res: s.resolution }];
      case 'rule_reminder': return [note((s.title ? `【${txt(s.title)}】` : '') + body(s))];
      case 'input': return input(s);
      case 'branch': return branch(s);
      default: { const t = body(s); return t ? [note(t)] : effectNotes(s.effects); }
    }
  }
  function input(s) {
    const inp = s.input || {}, q = txt(s.text);
    if (inp.type !== 'choose_one') return q ? [note([q, txt(inp.confirm_text)].filter(Boolean).join('\n'))] : [];
    const opts = (inp.choices || []).map(c => {
      const label = txt(c.text), sub = walk(c.steps);
      return { label, nodes: sub.length || !c.effects ? sub : [note(txt(c.description) || label)] };
    });
    if (opts.length === 1) return [{ k: 'ask', q: [q, opts[0].label].filter(Boolean).join('\n'), opts: [{ label: '是', nodes: opts[0].nodes }, { label: '否', nodes: [] }] }];
    return [{ k: 'ask', q: q || '請選符合的一項：', opts }];
  }
  // 能自己判斷的條件：App 版本一律當最新；App 內部記帳用的隱藏旗標（實體桌上已照卡面做過）整段略過
  function known(c) {
    if (c.type === 'campaign_data' && c.campaign_data === 'version') return true;
    if (c.type === 'campaign_log' && c.section === 'hidden' && !['reprint_language', 'possessed'].includes(c.id)) return 'skip';
    if (c.type === 'multi' && (c.conditions || []).some(x => known(x) === 'skip')) return 'skip';
    return undefined;
  }
  function phrase(c, text, all) {
    const yes = o => o.boolCondition;
    const bool = (ifYes, ifNo, q) => ({ q: text || q, label: os => yes(os[0]) ? '是' : '否', prefix: os => text ? (yes(os[0]) ? '若是' : '若否') : (yes(os[0]) ? ifYes : ifNo) });
    const listed = all.filter(o => !o.isDefault).map(o => o.numCondition);
    const range = os => {
      if (os[0].isDefault) return listed.length ? `${Math.max(...listed) + 1} 以上` : '其他';
      const v = os.map(o => o.numCondition); return v.length > 1 ? `${Math.min(...v)}–${Math.max(...v)}` : `${v[0]}`;
    };
    const num = what => ({ q: text || `${what}是多少？`, label: range, prefix: os => `${what} ${range(os)}` });
    const sec = env.sec;
    switch (c.type) {
      case 'campaign_log': case 'campaign_log_cards': {
        if (c.section === 'hidden' && c.id === 'reprint_language') return bool('新版（重印）卡牌', '舊版卡牌', '你們用的是新版（重印）卡牌嗎？');
        const name = env.card(c.id), entry = env.log(c.id);
        if (name) return bool(`若冒險日誌「${sec(c.section)}」下有${name}`, `若冒險日誌「${sec(c.section)}」下沒有${name}`, `冒險日誌「${sec(c.section)}」下有「${name}」嗎？`);
        if (entry) return bool(`若冒險日誌記有「${entry}」`, `若冒險日誌沒有「${entry}」`, `冒險日誌有記下「${entry}」嗎？`);
        break;
      }
      case 'has_card': return bool('若有調查員持有該卡牌', '視情況', '有調查員持有該卡牌嗎？');
      case 'campaign_log_count': return num(`冒險日誌「${sec(c.section)}」`);
      case 'scenario_data': if (c.scenario_data === 'player_count') return num('調查員人數'); break;
      case 'campaign_data':
        if (c.campaign_data === 'difficulty') { const l = os => os.map(o => DIFFICULTY[o.condition] || o.condition).join('／'); return { q: text || '這場戰役的難度是？', label: l, prefix: l }; }
        break;
      case 'math': {
        const a = sec(c.opA.section), b = sec(c.opB.section);
        if (c.operation === 'sum') return num(`冒險日誌「${a}」加「${b}」的總和`);
        const l = os => os.map(o => `「${a}」${{ '-1': '少於', 0: '等於', 1: '多於' }[o.numCondition]}「${b}」`).join('或');
        return { q: text || `比較冒險日誌的「${a}」和「${b}」：`, label: l, prefix: os => '若' + l(os) };
      }
    }
    return bool('若符合條件', '若不符合條件', '符合條件嗎？');
  }
  function branch(s) {
    const c = s.condition, k = known(c);
    if (k === 'skip') return [];
    const all = [...(c.options || []), ...(c.default_option ? [{ ...c.default_option, isDefault: true }] : [])];
    const sub = o => [...effectNotes(o.effects), ...walk(o.steps)];
    if (k !== undefined) { const o = all.find(x => x.boolCondition === k); return o ? sub(o) : []; }
    // 只列了一種情況（「如果…就…」）：補上相反的那一邊，問的時候才有「否」可選
    if (all.length === 1 && !('numCondition' in all[0])) {
      if (!('boolCondition' in all[0])) all[0] = { ...all[0], boolCondition: true };
      all.push({ boolCondition: !all[0].boolCondition });
    }
    // 結果相同的選項併成一組（例如「追蹤陌生人 0、1、2」都走同一段）
    const groups = [];
    all.forEach(o => {
      const key = JSON.stringify([o.steps || [], o.effects || []]);
      let gr = groups.find(x => x.key === key); if (!gr) groups.push(gr = { key, os: [], nodes: sub(o) });
      gr.os.push(o);
    });
    const live = groups.filter(x => x.nodes.length), text = txt(s.text);
    if (!live.length) return [];
    const ph = phrase(c, text, all);
    if (!text && live.length === 1 && live[0].nodes.every(n => n.k === 'ask')) return live[0].nodes;
    if (live.some(x => x.nodes.some(n => n.k !== 'note'))) return [{ k: 'ask', q: ph.q, opts: groups.map(x => ({ label: ph.label(x.os), nodes: x.nodes })) }];
    return [...(text ? [note(text)] : []), ...live.flatMap(x => x.nodes.map(n => note(`【${ph.prefix(x.os)}】${n.text}`)))];
  }
  return walk;
}
const flowTexts = nodes => nodes.flatMap(n => n.k === 'ask' ? n.opts.flatMap(o => flowTexts(o.nodes)) : n.text ? [n.text] : []);

async function loadReal() {
  const cycles = [];
  for (const cy of REAL) {
    const packs = [...new Set(cy.scenarios.filter(s => s.pack).map(s => s.pack))];
    const poNames = [...new Set([...cy.scenarios.map(s => s.id), ...(cy.extraPo || [])])].map(n => `${cy.folder}/${n}`);
    const po = n => fetchOne(`${RAW_CARDS}i18n/zh/campaigns/${n}.po`, 'text').catch(() => '');
    const [guides, campaign, pos, commonPos, enPacks, zhPacks] = await Promise.all([
      Promise.all(cy.scenarios.map(s => fetchOne(`${RAW_CARDS}campaigns/${cy.folder}/${s.id}.json`, 'json'))),
      fetchOne(`${RAW_CARDS}campaigns/${cy.folder}/campaign.json`, 'json').catch(() => ({})),
      Promise.all(poNames.map(po)),
      Promise.all((cy.commonPo || []).map(po)),
      Promise.all(packs.map(p => fetchOne(`${RAW_ADB}pack/${cy.folder}/${p}_encounter.json`, 'json'))),
      Promise.all(packs.map(p => fetchOne(`${RAW_ADB}translations/zh/pack/${cy.folder}/${p}_encounter.json`, 'json')))
    ]);
    // 前面的檔案優先；別的循環的翻譯檔只補缺
    const T = Object.assign(Object.create(null), FALLBACK_TR, ...commonPos.slice().reverse().map(parsePo), ...pos.slice().reverse().map(parsePo));
    const tr = s => { if (!s) return ''; const k = s.normalize('NFC'); return T[k] || s; };
    const en = enPacks.flat(), enBy = Object.fromEntries(en.map(c => [c.code, c])), zhBy = Object.fromEntries(zhPacks.flat().map(c => [c.code, c]));
    const side = (c, f) => clean((zhBy[c.code] || {})[f] || c[f]);
    const names = new Set();
    zhPacks.flat().forEach(c => { [c.name, c.back_name].forEach(n => n && n.length >= 2 && names.add(n)); });
    // 冒險日誌條目的原句（用來把「日誌有沒有記這條」問成人話）
    const logText = {};
    (function scan(o) {
      if (Array.isArray(o)) o.forEach(scan);
      else if (o && typeof o === 'object') { if (o.type === 'campaign_log' && o.id && o.text && o.text !== 'dummy') logText[o.id] = o.text; Object.values(o).forEach(scan); }
    })(guides);
    const secTitle = Object.fromEntries((campaign.campaign_log || []).map(x => [x.id, x.title]));
    const guideTitle = g => { const full = tr(g.full_name); return (full.includes('：') ? full.split('：').slice(1).join('：') : full).trim(); };
    const env = {
      tr,
      sec: id => clean(tr(secTitle[id])) || id,
      card: id => /^\d{5}[a-z]?$/.test(id || '') && (zhBy[id] || enBy[id]) ? side(zhBy[id] || enBy[id], 'name') : '',
      log: id => clean(tr(logText[id])).replace(/[。.]$/, ''),
      scTitle: id => { const g = guides.find(x => x.id === id); return g ? clean(tr(g.full_name)) : ''; }
    };
    const scenarios = cy.scenarios.map((cfg, k) => {
      const g = guides[k], walk = guideWalker(g, env), story = cfg.kind === 'story';
      const sets = cfg.sets || [cfg.id];
      const card = c => {
        // 背面是另一張卡（敵人、資產）的單面密謀／場景：把那張卡當背面
        const link = !c.double_sided && c.back_link && enBy[c.back_link];
        return {
          code: c.code, stage: +c.stage, name: side(c, 'name'), flavor: side(c, 'flavor'),
          backName: link ? side(link, 'name') : side(c, 'back_name'), backFlavor: link ? side(link, 'flavor') : side(c, 'back_flavor'), backText: link ? side(link, 'text') : side(c, 'back_text'),
          res: [...new Set(((c.back_text || '').match(/→R\d+/g) || []).map(x => x.slice(1)))],
          need: c.type_code === 'agenda' ? (c.doom ? `毀滅 ${c.doom}` : '') : (c.clues ? (c.clues_fixed ? `${c.clues} 線索` : `每位調查員 ${c.clues} 線索`) : '目標見卡面')
        };
      };
      const byStage = (a, b) => (+a.stage) - (+b.stage) || a.code.localeCompare(b.code);
      const decks = story ? [] : (cfg.decks || [{ kind: 'agenda', label: '密謀' }, { kind: 'act', label: '場景' }]).map(d => ({
        kind: d.kind, label: d.label,
        cards: en.filter(c => c.type_code === d.kind && (d.codes ? d.codes.includes(c.code) : sets.includes(c.encounter_code))).sort(byStage).map(card)
      })).filter(d => d.cards.length);
      const resolutions = {};
      (g.resolutions || []).forEach(r => { resolutions[r.id] = { flow: [...(r.text ? [{ k: 'read', text: clean(tr(r.text)) }] : []), ...walk(r.steps)] }; });
      return { id: `${cy.id}.${cfg.id}`, code: cfg.code, title: cfg.title || guideTitle(g), kind: cfg.kind || 'play', tag: cfg.tag, mute: !!cfg.mute, flow: walk(g.setup), decks, swap: cfg.swap || {}, resolutions, names: [] };
    });
    scenarios.forEach(sc => {
      const all = [...flowTexts(sc.flow), ...sc.decks.flatMap(d => d.cards).flatMap(c => [c.flavor, c.backFlavor, c.backText]), ...Object.values(sc.resolutions).flatMap(r => flowTexts(r.flow))].join('\n');
      sc.names = [...names].filter(n => all.includes(n));
    });
    cycles.push({ id: cy.id, name: cy.name, scenarios });
  }
  return cycles;
}
const allScenarios = () => CYCLES.flatMap(cy => cy.scenarios);
normalize(SAMPLE_CYCLES);
const allNames = () => [...new Set(allScenarios().flatMap(sc => sc.names || []))];
const findSc = id => allScenarios().find(s => s.id === id);

function chunks(s, max = 90) {
  const out = [];
  for (const para of (s || '').split(/\n+/).map(x => x.trim()).filter(Boolean)) {
    const sents = para.match(/[^。！？]+[。！？]*[」』”）]*/g) || [para];
    let acc = '';
    for (const se of sents) { if (acc && (acc + se).length > max) { out.push(acc); acc = se; } else acc += se; }
    if (acc) out.push(acc);
  }
  return out;
}
const RES_NAMES = { no_resolution: '無結局', no_resolution_resigned: '無結局（全員撤退）', no_resolution_defeated: '無結局（全員被擊敗）', investigator_defeat: '調查員被擊敗', done: '已讀完' };
const resLabel = id => RES_NAMES[id] || (/^R\d+$/.test(id) ? `結局 ${id.slice(1)}` : id);
const resIds = sc => Object.keys(sc.resolutions).sort((x, y) => (x === 'no_resolution') - (y === 'no_resolution') || x.localeCompare(y));
const cardItems = (c, word, back) => chunks(back ? c.backFlavor : c.flavor).map(t => ({ text: t, label: back ? `${word} ${ROMAN[c.stage]} 背面 · ${c.backName}` : `${word} ${ROMAN[c.stage]} · ${c.name}` }));
// 一疊牌開局時在場上的卡（可能有多個版本）；整疊一開始不在場上就回傳空陣列
const deckStart = d => { const m = Math.min(...d.cards.map(c => c.stage)); return m > 1 ? [] : d.cards.map((c, j) => [c, j]).filter(([c]) => c.stage === m); };
// 把一段流程攤平成文本庫的小節；ask 的每個選項各成一節
// seen：同一段話在不同分支重複出現時（真相幻影的夢境）只列一次
function flowGroups(nodes, sub, label, seen = new Set()) {
  const out = []; let cur = null;
  const fresh = t => !seen.has(t) && seen.add(t);
  const short = (t, n) => t.length > n ? t.slice(0, n) + '…' : t;
  const group = () => cur || (out.push(cur = { sub, items: [], fx: [] }), cur);
  nodes.forEach(n => {
    if (n.k === 'read') { if (fresh(n.text)) group().items.push(...chunks(n.text).map(t => ({ text: t, label }))); }
    else if (n.k === 'note') { if (fresh(n.text)) group().fx.push(n.text); }
    else if (n.k === 'ask') { cur = null; n.opts.forEach(o => out.push(...flowGroups(o.nodes, `${sub}（${short(n.q.split('\n')[0], 20)} → ${short(o.label, 12)}）`, label, seen))); }
  });
  return out.filter(x => x.items.length || x.fx.length).map(x => ({ ...x, fx: Array.isArray(x.fx) ? x.fx.join('\n') : x.fx }));
}
function sections(sc) {
  const intro = flowGroups(sc.flow, '開場', sc.kind === 'story' ? sc.title : '開場');
  if (sc.kind === 'story') return [{ title: sc.title, groups: intro }];
  const starts = sc.decks.flatMap(d => deckStart(d).map(([c]) => [d, c]));
  const card = (d, c) => [
    ...(starts.some(([, x]) => x === c) ? [] : [{ sub: `${d.label} ${ROMAN[c.stage]} 正面 · ${c.name}`, items: cardItems(c, d.label) }]),
    { sub: `${d.label} ${ROMAN[c.stage]} 背面 · ${c.backName}`, items: cardItems(c, d.label, true), fx: c.backText }
  ];
  return [
    { title: '開場與開局', groups: [...intro, ...starts.map(([d, c]) => ({ sub: `${d.label} ${ROMAN[c.stage]} 正面 · ${c.name}`, items: cardItems(c, d.label) }))] },
    ...sc.decks.map(d => ({ title: `${d.label}卡`, groups: d.cards.flatMap(c => card(d, c)) })),
    { title: '結局', groups: resIds(sc).flatMap(id => flowGroups(sc.resolutions[id].flow, resLabel(id), resLabel(id))) }
  ];
}
