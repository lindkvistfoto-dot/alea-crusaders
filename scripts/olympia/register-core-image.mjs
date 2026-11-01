import fs from 'node:fs/promises';

const owner = 'lindkvistfoto-dot';
const repo = 'alea-crusaders';
const api = `https://api.github.com/repos/${owner}/${repo}`;
const token = process.env.GITHUB_TOKEN;
const branch = 'development';

async function request(path, init = {}) {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

function workItemFor(queue, publication) {
  const items = Array.isArray(queue.items) ? queue.items : [];
  if (publication.olympia_item_id) {
    const item = items.find(item => item.id === publication.olympia_item_id) ?? null;
    if (!item) throw new Error(`OLYMPIA work item ${publication.olympia_item_id} was not found.`);
    return item;
  }
  if (Number.isSafeInteger(publication.source_pr_number)) {
    const matches = items.filter(item => item.pr_number === publication.source_pr_number ||
      item.release_source_prs?.includes(publication.source_pr_number));
    return matches.length === 1 ? matches[0] : null;
  }
  return null;
}

async function main() {
  const filename = process.argv[2];
  if (!filename || !token) throw new Error('Publication file or GitHub token is missing.');
  const publication = JSON.parse(await fs.readFile(filename, 'utf8'));
  if (publication.environment !== 'DEV' || publication.status !== 'verified' ||
      publication.schema !== 'hermes-core-publication/v1' || !publication.asset_key ||
      !publication.path || !/^[a-f0-9]{64}$/.test(publication.webp_sha256 || '')) {
    throw new Error('HERMES CORE publication is incomplete or not verified in DEV.');
  }
  const response = await request(`/contents/olympia/work-items.json?ref=${branch}`);
  const queue = JSON.parse(Buffer.from(response.content, 'base64').toString('utf8'));
  const item = workItemFor(queue, publication);
  if (!item) {
    console.log('HERMES CORE image verified; no unique OLYMPIA work item was linked, so no image inventory was changed.');
    return;
  }
  const existing = Array.isArray(item.images) ? item.images : [];
  const previous = existing.find(entry => entry.asset_key === publication.asset_key);
  const image = {
    asset_key: publication.asset_key,
    version: Math.max(1, Number(previous?.version || 0) + (previous?.webp_sha256 === publication.webp_sha256 ? 0 : 1)),
    target_kind: publication.target?.kind || 'system',
    target_id: publication.target?.id || publication.asset_key,
    ...(publication.target?.material ? {target_material: publication.target.material} : {}),
    label: publication.target?.label || publication.asset_key,
    webp_sha256: publication.webp_sha256,
    webp_path: publication.path,
    webp_bytes: publication.webp_bytes,
    width: publication.width,
    height: publication.height,
    alpha: publication.alpha,
    dev_publication_status: 'verified',
    source_pr_number: publication.source_pr_number ?? null,
    source_dev_sha: publication.source_dev_sha ?? null,
  };
  item.images = [...existing.filter(entry => entry.asset_key !== image.asset_key), image]
    .sort((a, b) => a.asset_key.localeCompare(b.asset_key));
  item.image_count = item.images.length;
  item.image_status = 'published';
  await request('/contents/olympia/work-items.json', {
    method: 'PUT',
    body: JSON.stringify({
      message: `olympia: register verified HERMES CORE image for ${item.id}`,
      branch,
      sha: response.sha,
      content: Buffer.from(`${JSON.stringify(queue, null, 2)}\n`).toString('base64'),
    }),
  });
  console.log(`OLYMPIA image inventory updated for ${item.id}: ${image.asset_key}`);
}

main().catch(error => { console.error(`OLYMPIA image inventory update failed: ${error.message}`); process.exitCode = 1; });
