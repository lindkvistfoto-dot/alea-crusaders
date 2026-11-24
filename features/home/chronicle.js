import { stories } from './chronicle-issue.js';
import { edition } from './chronicle-selection.js';
import { verifiedHonorImageUrl } from '../honors/honors-image-resolver.js';

const grid = document.getElementById('chronicleGrid');
const dialog = document.getElementById('arcaneChronicleDialog');
const login = document.getElementById('loginScreen');
let issueKey, request = 0;
function node(tag, value) {
  const element = document.createElement(tag);
  element.textContent = value;
  return element;
}
function read(story, src) {
  dialog.querySelector('img').src = src;
  dialog.querySelector('small').textContent = story.category;
  dialog.querySelector('h2').textContent = story.title;
  dialog.querySelector('.chronicle-text').replaceChildren(node('strong', story.deck), ...story.body.map(p => node('p', p)));
  dialog.showModal();
}
function render(session) {
  if (session === issueKey) return;
  issueKey = session;
  if (dialog.open) dialog.close();
  const cards = edition(stories, session).map(story => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chronicle-card';
    if (['arcane-banner-skymning', 'arcane-trophy-room-v2.2'].includes(story.id)) button.dataset.landscape = '';
    button.setAttribute('aria-haspopup', 'dialog');
    const src = verifiedHonorImageUrl(story);
    const image = document.createElement('img');
    image.src = src;
    image.alt = '';
    const copy = document.createElement('span');
    copy.className = 'chronicle-copy';
    copy.append(node('small', story.category), node('strong', story.title), node('span', story.deck));
    button.append(image, copy);
    button.addEventListener('click', () => read(story, src));
    return button;
  });
  grid.replaceChildren(...cards);
}
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

async function refresh() {
  const token = ++request;
  if (!login.classList.contains('hidden')) {
    if (dialog.open) dialog.close();
    issueKey = undefined;
    grid.replaceChildren();
    return;
  }
  if (issueKey === undefined) render(null);
  if (typeof centralCampaignId === 'undefined' || !centralCampaignId) return;
  const campaign = centralCampaignId;
  try {
    const rows = await window.dbJson('game_sessions?campaign_id=eq.' + encodeURIComponent(campaign) +
      '&status=in.(active,paused)&select=id&order=started_at.desc,id.asc&limit=1');
    if (token === request && campaign === centralCampaignId) render(rows[0]?.id || null);
  } catch (error) { console.warn('Spelmötet för Arcane Chronicle kunde inte läsas.', error); }
}
window.aleaRefreshChronicleEdition = refresh;
new MutationObserver(refresh).observe(login, { attributes: true, attributeFilter: ['class'] });
new MutationObserver(() => {
  if (!document.getElementById('landing').classList.contains('hidden')) void refresh();
}).observe(document.getElementById('landing'), { attributes: true, attributeFilter: ['class'] });
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
void refresh();
