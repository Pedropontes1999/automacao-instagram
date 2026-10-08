const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = __dirname;
const cfg = JSON.parse(fs.readFileSync(path.join(BASE, 'config.json'), 'utf8'));
const estado = JSON.parse(fs.readFileSync(path.join(BASE, 'estado.json'), 'utf8'));
const legendas = JSON.parse(fs.readFileSync(path.join(BASE, 'legendas.json'), 'utf8'));
const videoUrls = JSON.parse(fs.readFileSync(path.join(BASE, 'video_urls.json'), 'utf8'));
const pageToken = process.env.PAGE_TOKEN || fs.readFileSync(path.join(BASE, 'segredos', 'page_token.txt'), 'utf8').trim();
const capaUrl = fs.readFileSync(path.join(BASE, 'capa_url.txt'), 'utf8').trim();

const GRAPH = 'https://graph.facebook.com/v21.0';
const LOG_FILE = path.join(BASE, 'postar.log');
const NA_NUVEM = process.env.GITHUB_ACTIONS === 'true';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (e) { /* sistema de arquivos read-only em alguns runners */ }
}

async function avisarViaIssue(titulo, mensagem) {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) { log('Sem GITHUB_REPOSITORY/GITHUB_TOKEN para abrir issue.'); return; }
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({ title: titulo, body: mensagem }),
  });
  if (!res.ok) log(`Falha ao criar issue: ${res.status} ${await res.text()}`);
}

function avisar(titulo, mensagem) {
  if (NA_NUVEM) {
    avisarViaIssue(titulo, mensagem).catch(e => log(`Falha ao avisar via issue: ${e.message}`));
    return;
  }
  try {
    const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${mensagem.replace(/'/g, "''")}', '${titulo.replace(/'/g, "''")}')`;
    execSync(`powershell -NoProfile -Command "${script}"`, { stdio: 'ignore' });
  } catch (e) {
    log(`Falha ao mostrar aviso: ${e.message}`);
  }
  try { fs.writeFileSync(path.join(BASE, `AVISO_${Date.now()}.txt`), `${titulo}\n\n${mensagem}`); } catch (e) { /* ignore */ }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function criarContainer(videoUrl, legenda) {
  const params = new URLSearchParams({
    media_type: 'REELS',
    video_url: videoUrl,
    caption: legenda,
    cover_url: capaUrl,
    access_token: pageToken,
  });
  const res = await fetch(`${GRAPH}/${cfg.ig_user_id}/media?${params.toString()}`, { method: 'POST' });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.id;
}

async function esperarProcessamento(containerId) {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${GRAPH}/${containerId}?fields=status_code&access_token=${pageToken}`);
    const data = await res.json();
    if (data.error) throw new Error(JSON.stringify(data.error));
    if (data.status_code === 'FINISHED') return true;
    if (data.status_code === 'ERROR') throw new Error('Processamento falhou no lado da Meta');
    await sleep(10000);
  }
  throw new Error('Tempo de processamento excedido');
}

async function publicar(containerId) {
  const params = new URLSearchParams({ creation_id: containerId, access_token: pageToken });
  const res = await fetch(`${GRAPH}/${cfg.ig_user_id}/media_publish?${params.toString()}`, { method: 'POST' });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.id;
}

function salvarEstado() {
  fs.writeFileSync(path.join(BASE, 'estado.json'), JSON.stringify(estado, null, 2));
}

async function main() {
  if (estado.proximo_video > estado.video_maximo) {
    log('Nenhum vídeo restante para postar.');
    avisar('Acabaram os vídeos', 'Todos os vídeos da pasta já foram postados. Coloque mais vídeos e me avise.');
    return;
  }

  const num = estado.proximo_video;
  const videoUrl = videoUrls[String(num)];
  if (!videoUrl) {
    log(`video_${num} não tem URL no Cloudinary ainda. Abortando.`);
    return;
  }

  const legendaObj = legendas[(estado.lote_atual - 1) % legendas.length];
  log(`Postando video_${num} (lote ${estado.lote_atual}, post ${estado.posts_no_lote_atual + 1}/${estado.tamanho_lote})`);

  try {
    const containerId = await criarContainer(videoUrl, legendaObj.legenda);
    await esperarProcessamento(containerId);
    const mediaId = await publicar(containerId);
    log(`OK - video_${num} publicado. media_id=${mediaId}`);
  } catch (e) {
    log(`FALHOU video_${num}: ${e.message}`);
    avisar('Falha ao postar', `video_${num} falhou: ${e.message}`);
    return;
  }

  estado.proximo_video += 1;
  estado.posts_no_lote_atual += 1;

  if (estado.posts_no_lote_atual >= estado.tamanho_lote) {
    estado.posts_no_lote_atual = 0;
    estado.lote_atual += 1;
    const novaLegendaObj = legendas[(estado.lote_atual - 1) % legendas.length];
    log(`Legenda trocou para o lote ${estado.lote_atual}. Atualize a bio.`);
    avisar('Trocar a bio do Instagram', `Nova legenda do lote ${estado.lote_atual}:\n\n${novaLegendaObj.legenda}`);
  }

  const restantes = estado.video_maximo - estado.proximo_video + 1;
  if (restantes === 12) {
    log('Faltam 12 vídeos. Avisando.');
    avisar('Vídeos acabando', 'Faltam 12 vídeos pra postar. Coloque mais vídeos na pasta de exportação.');
  }

  salvarEstado();
}

main().catch(e => {
  log(`ERRO GERAL: ${e.message}`);
  avisar('Erro na automação', e.message);
});
