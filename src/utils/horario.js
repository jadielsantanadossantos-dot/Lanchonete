function parseHHmm(v) {
  if (!v || typeof v !== 'string') return null;
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10), mm = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function getBrtNow() {
  const now = new Date();
  // BRT UTC-3 sem horário de verão desde 2019
  const brt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return { day: brt.getDay(), minutes: brt.getHours() * 60 + brt.getMinutes() };
}

function isDentroHorario(abertura, fechamento, dias) {
  const ab = parseHHmm(abertura);
  const fe = parseHHmm(fechamento);
  if (ab === null || fe === null) return false;
  const { day, minutes } = getBrtNow();
  if (Array.isArray(dias) && dias.length > 0) {
    const norm = dias.map(d => String(d));
    if (!norm.includes(String(day))) return false;
  }
  if (ab === fe) return true; // 24h
  if (fe > ab) return minutes >= ab && minutes < fe;
  // vira madrugada: ex 18:00-02:00
  return minutes >= ab || minutes < fe;
}

function isLojaAbertaEfetiva(cfg) {
  const modo = cfg.loja_modo || 'manual';
  const manualAberta = cfg.loja_aberta !== 'false'; // default aberto se ausente
  if (modo !== 'auto') return manualAberta;
  // modo auto: avalia horário, mas se admin fechou manualmente via botão, respeita toggle manual até reabrir
  // Se loja_aberta === 'false' no modo auto, significa admin forçou fechado → mantém fechado
  // Para reabrir, admin deve clicar no botão (que volta loja_aberta='true')
  // Se quiser que automático sempre vença, ignorar loja_aberta em modo auto. Aqui mantemos override manual vencedor.
  // Porém se horário está dentro e admin não forçou fechado, abre.
  if (cfg.loja_aberta === 'false') return false;
  if (cfg.loja_aberta === 'true' && !cfg.loja_horario_abertura) return true;
  const abertura = cfg.loja_horario_abertura;
  const fechamento = cfg.loja_horario_fechamento;
  let dias = null;
  try { dias = cfg.loja_horario_dias ? JSON.parse(cfg.loja_horario_dias) : null; } catch (_) { dias = null; }
  if (!abertura || !fechamento) return manualAberta;
  return isDentroHorario(abertura, fechamento, dias);
}

module.exports = { parseHHmm, isDentroHorario, getBrtNow, isLojaAbertaEfetiva };
