const BOT_TOKEN = 'YOUR_BOT_TOKEN';
const GITHUB_TOKEN = 'YOUR_GITHUB_TOKEN';
const GITHUB_OWNER = 'Amiro3D';
const GITHUB_REPO = 'ScriptTubeDrive';
const GROUP_CHAT_ID = -1003904388154;
const ADMIN_ID = 102332059;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const WORKER_URL = 'https://bitter-wind-2755.ame315898036.workers.dev';

// ──────────────── Telegram ────────────────

async function tg(method, body) {
    const r = await fetch(`${TELEGRAM_API}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await r.json();
}

async function sendPhoto(chatId, photo, caption, markup, replyTo) {
    const p = { chat_id: chatId, photo, caption };
    if (markup) p.reply_markup = markup;
    if (replyTo) p.reply_to_message_id = replyTo;
    return (await tg('sendPhoto', p)).result;
}

async function sendMessage(chatId, text, markup) {
    const p = { chat_id: chatId, text };
    if (markup) p.reply_markup = markup;
    return (await tg('sendMessage', p)).result;
}

async function editCaption(chatId, msgId, photo, caption, markup) {
    const p = { chat_id: chatId, message_id: msgId, media: { type: 'photo', media: photo, caption }, reply_markup: markup !== undefined ? markup : undefined };
    return await tg('editMessageMedia', p);
}

async function editText(chatId, msgId, text, markup) {
    const p = { chat_id: chatId, message_id: msgId, text };
    if (markup) p.reply_markup = markup;
    return await tg('editMessageText', p);
}

async function answerCb(id, text, alert) {
    return await tg('answerCallbackQuery', { callback_query_id: id, text, show_alert: alert || false });
}

async function delMsg(chatId, msgId) {
    await tg('deleteMessage', { chat_id: chatId, message_id: msgId });
}

// ──────────────── Helpers ────────────────

function extractVideoId(text) {
    const m = text.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([0-9A-Za-z_-]{11})/);
    return m ? m[1] : (text.length === 11 && /^[0-9A-Za-z_-]+$/.test(text) ? text : null);
}

function isInstagramUrl(text) {
    return /(?:instagram\.com\/(?:p|reel|reels|stories|tv|embed)\/)/i.test(text);
}

function extractInstagramUrl(text) {
    const m = text.match(/(https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels|stories|tv|embed)\/[^\s]+)/i);
    return m ? m[1] : null;
}

function isTikTokUrl(text) {
    return /(?:tiktok\.com\/|vm\.tiktok\.com\/)/i.test(text);
}

function extractTikTokUrl(text) {
    const m = text.match(/(https?:\/\/(?:www\.)?(?:tiktok\.com\/@[\w.-]+\/video\/\d+|vm\.tiktok\.com\/[\w.-]+)[^\s]*)/i);
    return m ? m[1] : null;
}

function isGitHubRepoUrl(text) {
    return /^https?:\/\/(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(text.trim());
}

function extractGitHubRepo(text) {
    const m = text.trim().match(/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/?$/);
    return m ? { owner: m[1], repo: m[2] } : null;
}

async function getVideoInfo(videoId) {
    let title = 'Unknown Video';
    try {
        const r = await fetch(`https://www.youtube.com/oembed?url=https://youtu.be/${videoId}&format=json`);
        if (r.ok) title = (await r.json()).title;
    } catch (e) {}

    let thumb = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    try {
        const h = await fetch(thumb, { method: 'HEAD' });
        if (!h.ok) {
            thumb = `https://img.youtube.com/vi/${videoId}/sddefault.jpg`;
            const h2 = await fetch(thumb, { method: 'HEAD' });
            if (!h2.ok) thumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        }
    } catch (e) { thumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`; }

    return { title, thumbnail: thumb };
}

function progressBar(pct) {
    const total = 20;
    const filled = Math.round((pct / 100) * total);
    return '▰'.repeat(filled) + '▱'.repeat(total - filled);
}

function progressCaption(title, pct, status) {
    if (status === 'done') return title;
    if (status === 'uploading') return `⬆️ Uploading to Telegram...\n\n${progressBar(pct)}`;
    return `${title}\n\n⬇️ Downloading...\n\n${progressBar(pct)}  ${pct}%`;
}

// ──────────────── KV ────────────────

async function trackDownload(env, rec) {
    const key = `dl:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
    await env.DOWNLOADS.put(key, JSON.stringify(rec), { expirationTtl: 86400 * 30 });

    const raw = await env.DOWNLOADS.get('dl:list');
    const list = raw ? JSON.parse(raw) : [];
    list.unshift(key);
    if (list.length > 50) {
        for (const old of list.splice(50)) await env.DOWNLOADS.delete(old);
    }
    await env.DOWNLOADS.put('dl:list', JSON.stringify(list));

    if (rec.chatId) {
        const uRaw = await env.DOWNLOADS.get('users:set');
        const users = uRaw ? JSON.parse(uRaw) : [];
        if (!users.includes(rec.chatId)) {
            users.push(rec.chatId);
            await env.DOWNLOADS.put('users:set', JSON.stringify(users));
        }
    }
}

async function getRecentDownloads(env, count) {
    const raw = await env.DOWNLOADS.get('dl:list');
    const list = raw ? JSON.parse(raw) : [];
    const out = [];
    for (const k of list.slice(0, count)) {
        const v = await env.DOWNLOADS.get(k);
        if (v) out.push(JSON.parse(v));
    }
    return out;
}

async function getPlatformDownloads(env, platform, count) {
    const raw = await env.DOWNLOADS.get('dl:list');
    const list = raw ? JSON.parse(raw) : [];
    const out = [];
    for (const k of list) {
        if (out.length >= count) break;
        const v = await env.DOWNLOADS.get(k);
        if (!v) continue;
        const r = JSON.parse(v);
        if ((r.platform || 'youtube') === platform) out.push(r);
    }
    return out;
}

async function getStats(env) {
    const raw = await env.DOWNLOADS.get('dl:list');
    const list = raw ? JSON.parse(raw) : [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayTs = today.getTime();
    let todayCount = 0;
    const qStats = {};
    const userStats = {};
    const platformStats = { youtube: 0, instagram: 0, tiktok: 0, github: 0 };
    const platformToday = { youtube: 0, instagram: 0, tiktok: 0, github: 0 };
    for (const k of list) {
        const v = await env.DOWNLOADS.get(k);
        if (!v) continue;
        const r = JSON.parse(v);
        if (r.timestamp >= todayTs) {
            todayCount++;
            const p = r.platform || 'youtube';
            platformToday[p] = (platformToday[p] || 0) + 1;
        }
        qStats[r.quality] = (qStats[r.quality] || 0) + 1;
        const p = r.platform || 'youtube';
        platformStats[p] = (platformStats[p] || 0) + 1;
        const uid = String(r.chatId);
        if (!userStats[uid]) userStats[uid] = { name: r.user || 'Unknown', count: 0 };
        userStats[uid].count++;
    }
    const uRaw = await env.DOWNLOADS.get('users:set');
    return { total: list.length, today: todayCount, totalUsers: uRaw ? JSON.parse(uRaw).length : 0, qStats, userStats, platformStats, platformToday };
}

// ──────────────── GitHub ────────────────

async function triggerGitHub(videoUrl, quality, chatId, progressMsgId) {
    const r = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'CFWorker', 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'direct_download_large', client_payload: { url: videoUrl, quality, chat_id: String(chatId), progress_msg_id: String(progressMsgId), group_chat_id: GROUP_CHAT_ID } })
    });
    return r.status === 204;
}

async function triggerInstagram(instagramUrl, chatId, progressMsgId) {
    const r = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'CFWorker', 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'direct_download_instagram', client_payload: { url: instagramUrl, chat_id: String(chatId), progress_msg_id: String(progressMsgId), group_chat_id: GROUP_CHAT_ID } })
    });
    return r.status === 204;
}

async function triggerTikTok(tiktokUrl, chatId, progressMsgId) {
    const r = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'CFWorker', 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'direct_download_tiktok', client_payload: { url: tiktokUrl, chat_id: String(chatId), progress_msg_id: String(progressMsgId), group_chat_id: GROUP_CHAT_ID } })
    });
    return r.status === 204;
}

async function triggerGitHubRepo(repoUrl, chatId, progressMsgId) {
    const r = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'CFWorker', 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'direct_download_github', client_payload: { url: repoUrl, chat_id: String(chatId), progress_msg_id: String(progressMsgId), group_chat_id: GROUP_CHAT_ID } })
    });
    return r.status === 204;
}

async function fetchGitHubReleases(owner, repo, page = 1, perPage = 30) {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=${perPage}&page=${page}`, {
        headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'CFWorker' }
    });
    if (!r.ok) return [];
    return await r.json();
}

function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)}MB`;
    return `${(bytes / 1073741824).toFixed(1)}GB`;
}

// ──────────────── GitHub Handlers ────────────────

async function handleGitHub(chatId, msgId, owner, repo, env) {
    try {
        const releases = await fetchGitHubReleases(owner, repo, 1, 30);
        const tagList = releases.map(r => r.tag_name);
        await env.DOWNLOADS.put(`gh:${owner}/${repo}`, JSON.stringify(tagList), { expirationTtl: 600 });
        const kb = { inline_keyboard: [
            [{ text: '📦 Download Source (zip)', callback_data: `gh:s:${owner}/${repo}` }],
            [{ text: '📋 View Releases', callback_data: `gh:vr:${owner}/${repo}` }]
        ]};
        await sendMessage(chatId, `🐙 ${owner}/${repo}\n\nChoose an option:`, kb);
    } catch (e) {
        await sendMessage(chatId, `🐙 ${owner}/${repo}\n\n❌ Error: ${e.message}`);
    }
}

function buildReleaseButtons(owner, repo, releases, showOlder, olderPage) {
    const rows = releases.slice(0, 5).map((r, i) => [
        { text: `${r.prerelease ? '⚠️' : '🏷️'} ${r.tag_name}`, callback_data: `gh:a:${owner}/${repo}:${i}` }
    ]);
    const nav = [];
    if (showOlder) nav.push({ text: '⬅️ Older', callback_data: `gh:r:${owner}/${repo}:${olderPage}` });
    if (nav.length) rows.push(nav);
    return { inline_keyboard: rows };
}

function buildAssetButtons(repoPath, assetList, page, hasMore) {
    const rows = assetList.map((a, i) => [
        { text: `📄 ${a.name} (${formatSize(a.size)})`, callback_data: `gh:f:${repoPath}:${page * 5 + i}` }
    ]);
    const nav = [];
    if (page > 0) nav.push({ text: '⬅️ Back', callback_data: `gh:ap:${repoPath}:${page - 1}` });
    if (hasMore) nav.push({ text: '➡️ More', callback_data: `gh:ap:${repoPath}:${page + 1}` });
    if (nav.length) rows.push(nav);
    rows.unshift([{ text: '📦 Download Source (zip)', callback_data: `gh:s:${repoPath}` }]);
    rows.push([{ text: '⬅️ Back to Releases', callback_data: `gh:r:${repoPath}:0` }]);
    return { inline_keyboard: rows };
}

// ──────────────── Progress Endpoint ────────────────

async function handleVideo(chatId, msgId, videoId, env) {
    const { title, thumbnail } = await getVideoInfo(videoId);

    const kb = { inline_keyboard: [
        [
            { text: '144p', callback_data: `q:${videoId}:144` },
            { text: '240p', callback_data: `q:${videoId}:240` },
            { text: '360p', callback_data: `q:${videoId}:360` },
            { text: '480p', callback_data: `q:${videoId}:480` }
        ], [
            { text: '720p', callback_data: `q:${videoId}:720` },
            { text: '1080p', callback_data: `q:${videoId}:1080` }
        ], [
            { text: '🏆 Best', callback_data: `q:${videoId}:best` },
            { text: '🎵 Audio', callback_data: `q:${videoId}:audio` }
        ]
    ]};

    const r = await sendPhoto(chatId, thumbnail, `🎬 ${title}\n\n⬇️ Choose quality:`, kb, msgId);
    if (r && r.message_id) {
        await env.DOWNLOADS.put(`msg:${videoId}:${chatId}`, String(r.message_id), { expirationTtl: 600 });
    }
}

// ──────────────── Instagram Request ────────────────

async function handleInstagram(chatId, msgId, igUrl, env) {
    const statusMsg = await sendMessage(chatId, `📷 Instagram\n\n⬇️ Preparing download...`);
    if (!statusMsg || !statusMsg.message_id) return;
    const progMsgId = statusMsg.message_id;
    await env.DOWNLOADS.put(`title:${progMsgId}:${chatId}`, 'Instagram Post', { expirationTtl: 600 });
    await env.DOWNLOADS.put(`thumb:${progMsgId}:${chatId}`, '', { expirationTtl: 600 });
    const ok = await triggerInstagram(igUrl, chatId, progMsgId);
    if (ok) {
        await trackDownload(env, { title: 'Instagram Post', quality: 'auto', chatId, platform: 'instagram', user: 'Unknown', timestamp: Date.now() });
    } else {
        await editCaption(chatId, progMsgId, '', '📷 Instagram\n\n❌ Failed to start download');
    }
}

// ──────────────── TikTok Request ────────────────

async function handleTikTok(chatId, msgId, tiktokUrl, env) {
    const statusMsg = await sendMessage(chatId, `🎵 TikTok\n\n⬇️ Preparing download...`);
    if (!statusMsg || !statusMsg.message_id) return;
    const progMsgId = statusMsg.message_id;
    await env.DOWNLOADS.put(`title:${progMsgId}:${chatId}`, 'TikTok Video', { expirationTtl: 600 });
    await env.DOWNLOADS.put(`thumb:${progMsgId}:${chatId}`, '', { expirationTtl: 600 });
    const ok = await triggerTikTok(tiktokUrl, chatId, progMsgId);
    if (ok) {
        await trackDownload(env, { title: 'TikTok Video', quality: 'auto', chatId, platform: 'tiktok', user: 'Unknown', timestamp: Date.now() });
    } else {
        await editCaption(chatId, progMsgId, '', '🎵 TikTok\n\n❌ Failed to start download');
    }
}

// ──────────────── Progress Endpoint ────────────────

async function handleProgress(request, env) {
    try {
        const { chat_id, message_id, progress, status, file_size, quality } = await request.json();
        const chatId = Number(chat_id);
        const msgId = Number(message_id);

        // Look up stored data from KV
        const title = await env.DOWNLOADS.get(`title:${msgId}:${chatId}`) || 'Video';
        const thumbnail = await env.DOWNLOADS.get(`thumb:${msgId}:${chatId}`) || '';

        if (status === 'done') {
            if (quality === 'Instagram' || quality === 'TikTok' || quality === 'GitHub') {
                await delMsg(chatId, msgId);
            } else {
                const size = file_size ? `📦 ${file_size}` : '';
                const q = quality ? (quality === 'audio' ? '🎵 Audio' : `🎬 ${quality.toUpperCase()}`) : '';
                const info = [size, q].filter(Boolean).join('  ·  ');
                if (thumbnail) {
                    await editCaption(chatId, msgId, thumbnail, `🎬 ${title}\n\n${info}`);
                } else {
                    await editText(chatId, msgId, `✅ ${title}\n\n${info}`);
                }
            }
            await env.DOWNLOADS.delete(`title:${msgId}:${chatId}`);
            await env.DOWNLOADS.delete(`thumb:${msgId}:${chatId}`);
        } else if (status === 'uploading') {
            if (thumbnail) {
                await editCaption(chatId, msgId, thumbnail, progressCaption(title, Number(progress) || 90, 'uploading'));
            } else {
                await editText(chatId, msgId, progressCaption(title, Number(progress) || 90, 'uploading'));
            }
        } else if (status === 'error') {
            if (thumbnail) {
                await editCaption(chatId, msgId, thumbnail, `❌ Download failed`);
            } else {
                await editText(chatId, msgId, `❌ Download failed`);
            }
            await env.DOWNLOADS.delete(`title:${msgId}:${chatId}`);
            await env.DOWNLOADS.delete(`thumb:${msgId}:${chatId}`);
        } else {
            const pct = Math.min(100, Math.max(0, Number(progress) || 0));
            await editCaption(chatId, msgId, thumbnail, progressCaption(title, pct, 'downloading'));
        }
        return new Response('OK');
    } catch (e) {
        return new Response('Error: ' + e.message, { status: 400 });
    }
}

// ──────────────── Main ────────────────

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname === '/progress' && request.method === 'POST') {
            return await handleProgress(request, env);
        }

        if (url.pathname !== `/webhook/${BOT_TOKEN}` || request.method !== 'POST') return new Response('Bot running');

        try {
            const update = await request.json();

            // ── Callbacks ──
            if (update.callback_query) {
                const q = update.callback_query;
                const data = q.data;
                const chatId = q.message?.chat?.id;
                const msgId = q.message?.message_id;
                const userId = q.from?.id;

                // Quality selection
                if (data.startsWith('q:')) {
                    const [, videoId, quality] = data.split(':');
                    await answerCb(q.id, `Starting ${quality}...`);

                    const { title, thumbnail } = await getVideoInfo(videoId);

                    await env.DOWNLOADS.put(`thumb:${msgId}:${chatId}`, thumbnail, { expirationTtl: 600 });
                    await env.DOWNLOADS.put(`title:${msgId}:${chatId}`, title, { expirationTtl: 600 });

                    await editCaption(chatId, msgId, thumbnail, progressCaption(title, 0, 'downloading'), {});

                    const ok = await triggerGitHub(`https://youtu.be/${videoId}`, quality, chatId, msgId);

                    if (ok) {
                        await trackDownload(env, {
                            videoId, title, quality, chatId, platform: 'youtube',
                            user: q.from?.username || q.from?.first_name || 'Unknown',
                            timestamp: Date.now()
                        });
                    } else {
                        await editCaption(chatId, msgId, thumbnail, `🎬 ${title}\n\n❌ Failed to start download`);
                    }
                    return new Response('OK');
                }

                // GitHub: View releases (first page)
                if (data.startsWith('gh:vr:')) {
                    const repoPath = data.slice(6);
                    const [owner, repo] = repoPath.split('/');
                    await answerCb(q.id, 'Loading releases...');
                    const releases = await fetchGitHubReleases(owner, repo, 1, 30);
                    if (!releases.length) {
                        await editText(chatId, msgId, `🐙 ${repoPath}\n\n📭 No releases found.`);
                        return new Response('OK');
                    }
                    const tagList = releases.map(r => r.tag_name);
                    await env.DOWNLOADS.put(`gh:${repoPath}`, JSON.stringify(tagList), { expirationTtl: 600 });
                    const kb = buildReleaseButtons(owner, repo, releases, true, 1);
                    const list = releases.slice(0, 5).map((r, i) => {
                        const date = new Date(r.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        const size = r.assets?.reduce((s, a) => s + (a.size || 0), 0);
                        const sizeStr = size ? ` · ${formatSize(size)}` : '';
                        return `${i + 1}. ${r.prerelease ? '⚠️' : '🏷️'} ${r.tag_name} — ${date}${sizeStr}`;
                    }).join('\n');
                    await editText(chatId, msgId, `🐙 ${repoPath}\n\n📋 Latest releases:\n\n${list}`, kb);
                    return new Response('OK');
                }

                // GitHub: Releases page (paginated)
                if (data.startsWith('gh:r:')) {
                    const parts = data.slice(5);
                    const lastColon = parts.lastIndexOf(':');
                    const repoPath = parts.slice(0, lastColon);
                    const page = parseInt(parts.slice(lastColon + 1)) || 0;
                    const [owner, repo] = repoPath.split('/');
                    await answerCb(q.id, 'Loading...');
                    const releases = await fetchGitHubReleases(owner, repo, page + 1, 5);
                    if (!releases.length) {
                        await editText(chatId, msgId, `🐙 ${repoPath}\n\n📭 No more releases`);
                        return new Response('OK');
                    }
                    const tagList = releases.map(r => r.tag_name);
                    await env.DOWNLOADS.put(`gh:${repoPath}`, JSON.stringify(tagList), { expirationTtl: 600 });
                    const kb = buildReleaseButtons(owner, repo, releases, true, page + 1);
                    const list = releases.slice(0, 5).map((r, i) => {
                        const date = new Date(r.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        const size = r.assets?.reduce((s, a) => s + (a.size || 0), 0);
                        const sizeStr = size ? ` · ${formatSize(size)}` : '';
                        return `${i + 1}. ${r.prerelease ? '⚠️' : '🏷️'} ${r.tag_name} — ${date}${sizeStr}`;
                    }).join('\n');
                    await editText(chatId, msgId, `🐙 ${repoPath}\n\n📋 Releases (page ${page + 1}):\n\n${list}`, kb);
                    return new Response('OK');
                }

                // GitHub: Show assets for a release
                if (data.startsWith('gh:a:')) {
                    const parts = data.slice(5);
                    const lastColon = parts.lastIndexOf(':');
                    const repoPath = parts.slice(0, lastColon);
                    const idx = parseInt(parts.slice(lastColon + 1));
                    const [owner, repo] = repoPath.split('/');
                    await answerCb(q.id, 'Loading files...');

                    const tagListRaw = await env.DOWNLOADS.get(`gh:${repoPath}`);
                    if (!tagListRaw) {
                        await editText(chatId, msgId, `🐙 ${repoPath}\n\n❌ Session expired. Send the link again.`);
                        return new Response('OK');
                    }
                    const tagList = JSON.parse(tagListRaw);
                    const tag = tagList[idx];
                    if (!tag) {
                        await editText(chatId, msgId, `🐙 ${repoPath}\n\n❌ Release not found`);
                        return new Response('OK');
                    }

                    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`, {
                        headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'CFWorker' }
                    });
                    if (!r.ok) {
                        await editText(chatId, msgId, `🐙 ${repoPath}\n\n❌ Release not found`);
                        return new Response('OK');
                    }
                    const release = await r.json();
                    const assets = release.assets || [];
                    if (!assets.length) {
                        const kb = { inline_keyboard: [
                            [{ text: '⬅️ Back to Releases', callback_data: `gh:r:${repoPath}:0` }]
                        ]};
                        await editText(chatId, msgId, `🐙 ${repoPath}\n\n🏷️ ${tag}\n\n📭 No files in this release`, kb);
                        return new Response('OK');
                    }

                    await env.DOWNLOADS.put(`gh:${repoPath}:assets`, JSON.stringify(assets), { expirationTtl: 600 });
                    const PAGE_SIZE = 5;
                    const pageAssets = assets.slice(0, PAGE_SIZE);
                    const hasMore = PAGE_SIZE < assets.length;
                    const kb = buildAssetButtons(repoPath, pageAssets, 0, hasMore);
                    const list = pageAssets.map((a, i) => `${i + 1}. 📄 ${a.name} (${formatSize(a.size)})`).join('\n');
                    await editText(chatId, msgId, `🐙 ${repoPath}\n\n🏷️ ${tag}\n\n📋 Files (1–${Math.min(PAGE_SIZE, assets.length)} of ${assets.length}):\n\n${list}`, kb);
                    return new Response('OK');
                }

                // GitHub: Page through stored assets
                if (data.startsWith('gh:ap:')) {
                    const parts = data.slice(6);
                    const lastColon = parts.lastIndexOf(':');
                    const repoPath = parts.slice(0, lastColon);
                    const page = parseInt(parts.slice(lastColon + 1)) || 0;
                    const [owner, repo] = repoPath.split('/');
                    await answerCb(q.id, 'Loading...');
                    const assetsRaw = await env.DOWNLOADS.get(`gh:${repoPath}:assets`);
                    if (!assetsRaw) {
                        await editText(chatId, msgId, `🐙 ${repoPath}\n\n❌ Session expired. Send the link again.`);
                        return new Response('OK');
                    }
                    const assets = JSON.parse(assetsRaw);
                    const PAGE_SIZE = 5;
                    const start = page * PAGE_SIZE;
                    const pageAssets = assets.slice(start, start + PAGE_SIZE);
                    const hasMore = start + PAGE_SIZE < assets.length;
                    const kb = buildAssetButtons(repoPath, pageAssets, page, hasMore);
                    const list = pageAssets.map((a, i) => `${start + i + 1}. 📄 ${a.name} (${formatSize(a.size)})`).join('\n');
                    await editText(chatId, msgId, `🐙 ${repoPath}\n\n📋 Files (${start + 1}–${Math.min(start + PAGE_SIZE, assets.length)} of ${assets.length}):\n\n${list}`, kb);
                    return new Response('OK');
                }

                // GitHub: Download source zip
                if (data.startsWith('gh:s:')) {
                    const repoPath = data.slice(5);
                    await answerCb(q.id, 'Downloading...');
                    await env.DOWNLOADS.put(`title:${msgId}:${chatId}`, `🐙 ${repoPath}`, { expirationTtl: 600 });
                    await env.DOWNLOADS.put(`thumb:${msgId}:${chatId}`, '', { expirationTtl: 600 });
                    await editText(chatId, msgId, progressCaption(`🐙 ${repoPath}`, 0, 'downloading'));
                    const repoUrl = `https://github.com/${repoPath}`;
                    const ok = await triggerGitHubRepo(repoUrl, chatId, msgId);
                    if (ok) {
                        await trackDownload(env, { title: `🐙 ${repoPath}`, quality: 'source', chatId, platform: 'github', user: 'Unknown', timestamp: Date.now() });
                    } else {
                        await editText(chatId, msgId, `🐙 ${repoPath}\n\n❌ Failed to start download`);
                    }
                    return new Response('OK');
                }

                // GitHub: Download specific file
                if (data.startsWith('gh:f:')) {
                    const parts = data.slice(5);
                    const lastColon = parts.lastIndexOf(':');
                    const repoPath = parts.slice(0, lastColon);
                    const idx = parseInt(parts.slice(lastColon + 1));
                    const [owner, repo] = repoPath.split('/');
                    await answerCb(q.id, 'Starting download...');

                    const assetsRaw = await env.DOWNLOADS.get(`gh:${repoPath}:assets`);
                    if (!assetsRaw) {
                        await editText(chatId, msgId, `❌ Session expired. Send the link again.`);
                        return new Response('OK');
                    }
                    const assets = JSON.parse(assetsRaw);
                    const asset = assets[idx];
                    if (!asset) {
                        await editText(chatId, msgId, `❌ File not found`);
                        return new Response('OK');
                    }
                    await editText(chatId, msgId, progressCaption(`🐙 ${asset.name}`, 0, 'downloading'));
                    await env.DOWNLOADS.put(`title:${msgId}:${chatId}`, `🐙 ${asset.name}`, { expirationTtl: 600 });
                    await env.DOWNLOADS.put(`thumb:${msgId}:${chatId}`, '', { expirationTtl: 600 });
                    const ok = await triggerGitHubRepo(asset.browser_download_url, chatId, msgId);
                    if (ok) {
                        await trackDownload(env, { title: `🐙 ${asset.name}`, quality: 'release', chatId, platform: 'github', user: 'Unknown', timestamp: Date.now() });
                    } else {
                        await editText(chatId, msgId, `❌ Failed to download ${asset.name}`);
                    }
                    return new Response('OK');
                }

                // Admin callbacks
                if (data.startsWith('a:') && userId === ADMIN_ID) {
                    const action = data.split(':')[1];

                    if (action === 'stats') {
                        await answerCb(q.id, 'Loading...');
                        const s = await getStats(env);
                        const userList = Object.entries(s.userStats)
                            .sort((a, b) => b[1].count - a[1].count)
                            .slice(0, 10)
                            .map(([_, u], i) => `  ${i + 1}. ${u.name} — ${u.count} dl`)
                            .join('\n');
                        await editText(chatId, msgId,
                            `📊 Statistics\n━━━━━━━━━━━━━━━━━\n\n` +
                            `📥 Total: ${s.total}  |  📅 Today: ${s.today}\n👥 Users: ${s.totalUsers}\n\n` +
                            `📺 YouTube: ${s.platformStats.youtube || 0} (today: ${s.platformToday.youtube || 0})\n` +
                            `📷 Instagram: ${s.platformStats.instagram || 0} (today: ${s.platformToday.instagram || 0})\n` +
                            `🎵 TikTok: ${s.platformStats.tiktok || 0} (today: ${s.platformToday.tiktok || 0})\n` +
                            `🐙 GitHub: ${s.platformStats.github || 0} (today: ${s.platformToday.github || 0})` +
                            (userList ? `\n\n👤 Top Users:\n${userList}` : '')
                        );
                        return new Response('OK');
                    }

                    if (action === 'history') {
                        await answerCb(q.id, 'Loading...');
                        const dl = await getRecentDownloads(env, 20);
                        if (!dl.length) { await editText(chatId, msgId, '📭 No downloads yet'); return new Response('OK'); }
                        const lines = dl.map((d, i) => {
                            const t = new Date(d.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
                            const emoji = { youtube: '📺', instagram: '📷', tiktok: '🎵', github: '🐙' }[d.platform] || '📥';
                            return `${i + 1}. ${emoji} ${(d.title || '?').slice(0, 40)}\n   ${d.quality} | ${d.user} | ${t}`;
                        });
                        await editText(chatId, msgId, `📜 All Downloads\n━━━━━━━━━━━━━━━━━\n\n${lines.join('\n\n')}`);
                        return new Response('OK');
                    }

                    if (action.startsWith('hist:')) {
                        const platform = action.slice(5);
                        const emoji = { youtube: '📺', instagram: '📷', tiktok: '🎵', github: '🐙' }[platform] || '📥';
                        const name = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', github: 'GitHub' }[platform] || platform;
                        await answerCb(q.id, 'Loading...');
                        const dl = await getPlatformDownloads(env, platform, 20);
                        if (!dl.length) { await editText(chatId, msgId, `📭 No ${name} downloads yet`); return new Response('OK'); }
                        const lines = dl.map((d, i) => {
                            const t = new Date(d.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
                            return `${i + 1}. ${emoji} ${(d.title || '?').slice(0, 45)}\n   ${d.quality} | ${d.user} | ${t}`;
                        });
                        await editText(chatId, msgId, `📜 ${name} Downloads\n━━━━━━━━━━━━━━━━━\n\n${lines.join('\n\n')}`);
                        return new Response('OK');
                    }

                    if (action === 'broadcast') {
                        await env.DOWNLOADS.put('broadcast:active', '1', { expirationTtl: 300 });
                        const kb = { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'a:cancel_bc' }]] };
                        await editText(chatId, msgId,
                            `📢 Broadcast Mode\n━━━━━━━━━━━━━━━━━\n\nType your message to broadcast:\n\n⬇️ Send now:`,
                            kb
                        );
                        await answerCb(q.id, 'Broadcast mode');
                        return new Response('OK');
                    }

                    if (action === 'cancel_bc') {
                        await env.DOWNLOADS.delete('broadcast:active');
                        await editText(chatId, msgId, `❌ Broadcast cancelled.`);
                        await answerCb(q.id, 'Cancelled');
                        return new Response('OK');
                    }

                    return new Response('OK');
                }

                return new Response('OK');
            }

            // ── Messages ──
            if (!update.message) return new Response('OK');
            const msg = update.message;
            const chatId = msg.chat.id;
            const userId = msg.from?.id;
            const text = msg.text?.trim() || '';
            const isPrivate = msg.chat.type === 'private';

            if (isPrivate) {

                // Admin broadcast flow
                if (userId === ADMIN_ID) {
                    const bcActive = await env.DOWNLOADS.get('broadcast:active');
                    if (bcActive && !text.startsWith('/')) {
                        await env.DOWNLOADS.delete('broadcast:active');
                        const uRaw = await env.DOWNLOADS.get('users:set');
                        const users = uRaw ? JSON.parse(uRaw) : [];
                        const statusMsg = await sendMessage(chatId, `📢 Broadcasting to ${users.length} users...`);
                        let sent = 0;
                        for (const uid of users) {
                            try { await sendMessage(uid, `📢 Broadcast\n\n${text}`); sent++; } catch (e) {}
                        }
                        if (statusMsg?.message_id) {
                            await editText(chatId, statusMsg.message_id, `✅ Sent to ${sent}/${users.length} users.`);
                        }
                        return new Response('OK');
                    }
                    if (text === '/cancel' && bcActive) {
                        await env.DOWNLOADS.delete('broadcast:active');
                        await sendMessage(chatId, `❌ Broadcast cancelled.`);
                        return new Response('OK');
                    }
                }

                if (text === '/start') {
                    await sendMessage(chatId,
                        `━━━━━━━━━━━━━━━━━\n` +
                        `🎬  Media Downloader\n` +
                        `━━━━━━━━━━━━━━━━━\n\n` +
                        `Hey! Send me a link and I'll\n` +
                        `download it for you.\n\n` +
                        `📺  YouTube — quality picker\n` +
                        `📷  Instagram — auto download\n` +
                        `🎵  TikTok — auto download\n` +
                        `🐙  GitHub — repo + releases\n\n` +
                        `⬇️  144p — 1080p + Audio\n` +
                        `📦  Up to 2 GB\n\n` +
                        `Paste a link to start ✨`
                    );
                    return new Response('OK');
                }

                if (text === '/status') {
                    await sendMessage(chatId,
                        `━━━━━━━━━━━━━━━━━\n` +
                        `⚙️  Bot Status\n` +
                        `━━━━━━━━━━━━━━━━━\n\n` +
                        `🟢 Online\n` +
                        `⚡ GitHub Actions Engine\n` +
                        `📐 144p — 1080p + Audio\n` +
                        `📦 Max 2 GB`
                    );
                    return new Response('OK');
                }

                if (userId === ADMIN_ID && text === '/admin') {
                    const kb = { inline_keyboard: [
                        [{ text: '📊 Stats', callback_data: 'a:stats' }, { text: '📜 History', callback_data: 'a:history' }],
                        [{ text: '📺 YouTube', callback_data: 'a:hist:youtube' }, { text: '📷 Instagram', callback_data: 'a:hist:instagram' }],
                        [{ text: '🎵 TikTok', callback_data: 'a:hist:tiktok' }, { text: '🐙 GitHub', callback_data: 'a:hist:github' }],
                        [{ text: '📢 Broadcast', callback_data: 'a:broadcast' }]
                    ]};
                    await sendMessage(chatId,
                        `━━━━━━━━━━━━━━━━━\n` +
                        `🔐  Admin Panel\n` +
                        `━━━━━━━━━━━━━━━━━`,
                        kb
                    );
                    return new Response('OK');
                }

                const vid = extractVideoId(text);
                if (vid) { await handleVideo(chatId, msg.message_id, vid, env); return new Response('OK'); }

                const igUrl = extractInstagramUrl(text);
                if (igUrl) { await handleInstagram(chatId, msg.message_id, igUrl, env); return new Response('OK'); }

                const ttUrl = extractTikTokUrl(text);
                if (ttUrl) { await handleTikTok(chatId, msg.message_id, ttUrl, env); return new Response('OK'); }

                const ghRepo = extractGitHubRepo(text);
                if (ghRepo) { await handleGitHub(chatId, msg.message_id, ghRepo.owner, ghRepo.repo, env); return new Response('OK'); }

                return new Response('OK');
            }

            // Groups
            const vid = extractVideoId(text);
            if (vid) { await handleVideo(chatId, msg.message_id, vid, env); return new Response('OK'); }

            const igUrl = extractInstagramUrl(text);
            if (igUrl) { await handleInstagram(chatId, msg.message_id, igUrl, env); return new Response('OK'); }

            const ttUrl = extractTikTokUrl(text);
            if (ttUrl) { await handleTikTok(chatId, msg.message_id, ttUrl, env); return new Response('OK'); }

            const ghRepo = extractGitHubRepo(text);
            if (ghRepo) { await handleGitHub(chatId, msg.message_id, ghRepo.owner, ghRepo.repo, env); return new Response('OK'); }
            return new Response('OK');

        } catch (err) {
            console.error('Error:', err);
            return new Response('OK');
        }
    }
};
