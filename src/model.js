import { concepts, researchConcepts, skills, tasks } from './tasks.js';
export const MODEL_VERSION = '0.1.0';
export function createState(topicList = concepts) { return {version: MODEL_VERSION, attempts: [], cells: Object.fromEntries(topicList.flatMap(c => skills.map(s => [`${c}:${s}`, {score: .4, streak: 0, level: 1, last: null, count: 0}])))}; }
export function update(state, task, correct, time = Date.now(), duration = 0) {
  const cell = state.cells[`${task.concept}:${task.skill}`];
  cell.score = .7 * cell.score + .3 * Number(correct);
  cell.streak = correct ? cell.streak + 1 : 0;
  if (cell.streak >= 2) { cell.level = Math.min(3, cell.level + 1); cell.streak = 0; }
  if (!correct) cell.level = Math.max(1, cell.level - 1);
  cell.last = time; cell.count++;
  state.attempts.push({taskId: task.id, concept: task.concept, skill: task.skill, difficulty: task.difficulty, correct, time, duration});
}
export function priority(cell, now) {
  const days = cell.last === null ? 0 : Math.max(0, (now - cell.last) / 86400000);
  return (1 - cell.score) + Math.min(1, days / 7) * .65 + (cell.count === 0 ? .25 : 0);
}
export function selectNext(state, now = Date.now()) {
  const entries = Object.entries(state.cells).sort((a,b) => priority(b[1],now) - priority(a[1],now) || a[1].count - b[1].count);
  const [key, cell] = entries[0];
  const [concept, skill] = key.split(':');
  const task = tasks.find(t => t.concept === concept && t.skill === skill && t.difficulty === cell.level);
  const days = cell.last === null ? 0 : Math.max(0,(now-cell.last)/86400000);
  const reason = !cell.count ? `Explore ${concept.toLowerCase()} · ${skill.toLowerCase()}: this skill has no practice history yet.` : days >= 3 ? `Review ${concept.toLowerCase()} · ${skill.toLowerCase()}: ${Math.floor(days)} days since practice; review priority has increased.` : `Strengthen ${concept.toLowerCase()} · ${skill.toLowerCase()}: recent performance and difficulty guide this choice.`;
  return {task, reason, priority: priority(cell, now)};
}
export function seededRandom(seed) { let n = seed >>> 0; return () => { n += 0x6D2B79F5; let t = Math.imul(n ^ n >>> 15, 1 | n); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const profiles = {
  balanced: {label:'Balanced beginner', initial:[.35,.35,.35], learning:.09, forgetting:.045},
  uneven: {label:'Uneven skills', initial:[.65,.35,.15], learning:.09, forgetting:.045},
  fast: {label:'Faster forgetting', initial:[.4,.4,.4], learning:.09, forgetting:.12}
};
const clamp = n => Math.max(.02,Math.min(.98,n));
export function simulate({seed = 42, opportunities = 90, profile = 'uneven', runs = 30} = {}) {
  const cfg = profiles[profile];
  if (!cfg || !Number.isInteger(opportunities) || opportunities < 6 || opportunities > 1000 || !Number.isInteger(runs) || runs < 1 || runs > 200 || !Number.isInteger(seed)) throw new Error('Invalid simulation settings');
  const results = [];
  for(let run=0;run<runs;run++) {
    for(const condition of ['adaptive','fixed']) {
      const random = seededRandom(seed+run), state = createState(researchConcepts);
      const latent = Object.fromEntries(Object.keys(state.cells).map(k => [k,{skill: cfg.initial[skills.indexOf(k.split(':')[1])], last:0}]));
      const recall = (k, day, difficulty=2) => { const l=latent[k]; return clamp(l.skill * Math.exp(-cfg.forgetting * Math.max(0,day-l.last)) - (difficulty-2)*.12); };
      const exam = day => Object.keys(latent).reduce((sum,k)=>sum+recall(k,day),0)/6;
      let reached = null;
      const trace = [];
      for(let i=0;i<opportunities;i++) {
        const day=i/6, now=day*86400000;
        // The baseline cycles all six cells, then all three difficulty levels.
        const task = condition === 'adaptive' ? selectNext(state,now).task : tasks.find(t => t.concept === researchConcepts[Math.floor((i%6)/3)] && t.skill === skills[i%3] && t.difficulty === 1+Math.floor(i/6)%3);
        const k=`${task.concept}:${task.skill}`, probability=recall(k,day,task.difficulty), correct=random()<probability;
        // Practice restores accessibility and increases skill; this is an explicit simulation assumption.
        latent[k].skill += cfg.learning*(1-latent[k].skill); latent[k].last=day;
        update(state,task,correct,now);
        const accuracy=exam(day);
        if(reached===null && accuracy>=.7) reached=i+1;
        trace.push({attempt:i+1,day,taskId:task.id,correct,probability,accuracy});
      }
      const end=(opportunities-1)/6;
      results.push({run,condition,final:exam(end),delayed:exam(end+7),reached,trace});
    }
  }
  return {modelVersion:MODEL_VERSION,settings:{seed,opportunities,profile,runs,concepts:[...researchConcepts],delayDays:7,threshold:.7,attemptsPerDay:6}, assumptions:{...cfg, note:'Synthetic learner assumptions; not evidence of real learner benefit. Expected test accuracy across six skills at medium difficulty. Fixed schedule cycles skill cells and difficulty. Identical seed per paired run; task paths differ.'}, results};
}
export function summarize(experiment, condition) {
  const rows=experiment.results.filter(r=>r.condition===condition), reached=rows.filter(r=>r.reached!==null);
  const mean=k=>rows.reduce((s,r)=>s+r[k],0)/rows.length;
  return {final:mean('final'),delayed:mean('delayed'),success:reached.length,total:rows.length,efficiency:reached.length?reached.reduce((s,r)=>s+r.reached,0)/reached.length:null};
}
