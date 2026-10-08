'use strict';
let CYCLES = [];
function normalize(cycles) {
  cycles.forEach(cy => cy.scenarios.forEach(sc => {
    sc.cycle = cy; sc.kind = sc.kind || 'play'; sc.agenda = sc.agenda || []; sc.act = sc.act || []; sc.resolutions = sc.resolutions || {};
    [sc.agenda, sc.act].forEach(list => list.forEach((c, i) => {
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
  const push = () => { if (cur && cur.id && cur.str) map[cur.id] = cur.str; };
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
async function loadReal() {
  const cycles = [];
  for (const cy of REAL) {
    const packs = [...new Set(cy.scenarios.filter(s => s.pack).map(s => s.pack))];
    const poNames = [...new Set([...cy.scenarios.map(s => s.id), ...(cy.extraPo || [])])];
    const [guides, pos, enPacks, zhPacks] = await Promise.all([
      Promise.all(cy.scenarios.map(s => fetchOne(`${RAW_CARDS}campaigns/${cy.folder}/${s.id}.json`, 'json'))),
      Promise.all(poNames.map(n => fetchOne(`${RAW_CARDS}i18n/zh/campaigns/${cy.folder}/${n}.po`, 'text').catch(() => ''))),
      Promise.all(packs.map(p => fetchOne(`${RAW_ADB}pack/${p}/${p}_encounter.json`, 'json'))),
      Promise.all(packs.map(p => fetchOne(`${RAW_ADB}translations/zh/pack/${p}/${p}_encounter.json`, 'json')))
    ]);
    const T = Object.assign(Object.create(null), ...pos.slice().reverse().map(parsePo));
    const tr = s => (s && T[s]) ? T[s] : (s || '');
    const en = enPacks.flat(), zhBy = Object.fromEntries(zhPacks.flat().map(c => [c.code, c]));
    const names = new Set();
    zhPacks.flat().forEach(c => { [c.name, c.back_name].forEach(n => n && n.length >= 2 && names.add(n)); });
    const scenarios = cy.scenarios.map((cfg, k) => {
      const g = guides[k], steps = Object.fromEntries(g.steps.map(s => [s.id, s]));
      const full = tr(g.full_name);
      const title = cfg.title || (full.includes('：') ? full.split('：').slice(1).join('：') : full).trim();
      const intro = clean(tr((steps.intro || g.steps.find(s => s.type === 'story') || {}).text));
      const stepText = s => s && s.text && !s.id.startsWith('$') ? clean(tr(s.text)) : '';
      const setup = (g.setup || []).map(id => steps[id]).filter(s => s && s.type !== 'story' && s.type !== 'location_setup' && s.type !== 'encounter_sets').map(stepText).filter(Boolean);
      const deck = type => en.filter(c => c.encounter_code === cfg.id && c.type_code === type).sort((a, b) => (+a.stage) - (+b.stage) || a.code.localeCompare(b.code)).map(c => {
        const z = zhBy[c.code] || {};
        return {
          code: c.code, stage: +c.stage, name: clean(z.name || c.name), backName: clean(z.back_name || c.back_name || ''),
          flavor: clean(z.flavor || c.flavor), backFlavor: clean(z.back_flavor || c.back_flavor), backText: clean(z.back_text || c.back_text),
          res: [...new Set(((c.back_text || '').match(/→R\d+/g) || []).map(x => x.slice(1)))],
          need: type === 'agenda' ? (c.doom ? `毀滅 ${c.doom}` : '') : (c.clues ? (c.clues_fixed ? `${c.clues} 線索` : `每位調查員 ${c.clues} 線索`) : '目標見卡面')
        };
      });
      const resolutions = {};
      (g.resolutions || []).forEach(r => {
        const log = [];
        (r.steps || []).forEach(id => {
          const s = steps[id]; if (!s || id.startsWith('$')) return;
          const t = stepText(s); if (t) log.push(t);
          if (s.input && s.input.type === 'choose_one' && s.input.choices) s.input.choices.forEach(ch => ch.text && log.push('・' + clean(tr(ch.text))));
        });
        resolutions[r.id] = { text: clean(tr(r.text)), log };
      });
      const extra = (cfg.optional || []).map(o => ({ ...o, text: clean(tr((steps[o.step] || {}).text)) })).filter(o => o.text);
      return { id: `${cy.id}.${cfg.id}`, code: cfg.code, title, kind: cfg.kind || 'play', intro, setup, extra,
        agenda: cfg.kind === 'story' ? [] : deck('agenda'), act: cfg.kind === 'story' ? [] : deck('act'), resolutions, names: [] };
    });
    scenarios.forEach(sc => { sc.names = [...names].filter(n => [sc.intro, ...sc.agenda.concat(sc.act).flatMap(c => [c.flavor, c.backFlavor, c.backText]), ...Object.values(sc.resolutions).map(r => r.text)].join('\n').includes(n)); });
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
function sections(sc) {
  if (sc.kind === 'story') return [{ title: sc.title, groups: [
    { sub: '開場', items: chunks(sc.intro).map(t => ({ text: t, label: sc.title })) },
    ...(sc.extra || []).map(o => ({ sub: o.label, items: chunks(o.text).map(t => ({ text: t, label: o.label })) }))] }];
  const card = (c, w, i) => [
    ...(i === 0 ? [] : [{ sub: `${w} ${ROMAN[c.stage]} 正面 · ${c.name}`, items: cardItems(c, w) }]),
    { sub: `${w} ${ROMAN[c.stage]} 背面 · ${c.backName}`, items: cardItems(c, w, true), fx: c.backText }
  ];
  return [
    { title: '開場與開局', groups: [
      { sub: '開場', items: chunks(sc.intro).map(t => ({ text: t, label: '開場' })) },
      { sub: `密謀 I 正面 · ${sc.agenda[0].name}`, items: cardItems(sc.agenda[0], '密謀') },
      { sub: `場景 I 正面 · ${sc.act[0].name}`, items: cardItems(sc.act[0], '場景') }] },
    { title: '密謀卡', groups: sc.agenda.flatMap((c, i) => card(c, '密謀', i)) },
    { title: '場景卡', groups: sc.act.flatMap((c, i) => card(c, '場景', i)) },
    { title: '結局', groups: resIds(sc).map(id => ({ sub: resLabel(id), items: chunks(sc.resolutions[id].text).map(t => ({ text: t, label: resLabel(id) })), fx: (sc.resolutions[id].log || []).join('\n') })) }
  ];
}
