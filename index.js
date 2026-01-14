// ============================================================
// ComfyGen - SillyTavern Image Generation Extension
// ============================================================

import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const MODULE_NAME = 'comfy_gen';
const extensionFolderPath = `scripts/extensions/third-party/ComfyGen`;

const defaultSettings = {
    enabled: true,
    baseUrl: '',
    apiKey: '',           // API Key (cg_xxx format)
    verified: false,      // Whether the API Key has been verified
    userName: '',         // Display name from API Key validation
    selectedServerId: null, // Selected ComfyUI server ID
    startMarker: 'image###',
    endMarker: '###',
    globalPositive: 'masterpiece,best quality,amazing quality,absurdres,',
    globalNegative: '',
    lastPresetId: null,
    autoRetry: true,
    maxRetries: 3,
    pollInterval: 1500,
    showPromptInResult: true,
    enableNsfwBlur: false,
    enableCache: true,    // 启用生成缓存
    enableFancyLoading: true, // 启用酷炫加载动画
    defaultVideoPrompt: 'animate this image', // 默认视频生成提示词
};

const CACHE_KEY = 'comfygen_image_cache';
const MAX_CACHE_ENTRIES = 500;
const MAX_POLL_ATTEMPTS = 200; // ~5 minutes at 1500ms interval

let presetsCache = [];
let serversCache = [];
const processedMessages = new Set();
const processedIframes = new WeakSet(); // 记录已处理的 iframe，防止重复

// ============ iframe 注入用的精简 CSS ============
const IFRAME_INJECT_STYLES = `
/* ComfyGen iframe 注入样式 */
.comfy-gen-box {
    --comfy-primary: #6366f1;
    --comfy-border: #444;
    --comfy-bg: rgba(0, 0, 0, 0.3);
    --comfy-text: #fff;
    --comfy-radius: 8px;
    --comfy-radius-sm: 4px;
    margin: 12px 0;
    padding: 14px;
    border: 1px solid var(--comfy-border);
    border-radius: var(--comfy-radius);
    background: var(--comfy-bg);
}
.comfy-gen-box:hover { border-color: var(--comfy-primary); }
.comfy-prompt-display {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 12px;
    padding: 10px 12px;
    background: linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.1));
    border-radius: var(--comfy-radius-sm);
    font-size: 13px;
    word-break: break-word;
}
.comfy-prompt-icon { flex-shrink: 0; font-size: 16px; }
.comfy-prompt-text { color: var(--comfy-text); }
.comfy-controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.comfy-preset-select {
    flex: 1;
    min-width: 120px;
    max-width: 200px;
    padding: 8px 12px;
    border: 1px solid var(--comfy-border);
    border-radius: var(--comfy-radius-sm);
    background: #222;
    color: var(--comfy-text);
    font-size: 13px;
}
.comfy-gen-btn {
    padding: 8px 16px;
    border: none;
    border-radius: var(--comfy-radius-sm);
    background: var(--comfy-primary);
    color: #fff;
    font-size: 13px;
    cursor: pointer;
}
.comfy-gen-btn:hover:not(:disabled) { background: #4f46e5; }
.comfy-gen-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.comfy-no-preset {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    padding: 12px;
    background: rgba(245,158,11,0.1);
    border: 1px solid rgba(245,158,11,0.3);
    border-radius: var(--comfy-radius-sm);
    color: #f59e0b;
    font-size: 13px;
}
.comfy-result { margin-top: 12px; }
.comfy-image-wrapper { position: relative; display: inline-block; margin: 5px; }
.comfy-nsfw-badge {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 10;
    padding: 4px 8px;
    background: rgba(239, 68, 68, 0.9);
    border-radius: var(--comfy-radius-sm);
    font-size: 11px;
    font-weight: 600;
    color: #fff;
}
.comfy-nsfw-blur { filter: blur(20px); transition: filter 0.2s; cursor: pointer; }
.comfy-result-img {
    max-width: 100%;
    max-height: 400px;
    border-radius: var(--comfy-radius);
    cursor: pointer;
}
.comfy-error {
    padding: 12px;
    background: rgba(239,68,68,0.1);
    border: 1px solid rgba(239,68,68,0.3);
    border-radius: var(--comfy-radius-sm);
    color: #ef4444;
    font-size: 13px;
}
.comfy-cached-badge { margin-left: auto; font-size: 14px; opacity: 0.7; }
.comfy-image-actions {
    position: absolute;
    bottom: 8px;
    right: 8px;
    display: flex;
    gap: 6px;
    opacity: 1 !important;
    visibility: visible !important;
}
.comfy-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: var(--comfy-radius-sm);
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    font-size: 16px;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
.comfy-action-btn:hover {
    background: rgba(99, 102, 241, 0.95);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}
.comfy-video-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: var(--comfy-radius-sm);
    background: rgba(139, 92, 246, 0.9);
    color: #fff;
    font-size: 16px;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
}
.comfy-video-btn:hover {
    background: rgba(139, 92, 246, 1);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.5);
}
.comfy-video-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.comfy-video-section {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid rgba(139, 92, 246, 0.2);
}
.comfy-video-label {
    color: rgba(255, 255, 255, 0.8);
    font-size: 13px;
    margin-bottom: 8px;
    padding: 0 4px;
    font-weight: 500;
}
.comfy-video-container {
    border-radius: var(--comfy-radius);
    overflow: hidden;
    background: rgba(0, 0, 0, 0.3);
}
.comfy-video-player {
    width: 100%;
    max-width: 100%;
    max-height: 450px;
    display: block;
    border-radius: var(--comfy-radius);
}
.comfy-video-overlay {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(135deg, rgba(10, 10, 18, 0.95), rgba(18, 18, 26, 0.95));
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    z-index: 10;
    backdrop-filter: blur(8px);
    border-radius: var(--comfy-radius);
    overflow: hidden;
}
.comfy-video-overlay::before {
    content: '';
    position: absolute;
    inset: -50%;
    background: radial-gradient(circle at center, rgba(139, 92, 246, 0.2) 0%, transparent 70%);
    animation: video-glow-pulse 3s ease-in-out infinite;
}
@keyframes video-glow-pulse {
    0%, 100% { opacity: 0.3; transform: scale(0.8); }
    50% { opacity: 0.6; transform: scale(1.2); }
}
.comfy-video-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    position: relative;
    z-index: 1;
}
.comfy-video-spinner {
    position: relative;
    width: 80px;
    height: 80px;
}
.comfy-video-spinner::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 3px solid transparent;
    border-top: 3px solid rgb(139, 92, 246);
    border-right: 3px solid rgba(139, 92, 246, 0.6);
    animation: video-ring-spin 1.2s linear infinite;
    box-shadow: 0 0 15px rgba(139, 92, 246, 0.5), inset 0 0 15px rgba(139, 92, 246, 0.3);
}
.comfy-video-spinner::after {
    content: '📹';
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    animation: video-icon-pulse 2s ease-in-out infinite;
    filter: drop-shadow(0 0 10px rgba(139, 92, 246, 0.8));
}
@keyframes video-ring-spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
@keyframes video-icon-pulse {
    0%, 100% { opacity: 0.8; transform: scale(0.95); }
    50% { opacity: 1; transform: scale(1.05); }
}
.comfy-video-loading-text {
    color: #fff;
    font-size: 16px;
    font-weight: 600;
    font-family: 'Courier New', monospace;
    text-shadow: 0 0 10px rgba(139, 92, 246, 0.8), 0 0 20px rgba(139, 92, 246, 0.5), 0 0 30px rgba(139, 92, 246, 0.3);
    letter-spacing: 1px;
    animation: video-text-glow 1.5s ease-in-out infinite alternate;
}
@keyframes video-text-glow {
    from { text-shadow: 0 0 10px rgba(139, 92, 246, 0.8), 0 0 20px rgba(139, 92, 246, 0.5); }
    to { text-shadow: 0 0 15px rgba(139, 92, 246, 1), 0 0 30px rgba(139, 92, 246, 0.7), 0 0 45px rgba(139, 92, 246, 0.5); }
}
.comfy-video-progress-dots {
    display: flex;
    gap: 10px;
}
.comfy-video-progress-dots span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: rgb(139, 92, 246);
    box-shadow: 0 0 15px rgba(139, 92, 246, 0.6);
    animation: video-dot-bounce 1.4s ease-in-out infinite;
}
.comfy-video-progress-dots span:nth-child(1) { animation-delay: 0s; }
.comfy-video-progress-dots span:nth-child(2) { animation-delay: 0.2s; }
.comfy-video-progress-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes video-dot-bounce {
    0%, 100% { transform: scale(0.8); opacity: 0.5; }
    50% { transform: scale(1.2); opacity: 1; }
}
.comfy-loading-container { margin-top: 12px; display: none; }
.comfy-simple-loading {
    padding: 20px;
    text-align: center;
    color: #0ff;
    font-family: monospace;
    text-shadow: 0 0 10px #0ff;
}
.comfy-fancy-loading {
    position: relative;
    height: 180px;
    border-radius: var(--comfy-radius);
    overflow: hidden;
    background: linear-gradient(180deg, #0a0a12, #12121a, #0a0a12);
    border: 1px solid rgba(0,255,255,0.2);
}
.comfy-loading-content {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}
.comfy-loading-rings {
    position: relative;
    width: 70px;
    height: 70px;
    margin-bottom: 16px;
}
.comfy-ring-outer {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid #0ff;
    animation: neon-spin 2s linear infinite;
    box-shadow: 0 0 15px rgba(0,255,255,0.5);
}
.comfy-ring-center {
    position: absolute;
    inset: 20px;
    border-radius: 50%;
    background: rgba(0,255,255,0.1);
    display: flex;
    align-items: center;
    justify-content: center;
}
.comfy-loading-icon { font-size: 20px; }
.comfy-loading-status {
    font-size: 14px;
    color: #fff;
    text-shadow: 0 0 10px #0ff;
}
.comfy-loading-dots { display: flex; gap: 6px; margin-top: 8px; }
.comfy-loading-dots span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #0ff;
    animation: dot-pulse 0.8s ease-in-out infinite;
}
.comfy-loading-dots span:nth-child(2) { animation-delay: 0.2s; }
.comfy-loading-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes neon-spin { to { transform: rotate(360deg); } }
@keyframes dot-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
`;

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPattern() {
    const settings = getSettings();
    const s = settings.startMarker || defaultSettings.startMarker;
    const e = settings.endMarker || defaultSettings.endMarker;
    return new RegExp(escapeRegExp(s) + '(.*?)' + escapeRegExp(e), 'gs');
}

function getSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    for (const key of Object.keys(defaultSettings)) {
        if (extension_settings[MODULE_NAME][key] === undefined) {
            extension_settings[MODULE_NAME][key] = defaultSettings[key];
        }
    }
    return extension_settings[MODULE_NAME];
}

function composeFinalPrompt(prompt) {
    const settings = getSettings();
    const gp = (settings.globalPositive || '').trim();
    const p = (prompt || '').trim();
    if (gp && p) {
        const normalizedGp = gp.endsWith(',') ? gp : gp + ',';
        return `${normalizedGp} ${p}`;
    }
    return gp || p;
}

function generateUniqueId(messageId) {
    return `comfy-${messageId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * 转义 JS 字符串（用于 data 属性中存储 URL 等）
 * 避免特殊字符破坏字符串
 */
function escapeForDataAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * 安全调用 toastr（兼容 iframe 环境）
 * @param {string} type - 'success' | 'error' | 'warning' | 'info'
 * @param {string} message - 消息内容
 * @param {Window} [win] - 当前窗口对象
 */
function safeToastr(type, message, win = window) {
    // 尝试当前窗口
    if (typeof win.toastr !== 'undefined' && win.toastr[type]) {
        win.toastr[type](message);
        return;
    }
    // 尝试父窗口
    try {
        if (win.parent && win.parent !== win && typeof win.parent.toastr !== 'undefined') {
            win.parent.toastr[type](message);
            return;
        }
    } catch (e) {
        // 跨域无法访问父窗口
    }
    // 最后 fallback 到 console
    console.log(`[ComfyGen] ${type}: ${message}`);
}

function truncateText(text, maxLength = 50) {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ Image Cache ============

function hashPrompt(prompt) {
    // 简单哈希：长度 + 前20字符 + 后20字符 + 特征码
    const str = (prompt || '').trim();
    if (!str) return 'empty';

    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }

    const prefix = str.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '');
    const suffix = str.slice(-10).replace(/[^a-zA-Z0-9]/g, '');
    return `${str.length}_${prefix}_${suffix}_${Math.abs(hash).toString(36)}`;
}

function getAllCache() {
    try {
        const data = localStorage.getItem(CACHE_KEY);
        return data ? JSON.parse(data) : {};
    } catch (e) {
        console.error('[ComfyGen] 读取缓存失败:', e);
        return {};
    }
}

function saveAllCache(cache) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.error('[ComfyGen] 保存缓存失败:', e);
        // 如果存储满了，清理旧数据
        if (e.name === 'QuotaExceededError') {
            pruneCache(cache, Math.floor(MAX_CACHE_ENTRIES / 2));
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
            } catch {
                // 实在存不下就放弃
            }
        }
    }
}

function pruneCache(cache, keepCount) {
    // 按时间排序，保留最新的 keepCount 条
    const entries = Object.entries(cache);
    if (entries.length <= keepCount) return;

    entries.sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
    const toKeep = entries.slice(0, keepCount);

    // 清空并重建
    for (const key of Object.keys(cache)) {
        delete cache[key];
    }
    for (const [key, value] of toKeep) {
        cache[key] = value;
    }
}

function getImageCache(finalPrompt) {
    const settings = getSettings();
    if (!settings.enableCache) return null;

    const hash = hashPrompt(finalPrompt);
    const cache = getAllCache();
    return cache[hash] || null;
}

function setImageCache(finalPrompt, originalPrompt, images, presetId) {
    const settings = getSettings();
    if (!settings.enableCache) return;

    const hash = hashPrompt(finalPrompt);
    const cache = getAllCache();

    // 检查条目数量，超出则清理
    if (Object.keys(cache).length >= MAX_CACHE_ENTRIES) {
        pruneCache(cache, MAX_CACHE_ENTRIES - 50);
    }

    cache[hash] = {
        images: images,
        prompt: originalPrompt,
        finalPrompt: finalPrompt,
        presetId: presetId,
        createdAt: Date.now()
    };

    saveAllCache(cache);
    console.log(`[ComfyGen] 已缓存图片: ${hash}`);
}

function clearImageCache() {
    try {
        localStorage.removeItem(CACHE_KEY);
        console.log('[ComfyGen] 缓存已清除');
        return true;
    } catch (e) {
        console.error('[ComfyGen] 清除缓存失败:', e);
        return false;
    }
}

function getCacheStats() {
    const cache = getAllCache();
    const entries = Object.keys(cache).length;
    let totalSize = 0;
    try {
        totalSize = new Blob([JSON.stringify(cache)]).size;
    } catch {
        totalSize = 0;
    }
    return {
        entries,
        sizeKB: Math.round(totalSize / 1024 * 10) / 10
    };
}

// ============ API ============

async function apiRequest(endpoint, options = {}) {
    const settings = getSettings();

    if (!settings.baseUrl) {
        throw new Error('请先配置服务器地址');
    }

    const url = `${settings.baseUrl}${endpoint}`;

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    // Use API Key for authentication
    if (settings.apiKey) {
        headers['Authorization'] = `Bearer ${settings.apiKey}`;
    }

    try {
        const res = await fetch(url, { ...options, headers });

        if (!res.ok) {
            if (res.status === 401) {
                settings.verified = false;
                saveSettingsDebounced();
                updateLoginStatus();
                throw new Error('API Key 无效或已过期');
            }
            if (res.status === 403) {
                throw new Error('API Key 权限不足');
            }
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        return res.json();
    } catch (err) {
        if (err.name === 'TypeError' && err.message.includes('fetch')) {
            throw new Error('网络错误，请检查服务器地址');
        }
        throw err;
    }
}

async function validateApiKey() {
    const settings = getSettings();
    if (!settings.apiKey) return false;

    // Check API Key format
    if (!settings.apiKey.startsWith('cg_')) {
        return false;
    }

    try {
        const data = await apiRequest('/api/v1/auth/validate-key');
        if (data.code === 0 && data.data) {
            settings.verified = true;
            settings.userName = data.data.username || '';
            saveSettingsDebounced();
            return true;
        }
        return false;
    } catch {
        settings.verified = false;
        saveSettingsDebounced();
        return false;
    }
}

async function checkServerHealth(serverId) {
    try {
        const data = await apiRequest(`/api/v1/servers/${serverId}/health`);
        if (data.code === 0) {
            return data.data?.healthy === true;
        }
    } catch (err) {
        console.warn(`[ComfyGen] 检查服务器 ${serverId} 健康状态失败:`, err);
    }
    return false;
}

async function fetchServers() {
    try {
        const data = await apiRequest('/api/v1/servers');
        if (data.code === 0) {
            const servers = data.data || [];
            console.log(`[ComfyGen] 已加载 ${servers.length} 个服务器，正在检查健康状态...`);

            // Check health for each server in parallel
            const healthChecks = await Promise.all(
                servers.map(async (server) => {
                    const isOnline = await checkServerHealth(server.id);
                    return { ...server, isOnline };
                })
            );

            serversCache = healthChecks;
            const onlineCount = serversCache.filter(s => s.isOnline).length;
            console.log(`[ComfyGen] 服务器健康检查完成: ${onlineCount}/${servers.length} 在线`);
            return serversCache;
        }
    } catch (err) {
        console.error('[ComfyGen] 获取服务器列表失败:', err);
    }
    return [];
}

async function fetchPresets() {
    try {
        const data = await apiRequest('/api/v1/presets');
        if (data.code === 0) {
            presetsCache = data.data || [];
            console.log(`[ComfyGen] 已加载 ${presetsCache.length} 个预设`);
            return presetsCache;
        }
    } catch (err) {
        console.error('[ComfyGen] 获取预设失败:', err);
    }
    return [];
}

async function generateWithPreset(presetId, prompt, negativePrompt = '') {
    const settings = getSettings();
    const finalNegative = negativePrompt || settings.globalNegative || '';

    const body = {
        presetId,
        prompt: composeFinalPrompt(prompt),
        negativePrompt: finalNegative,
        seed: -1,
        batchSize: 1
    };

    // Add serverId if selected
    if (settings.selectedServerId) {
        body.serverId = settings.selectedServerId;
    }

    return apiRequest('/api/v1/generate/preset', {
        method: 'POST',
        body: JSON.stringify(body)
    });
}

async function pollStatus(promptId, serverUrl) {
    const params = new URLSearchParams({ promptId, serverUrl });
    return apiRequest(`/api/v1/generate/poll?${params}`);
}

// ============ Video API ============

async function generateVideo(imageID, prompt) {
    return apiRequest('/api/v1/video/generate', {
        method: 'POST',
        body: JSON.stringify({
            sourceImageID: imageID,
            prompt: prompt
        })
    });
}

async function getVideoStatus(videoID) {
    return apiRequest(`/api/v1/video/status/${videoID}`);
}

async function deleteVideo(videoID) {
    return apiRequest(`/api/v1/video/${videoID}`, {
        method: 'DELETE'
    });
}

// ============ UI Components ============

/**
 * 检测提示词是否包含 NSFW 内容
 */
function isNsfwPrompt(prompt) {
    if (!prompt) return false;
    return prompt.toLowerCase().includes('nsfw');
}

function buildCachedImagesHtml(images, settings, prompt) {
    // 检测是否 NSFW：提示词包含 nsfw 或者全局设置开启
    const isNsfw = isNsfwPrompt(prompt) || settings.enableNsfwBlur;

    return (images || []).map(img => {
        let url = img.ossUrl || img.url || '';
        if (!url) return '';

        // 如果 URL 是相对路径，拼接 baseUrl
        if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
            const baseUrl = settings.baseUrl || '';
            if (baseUrl.endsWith('/') && url.startsWith('/')) {
                url = baseUrl + url.slice(1);
            } else if (!baseUrl.endsWith('/') && !url.startsWith('/')) {
                url = baseUrl + '/' + url;
            } else {
                url = baseUrl + url;
            }
        }

        const blurClass = isNsfw ? 'comfy-nsfw-blur' : '';
        const nsfwBadge = isNsfw ? '<div class="comfy-nsfw-badge">🔞 NSFW</div>' : '';
        // 使用 data 属性存储 URL，通过事件委托处理点击
        return `
            <div class="comfy-image-wrapper">
                ${nsfwBadge}
                <img src="${escapeHtml(url)}"
                     class="comfy-result-img comfy-clickable-img ${blurClass}"
                     alt="生成的图片"
                     loading="lazy"
                     data-url="${escapeForDataAttr(url)}"
                     data-nsfw="${isNsfw ? '1' : ''}" />
                <div class="comfy-image-actions">
                    <button class="comfy-action-btn comfy-copy-btn" data-url="${escapeForDataAttr(url)}" title="复制链接">
                        📋
                    </button>
                    <a href="${escapeHtml(url)}" download class="comfy-action-btn" title="下载图片">
                        ⬇️
                    </a>
                </div>
            </div>
        `;
    }).filter(Boolean).join('');
}

function createGenComponent(prompt, messageId) {
    const escapedPrompt = escapeHtml(prompt);
    const displayPrompt = truncateText(prompt, 60);
    const uniqueId = generateUniqueId(messageId);
    const settings = getSettings();

    // Check if server is selected
    if (!settings.selectedServerId) {
        return `
            <div class="comfy-gen-box" data-prompt="${escapedPrompt}" data-id="${uniqueId}">
                <div class="comfy-prompt-display" title="${escapedPrompt}">
                    <span class="comfy-prompt-icon">🎨</span>
                    <span class="comfy-prompt-text">${escapeHtml(displayPrompt)}</span>
                </div>
                <div class="comfy-no-preset">
                    <div class="comfy-warning-icon">⚠️</div>
                    <div class="comfy-warning-text">
                        <span>请先选择 ComfyUI 服务器</span>
                    </div>
                </div>
                <button class="comfy-gen-btn menu_button" disabled>生成图片</button>
                <div class="comfy-result"></div>
            </div>
        `;
    }

    if (presetsCache.length === 0) {
        return `
            <div class="comfy-gen-box" data-prompt="${escapedPrompt}" data-id="${uniqueId}">
                <div class="comfy-prompt-display" title="${escapedPrompt}">
                    <span class="comfy-prompt-icon">🎨</span>
                    <span class="comfy-prompt-text">${escapeHtml(displayPrompt)}</span>
                </div>
                <div class="comfy-no-preset">
                    <div class="comfy-warning-icon">⚠️</div>
                    <div class="comfy-warning-text">
                        <span>暂无可用预设</span>
                        <a href="${settings.baseUrl}" target="_blank" rel="noopener" class="comfy-link">前往创建预设 →</a>
                    </div>
                </div>
                <button class="comfy-gen-btn menu_button" disabled>生成图片</button>
                <div class="comfy-result"></div>
            </div>
        `;
    }

    // 检查缓存
    const finalPrompt = composeFinalPrompt(prompt);
    const cachedData = getImageCache(finalPrompt);

    if (cachedData && cachedData.images && cachedData.images.length > 0) {
        // 有缓存，直接显示图片
        const cachedImagesHtml = buildCachedImagesHtml(cachedData.images, settings, prompt);
        let promptHtml = '';
        if (settings.showPromptInResult && prompt) {
            promptHtml = `<div class="comfy-result-prompt">📝 ${escapeHtml(truncateText(prompt, 100))}</div>`;
        }

        const lastPresetId = cachedData.presetId || settings.lastPresetId;
        const presetOptions = presetsCache.map(p => {
            const selected = p.id === lastPresetId ? 'selected' : '';
            return `<option value="${p.id}" ${selected}>${escapeHtml(p.name)}</option>`;
        }).join('');

        return `
            <div class="comfy-gen-box" data-prompt="${escapedPrompt}" data-id="${uniqueId}" data-cached="true">
                <div class="comfy-prompt-display" title="${escapedPrompt}">
                    <span class="comfy-prompt-icon">🎨</span>
                    <span class="comfy-prompt-text">${escapeHtml(displayPrompt)}</span>
                    <span class="comfy-cached-badge" title="已缓存">📦</span>
                </div>
                <div class="comfy-controls">
                    <select class="comfy-preset-select" title="选择预设">
                        ${presetOptions}
                    </select>
                    <button class="comfy-gen-btn menu_button">重新生成</button>
                </div>
                <div class="comfy-result">${promptHtml}${cachedImagesHtml}</div>
            </div>
        `;
    }

    // 无缓存，显示生成组件
    const lastPresetId = settings.lastPresetId;
    const presetOptions = presetsCache.map(p => {
        const selected = p.id === lastPresetId ? 'selected' : '';
        return `<option value="${p.id}" ${selected}>${escapeHtml(p.name)}</option>`;
    }).join('');

    return `
        <div class="comfy-gen-box" data-prompt="${escapedPrompt}" data-id="${uniqueId}">
            <div class="comfy-prompt-display" title="${escapedPrompt}">
                <span class="comfy-prompt-icon">🎨</span>
                <span class="comfy-prompt-text">${escapeHtml(displayPrompt)}</span>
            </div>
            <div class="comfy-controls">
                <select class="comfy-preset-select" title="选择预设">
                    ${presetOptions}
                </select>
                <button class="comfy-gen-btn menu_button">生成图片</button>
            </div>
            <div class="comfy-result"></div>
        </div>
    `;
}

function showLoading(box, statusText = '准备中...') {
    const settings = getSettings();
    let loadingContainer = box.querySelector('.comfy-loading-container');

    // 如果不存在，创建它
    if (!loadingContainer) {
        loadingContainer = document.createElement('div');
        loadingContainer.className = 'comfy-loading-container';
        const resultDiv = box.querySelector('.comfy-result');
        if (resultDiv) {
            box.insertBefore(loadingContainer, resultDiv);
        } else {
            box.appendChild(loadingContainer);
        }
    }

    if (settings.enableFancyLoading) {
        // 霓虹酒馆风格动画
        loadingContainer.innerHTML = `
            <div class="comfy-fancy-loading">
                <div class="comfy-loading-bg">
                    <div class="comfy-loading-gradient"></div>
                    <div class="comfy-particles">
                        ${[...Array(8)].map((_, i) => `<div class="comfy-particle" style="--i:${i}"></div>`).join('')}
                    </div>
                </div>
                <div class="comfy-loading-content">
                    <div class="comfy-loading-rings">
                        <div class="comfy-ring-outer"></div>
                        <div class="comfy-ring-middle"></div>
                        <div class="comfy-ring-inner"></div>
                        <div class="comfy-ring-center">
                            <span class="comfy-loading-icon">🍺</span>
                        </div>
                    </div>
                    <div class="comfy-loading-text">
                        <span class="comfy-loading-status">${escapeHtml(statusText)}</span>
                    </div>
                    <div class="comfy-loading-dots">
                        <span></span><span></span><span></span>
                    </div>
                </div>
            </div>
        `;
    } else {
        // 简单模式
        loadingContainer.innerHTML = `
            <div class="comfy-simple-loading">
                <span class="comfy-simple-loading-text">${escapeHtml(statusText)}</span>
            </div>
        `;
    }

    loadingContainer.style.display = 'block';
}

function updateLoadingStatus(box, statusText) {
    const settings = getSettings();
    const loadingContainer = box.querySelector('.comfy-loading-container');
    if (!loadingContainer) return;

    if (settings.enableFancyLoading) {
        const statusEl = loadingContainer.querySelector('.comfy-loading-status');
        if (statusEl) {
            statusEl.textContent = statusText;
        }
    } else {
        const textEl = loadingContainer.querySelector('.comfy-simple-loading-text');
        if (textEl) {
            textEl.textContent = statusText;
        }
    }
}

function hideLoading(box) {
    const loadingContainer = box.querySelector('.comfy-loading-container');
    if (loadingContainer) {
        loadingContainer.style.display = 'none';
    }
}

// 兼容旧代码
function updateProgress(box, progress, statusText = '') {
    showLoading(box, statusText || '生成中...');
}

function hideProgress(box) {
    hideLoading(box);
}

function displayImages(resultDiv, images, prompt) {
    const settings = getSettings();

    // 检测是否 NSFW：提示词包含 nsfw 或者全局设置开启
    const isNsfw = isNsfwPrompt(prompt) || settings.enableNsfwBlur;

    const imagesHtml = (images || []).map(img => {
        let url = img.ossUrl || img.url || '';
        if (!url) return '';

        // 如果 URL 是相对路径，拼接 baseUrl
        if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
            const baseUrl = settings.baseUrl || '';
            // 确保不会出现双斜杠
            if (baseUrl.endsWith('/') && url.startsWith('/')) {
                url = baseUrl + url.slice(1);
            } else if (!baseUrl.endsWith('/') && !url.startsWith('/')) {
                url = baseUrl + '/' + url;
            } else {
                url = baseUrl + url;
            }
        }

        const blurClass = isNsfw ? 'comfy-nsfw-blur' : '';
        const nsfwBadge = isNsfw ? '<div class="comfy-nsfw-badge">🔞 NSFW</div>' : '';

        // 视频按钮（仅当有 historyId 时显示）
        const hasHistoryId = img.historyId && img.historyId > 0;
        const videoBtn = hasHistoryId ? `
            <button class="comfy-video-btn comfy-gen-video-btn"
                    title="${img.videoId ? '重新生成视频' : '生成视频'}">
                📹
            </button>
        ` : '';

        // 处理视频 URL（拼接 baseUrl）
        let videoURL = img.videoURL || '';
        if (videoURL && !videoURL.startsWith('http://') && !videoURL.startsWith('https://')) {
            const baseUrl = settings.baseUrl || '';
            if (baseUrl.endsWith('/') && videoURL.startsWith('/')) {
                videoURL = baseUrl + videoURL.slice(1);
            } else if (!baseUrl.endsWith('/') && !videoURL.startsWith('/')) {
                videoURL = baseUrl + '/' + videoURL;
            } else {
                videoURL = baseUrl + videoURL;
            }
        }

        // 已有视频则显示播放器
        const videoPlayer = (videoURL && img.videoStatus === 'completed') ? `
            <div class="comfy-video-section">
                <div class="comfy-video-label">📹 视频</div>
                <div class="comfy-video-container">
                    <video class="comfy-video-player" controls>
                        <source src="${escapeHtml(videoURL)}" type="video/mp4">
                        您的浏览器不支持视频播放
                    </video>
                </div>
            </div>
        ` : '';

        // 使用 data 属性存储图片和视频信息
        return `
            <div class="comfy-image-wrapper"
                 data-history-id="${img.historyId || ''}"
                 data-video-id="${img.videoId || ''}"
                 data-video-status="${img.videoStatus || ''}"
                 data-video-url="${escapeForDataAttr(img.videoURL || '')}">
                ${nsfwBadge}
                <img src="${escapeHtml(url)}"
                     class="comfy-result-img comfy-clickable-img ${blurClass}"
                     alt="生成的图片"
                     loading="lazy"
                     data-url="${escapeForDataAttr(url)}"
                     data-nsfw="${isNsfw ? '1' : ''}" />
                <div class="comfy-image-actions">
                    ${videoBtn}
                    <button class="comfy-action-btn comfy-copy-btn" data-url="${escapeForDataAttr(url)}" title="复制链接">
                        📋
                    </button>
                    <a href="${escapeHtml(url)}" download class="comfy-action-btn" title="下载图片">
                        ⬇️
                    </a>
                </div>
                ${videoPlayer}
            </div>
        `;
    }).filter(Boolean).join('');

    let promptHtml = '';
    if (settings.showPromptInResult && prompt) {
        promptHtml = `<div class="comfy-result-prompt">📝 ${escapeHtml(truncateText(prompt, 100))}</div>`;
    }

    resultDiv.innerHTML = promptHtml + imagesHtml;
}

function displayError(resultDiv, message) {
    resultDiv.innerHTML = `
        <div class="comfy-error">
            <span class="comfy-error-icon">❌</span>
            <span class="comfy-error-text">${escapeHtml(message)}</span>
        </div>
    `;
}

// ============ Video Generation Handler ============

// 自定义视频提示词输入弹窗
function showVideoPromptDialog(defaultPrompt) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.8); z-index: 9999;
            display: flex; align-items: center; justify-content: center;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: #1a1a1a; border-radius: 12px; padding: 20px;
            max-width: 500px; width: calc(100% - 40px);
            box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        `;

        dialog.innerHTML = `
            <h3 style="margin: 0 0 12px 0; color: #fff; font-size: 16px; font-weight: 600;">📹 生成视频</h3>
            <div style="background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3);
                        border-radius: 6px; padding: 8px 10px; margin-bottom: 10px;">
                <div style="color: rgba(99,102,241,1); font-size: 12px;">
                    ℹ️ 使用 <strong>Grok</strong> 生成视频
                </div>
            </div>
            <div style="background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3);
                        border-radius: 6px; padding: 8px 10px; margin-bottom: 14px;">
                <div style="color: #ef4444; font-size: 12px; line-height: 1.5;">
                    ⚠️ NSFW 内容大概率生成失败
                </div>
            </div>
            <label style="display: block; color: rgba(255,255,255,0.9); margin-bottom: 8px; font-size: 13px; font-weight: 500;">
                提示词：
            </label>
            <input type="text" id="comfy-video-prompt-input"
                   style="width: 100%; padding: 12px; background: #2a2a2a; border: 1px solid #555;
                          border-radius: 6px; color: #fff; font-size: 15px; box-sizing: border-box;
                          outline: none;"
                   placeholder="留空使用默认提示词"
                   value="${escapeHtml(defaultPrompt)}">
            <div style="display: flex; gap: 10px; margin-top: 18px;">
                <button id="comfy-video-cancel-btn"
                        style="flex: 1; padding: 11px; background: #444; border: none; border-radius: 6px;
                               color: #fff; cursor: pointer; font-size: 14px;">
                    取消
                </button>
                <button id="comfy-video-confirm-btn"
                        style="flex: 1; padding: 11px; background: rgb(139,92,246); border: none; border-radius: 6px;
                               color: #fff; cursor: pointer; font-size: 14px; font-weight: 600;">
                    确定生成
                </button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const input = dialog.querySelector('#comfy-video-prompt-input');
        const confirmBtn = dialog.querySelector('#comfy-video-confirm-btn');
        const cancelBtn = dialog.querySelector('#comfy-video-cancel-btn');

        input.focus();
        input.select();

        const close = (value) => {
            overlay.remove();
            resolve(value);
        };

        confirmBtn.onclick = () => close(input.value);
        cancelBtn.onclick = () => close(null);
        overlay.onclick = (e) => { if (e.target === overlay) close(null); };
        input.onkeydown = (e) => {
            if (e.key === 'Enter') close(input.value);
            if (e.key === 'Escape') close(null);
        };
    });
}

async function handleVideoGenClick(event) {
    const btn = event.target;
    if (btn.disabled) return;

    const wrapper = btn.closest('.comfy-image-wrapper');
    if (!wrapper) return;

    const imageData = wrapper.dataset;
    const historyId = parseInt(imageData.historyId, 10);
    if (!historyId) {
        toastr.error('无法获取图片ID');
        return;
    }

    const settings = getSettings();
    const defaultPrompt = settings.defaultVideoPrompt || 'animate this image';

    // 弹出自定义提示词输入框
    const prompt = await showVideoPromptDialog(defaultPrompt);
    if (prompt === null) return; // 用户取消

    const finalPrompt = prompt.trim() || defaultPrompt;

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = '⏳';

    try {
        // 如果已有视频，先删除
        const existingVideoId = imageData.videoId;
        if (existingVideoId) {
            await deleteVideo(parseInt(existingVideoId, 10));
        }

        // 生成新视频
        const genRes = await generateVideo(historyId, finalPrompt);
        if (genRes.code !== 0) {
            throw new Error(genRes.message || '创建视频任务失败');
        }

        const { videoID } = genRes.data;
        wrapper.dataset.videoId = videoID;

        // 显示加载遮罩
        showVideoLoading(wrapper);

        // 轮询状态
        const pollInterval = 2000;
        const maxAttempts = 150; // 5分钟
        let attempts = 0;

        while (attempts < maxAttempts) {
            attempts++;
            await delay(pollInterval);

            const statusRes = await getVideoStatus(videoID);
            if (statusRes.code !== 0) continue;

            let { status, videoURL, errorMessage } = statusRes.data;

            if (status === 'completed') {
                // 处理视频 URL（拼接 baseUrl）
                if (videoURL && !videoURL.startsWith('http://') && !videoURL.startsWith('https://')) {
                    const settings = getSettings();
                    const baseUrl = settings.baseUrl || '';
                    if (baseUrl.endsWith('/') && videoURL.startsWith('/')) {
                        videoURL = baseUrl + videoURL.slice(1);
                    } else if (!baseUrl.endsWith('/') && !videoURL.startsWith('/')) {
                        videoURL = baseUrl + '/' + videoURL;
                    } else {
                        videoURL = baseUrl + videoURL;
                    }
                }

                hideVideoLoading(wrapper);
                showVideoPlayer(wrapper, videoURL);
                wrapper.dataset.videoStatus = 'completed';
                wrapper.dataset.videoUrl = videoURL;
                btn.textContent = '🔄';
                toastr.success('视频生成成功！');
                break;
            } else if (status === 'failed') {
                throw new Error(errorMessage || '视频生成失败');
            }
        }

        if (attempts >= maxAttempts) {
            throw new Error('视频生成超时');
        }

    } catch (err) {
        hideVideoLoading(wrapper);
        toastr.error(err.message || '视频生成失败');
        btn.textContent = originalText;
        showVideoError(wrapper, err.message);
    }

    btn.disabled = false;
}

function showVideoLoading(wrapper) {
    let overlay = wrapper.querySelector('.comfy-video-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'comfy-video-overlay';
        overlay.innerHTML = `
            <div class="comfy-video-loading">
                <div class="comfy-video-spinner"></div>
                <div class="comfy-video-loading-text">📹 视频生成中...</div>
                <div class="comfy-video-progress-dots">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
        wrapper.appendChild(overlay);
    }
    overlay.style.display = 'flex';
}

function hideVideoLoading(wrapper) {
    const overlay = wrapper.querySelector('.comfy-video-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

function showVideoPlayer(wrapper, videoURL) {
    let section = wrapper.querySelector('.comfy-video-section');
    if (!section) {
        section = document.createElement('div');
        section.className = 'comfy-video-section';
        section.innerHTML = '<div class="comfy-video-label">📹 视频</div><div class="comfy-video-container"></div>';
        wrapper.appendChild(section);
    }

    const container = section.querySelector('.comfy-video-container');
    container.innerHTML = `
        <video class="comfy-video-player" controls>
            <source src="${escapeHtml(videoURL)}" type="video/mp4">
            您的浏览器不支持视频播放
        </video>
    `;
}

function showVideoError(wrapper, errorMsg) {
    let section = wrapper.querySelector('.comfy-video-section');
    if (!section) {
        section = document.createElement('div');
        section.className = 'comfy-video-section';
        section.innerHTML = '<div class="comfy-video-label">📹 视频</div><div class="comfy-video-container"></div>';
        wrapper.appendChild(section);
    }

    const container = section.querySelector('.comfy-video-container');
    container.innerHTML = `<div class="comfy-error">${escapeHtml(errorMsg)}</div>`;
}

// ============ Generation Handler ============

async function handleGenClick(event) {
    const btn = event.target;
    if (btn.disabled) return;

    const box = btn.closest('.comfy-gen-box');
    if (!box) return;

    const settings = getSettings();

    // Check server selected
    if (!settings.selectedServerId) {
        toastr.warning('请先在扩展设置中选择 ComfyUI 服务器');
        return;
    }

    const prompt = box.dataset.prompt;
    const select = box.querySelector('.comfy-preset-select');
    const presetId = select ? parseInt(select.value, 10) : null;
    const resultDiv = box.querySelector('.comfy-result');

    if (!presetId) {
        toastr.warning('请先选择预设');
        return;
    }

    settings.lastPresetId = presetId;
    saveSettingsDebounced();

    btn.disabled = true;
    if (select) select.disabled = true;

    const originalText = btn.textContent;
    btn.textContent = '提交中...';
    resultDiv.innerHTML = '';
    updateProgress(box, 0, '准备中...');

    const maxRetries = settings.autoRetry ? settings.maxRetries : 1;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const genRes = await generateWithPreset(presetId, prompt);
            if (genRes.code !== 0) {
                throw new Error(genRes.message || '提交任务失败');
            }

            const { promptId, serverUrl } = genRes.data;

            if (!promptId || !serverUrl) {
                throw new Error('服务器返回数据不完整');
            }

            let lastProgress = 0;
            const pollInterval = settings.pollInterval || 1500;

            let pollAttempts = 0;
            while (pollAttempts < MAX_POLL_ATTEMPTS) {
                pollAttempts++;
                await delay(pollInterval);

                const statusRes = await pollStatus(promptId, serverUrl);
                if (statusRes.code !== 0) {
                    console.warn('[ComfyGen] 轮询错误:', statusRes.message);
                    continue;
                }

                const { status, progress = 0, images, error } = statusRes.data;

                if (progress !== lastProgress) {
                    lastProgress = progress;
                    const statusText = status === 'processing' ? '生成中...' : '生成中...';
                    updateProgress(box, progress, statusText);
                    btn.textContent = statusText;
                }

                if (status === 'completed') {
                    hideProgress(box);
                    displayImages(resultDiv, images, prompt);
                    btn.textContent = '重新生成';
                    toastr.success('图片生成成功！');

                    // 写入缓存
                    const finalPrompt = composeFinalPrompt(prompt);
                    setImageCache(finalPrompt, prompt, images, presetId);

                    lastError = null;
                    break;
                } else if (status === 'failed') {
                    throw new Error(error || '生成失败');
                }
            }

            // Check if we exceeded max attempts
            if (pollAttempts >= MAX_POLL_ATTEMPTS) {
                throw new Error('生成超时，请重试（已等待约5分钟）');
            }

            if (!lastError) break;

        } catch (err) {
            lastError = err;
            console.error(`[ComfyGen] 生成失败 (尝试 ${attempt}/${maxRetries}):`, err);

            if (attempt < maxRetries) {
                updateProgress(box, 0, `重试中 (${attempt + 1}/${maxRetries})...`);
                btn.textContent = '重试中...';
                await delay(2000);
            }
        }
    }

    if (lastError) {
        hideProgress(box);
        toastr.error(lastError.message || '生成失败');
        btn.textContent = originalText;
        displayError(resultDiv, lastError.message || '生成失败');
    }

    btn.disabled = false;
    if (select) select.disabled = false;
}

// ============ iframe 穿透处理 ============

/**
 * 注入样式到 iframe
 */
function injectStylesToIframe(iframeDoc) {
    if (iframeDoc.getElementById('comfygen-injected-styles')) return;

    const style = iframeDoc.createElement('style');
    style.id = 'comfygen-injected-styles';
    style.textContent = IFRAME_INJECT_STYLES;

    if (iframeDoc.head) {
        iframeDoc.head.appendChild(style);
    } else if (iframeDoc.body) {
        iframeDoc.body.insertBefore(style, iframeDoc.body.firstChild);
    }
}

/**
 * 处理 iframe 内的内容（细粒度 DOM 替换，保留已有脚本/事件）
 */
function processIframeContent(iframe, messageId) {
    if (processedIframes.has(iframe)) return;

    let iframeDoc;
    let iframeWin;
    try {
        iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        iframeWin = iframe.contentWindow;
        if (!iframeDoc || !iframeDoc.body) return;
    } catch (e) {
        // 跨域 iframe 无法访问
        console.warn('[ComfyGen] 无法访问 iframe（可能是跨域）:', e.message);
        processedIframes.add(iframe);
        return;
    }

    const pattern = buildPattern();
    const bodyHtml = iframeDoc.body.innerHTML;

    if (!pattern.test(bodyHtml)) {
        // 没有匹配的标记，但仍然标记为已处理
        processedIframes.add(iframe);
        return;
    }
    pattern.lastIndex = 0;

    // 注入样式
    injectStylesToIframe(iframeDoc);

    // 使用 TreeWalker 查找包含标记的文本节点，进行细粒度替换
    const walker = iframeDoc.createTreeWalker(
        iframeDoc.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    const nodesToReplace = [];
    let textNode;

    // 先收集所有需要替换的节点（避免遍历时修改 DOM）
    while ((textNode = walker.nextNode())) {
        if (pattern.test(textNode.nodeValue)) {
            pattern.lastIndex = 0;
            nodesToReplace.push(textNode);
        }
    }

    if (nodesToReplace.length === 0) {
        // 标记可能在 HTML 属性或元素内，使用父元素级别替换
        // 查找包含标记的元素，仅替换其内部 HTML
        const elementsWithMarker = [];
        const allElements = iframeDoc.body.querySelectorAll('*');
        for (const el of allElements) {
            // 只检查直接子文本内容，不递归
            for (const child of el.childNodes) {
                if (child.nodeType === Node.TEXT_NODE && pattern.test(child.nodeValue)) {
                    pattern.lastIndex = 0;
                    if (!elementsWithMarker.includes(el)) {
                        elementsWithMarker.push(el);
                    }
                }
            }
        }

        for (const el of elementsWithMarker) {
            const originalHtml = el.innerHTML;
            const newHtml = originalHtml.replace(pattern, (match, promptRaw) => {
                const prompt = promptRaw.trim();
                if (!prompt) return match;
                return createGenComponent(prompt, messageId);
            });
            if (newHtml !== originalHtml) {
                el.innerHTML = newHtml;
            }
        }
    } else {
        // 替换文本节点
        for (const node of nodesToReplace) {
            const text = node.nodeValue;
            const parent = node.parentNode;
            if (!parent) continue;

            // 创建一个临时容器来解析替换后的 HTML
            const temp = iframeDoc.createElement('div');
            temp.innerHTML = text.replace(pattern, (match, promptRaw) => {
                const prompt = promptRaw.trim();
                if (!prompt) return match;
                return createGenComponent(prompt, messageId);
            });

            // 将临时容器的子节点插入到原位置
            const fragment = iframeDoc.createDocumentFragment();
            while (temp.firstChild) {
                fragment.appendChild(temp.firstChild);
            }
            parent.replaceChild(fragment, node);
        }
    }

    processedIframes.add(iframe);

    // 绑定按钮事件 - 通过主页面处理
    iframeDoc.querySelectorAll('.comfy-gen-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            handleGenClick(e);
        });
    });

    // 绑定图片点击事件（iframe 内需要单独绑定）
    iframeDoc.querySelectorAll('.comfy-clickable-img').forEach(img => {
        img.addEventListener('click', (e) => {
            const imgEl = e.currentTarget;
            const url = imgEl.dataset.url;
            const isNsfw = imgEl.dataset.nsfw === '1';

            if (isNsfw && imgEl.classList.contains('comfy-nsfw-blur')) {
                imgEl.classList.remove('comfy-nsfw-blur');
                const wrapper = imgEl.closest('.comfy-image-wrapper');
                const badge = wrapper?.querySelector('.comfy-nsfw-badge');
                if (badge) badge.remove();
            } else {
                if (url) window.open(url, '_blank');
            }
        });
    });

    // 绑定复制按钮事件（iframe 内需要单独绑定）
    iframeDoc.querySelectorAll('.comfy-copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const url = e.currentTarget.dataset.url;
            if (url) {
                navigator.clipboard.writeText(url).then(() => {
                    safeToastr('success', '链接已复制', iframeWin);
                }).catch(() => {
                    safeToastr('error', '复制失败', iframeWin);
                });
            }
        });
    });

    console.log(`[ComfyGen] 已处理 iframe 内容 (消息 #${messageId})`);
}

/**
 * 等待 iframe 加载完成
 */
function waitForIframeLoad(iframe, timeout = 5000) {
    return new Promise((resolve) => {
        // 检查是否已加载
        try {
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            if (doc && doc.readyState === 'complete' && doc.body?.innerHTML) {
                resolve(true);
                return;
            }
        } catch {
            // 跨域，无法访问
            resolve(false);
            return;
        }

        const onLoad = () => {
            clearTimeout(timer);
            // 给内容一点时间渲染
            setTimeout(() => resolve(true), 100);
        };

        iframe.addEventListener('load', onLoad, { once: true });

        // 超时保护
        const timer = setTimeout(() => {
            iframe.removeEventListener('load', onLoad);
            resolve(false);
        }, timeout);
    });
}

/**
 * 处理消息中的所有 iframe
 */
async function processIframesInMessage(mes, messageId) {
    const iframes = mes.querySelectorAll('iframe');
    if (iframes.length === 0) return;

    for (const iframe of iframes) {
        if (processedIframes.has(iframe)) continue;

        // 检查 iframe 是否已加载
        let isLoaded = false;
        try {
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            isLoaded = doc && doc.readyState === 'complete' && doc.body?.innerHTML;
        } catch {
            // 跨域
            processedIframes.add(iframe);
            continue;
        }

        if (isLoaded) {
            // 已加载，直接处理
            processIframeContent(iframe, messageId);
        } else {
            // 未加载，绑定 load 事件
            iframe.addEventListener('load', () => {
                setTimeout(() => {
                    processIframeContent(iframe, messageId);
                }, 100);
            }, { once: true });

            // 超时保护：5秒后如果还没处理就放弃
            setTimeout(() => {
                if (!processedIframes.has(iframe)) {
                    console.warn(`[ComfyGen] iframe 加载超时，跳过 (消息 #${messageId})`);
                    processedIframes.add(iframe);
                }
            }, 5000);
        }
    }
}

// ============ Message Processing ============

async function processMessage(messageId) {
    const settings = getSettings();
    if (!settings.enabled || !settings.apiKey || !settings.verified) return;

    const mesKey = `msg-${messageId}`;
    if (processedMessages.has(mesKey)) return;

    const mes = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
    if (!mes) return;

    const mesText = mes.querySelector('.mes_text');
    if (!mesText) return;

    if (mes.dataset.comfyProcessed === 'true') {
        processedMessages.add(mesKey);
        // 即使消息已处理，仍检查 iframe（可能后加载）
        await processIframesInMessage(mes, messageId);
        return;
    }

    const pattern = buildPattern();
    const html = mesText.innerHTML;

    // 处理主内容
    let hasMatch = pattern.test(html);
    pattern.lastIndex = 0;

    if (hasMatch) {
        const newHtml = html.replace(pattern, (match, promptRaw) => {
            const prompt = promptRaw.trim();
            if (!prompt) return match;
            return createGenComponent(prompt, messageId);
        });

        mesText.innerHTML = newHtml;

        mesText.querySelectorAll('.comfy-gen-btn').forEach(btn => {
            btn.addEventListener('click', handleGenClick);
        });
    }

    mes.dataset.comfyProcessed = 'true';
    processedMessages.add(mesKey);

    // 处理 iframe 内容
    await processIframesInMessage(mes, messageId);

    if (hasMatch) {
        console.log(`[ComfyGen] 已处理消息 #${messageId}`);
    }
}

async function processAllMessages() {
    const settings = getSettings();
    if (!settings.enabled || !settings.apiKey || !settings.verified) return;

    const messages = document.querySelectorAll('#chat .mes');
    for (const mes of messages) {
        const mesid = mes.getAttribute('mesid');
        if (mesid !== null) {
            await processMessage(parseInt(mesid, 10));
        }
    }
}

function resetProcessedState() {
    processedMessages.clear();
    // 注意：processedIframes 是 WeakSet，不需要手动清理
    // 当 iframe 元素被移除时，会自动被垃圾回收
}

// ============ Settings Panel ============

function loadSettingsUI() {
    const settings = getSettings();
    $("#comfy_enabled").prop("checked", settings.enabled);
    $("#comfy_base_url").val(settings.baseUrl);
    $("#comfy_api_key").val(settings.apiKey);
    $("#comfy_start_marker").val(settings.startMarker);
    $("#comfy_end_marker").val(settings.endMarker);
    $("#comfy_global_positive").val(settings.globalPositive);
    $("#comfy_global_negative").val(settings.globalNegative);
    $("#comfy_default_video_prompt").val(settings.defaultVideoPrompt);
    $("#comfy_auto_retry").prop("checked", settings.autoRetry);
    $("#comfy_show_prompt").prop("checked", settings.showPromptInResult);
    $("#comfy_nsfw_blur").prop("checked", settings.enableNsfwBlur);
    $("#comfy_fancy_loading").prop("checked", settings.enableFancyLoading);
    $("#comfy_enable_cache").prop("checked", settings.enableCache);

    // Update the "get API key" link
    updateGetKeyLink();
    updateLoginStatus();
    updateServerUI();
    updateCacheStats();
}

function updateCacheStats() {
    const stats = getCacheStats();
    const statsEl = $("#comfy_cache_stats");
    if (stats.entries > 0) {
        statsEl.text(`${stats.entries} 条记录, ${stats.sizeKB} KB`);
    } else {
        statsEl.text('暂无缓存');
    }
}

function updateGetKeyLink() {
    const settings = getSettings();
    const link = $("#comfy_get_key_link");
    if (settings.baseUrl) {
        link.attr("href", `${settings.baseUrl}/api-keys`);
    } else {
        link.attr("href", "#");
    }
}

function updateLoginStatus() {
    const settings = getSettings();
    const statusEl = $("#comfy_login_status");
    const presetCountEl = $("#comfy_preset_count");

    if (settings.apiKey && settings.verified) {
        const displayName = settings.userName || 'API Key';
        statusEl.html(`<span class="comfy-status-connected">✅ 已连接 (${escapeHtml(displayName)})</span>`);
        presetCountEl.text(`已加载 ${presetsCache.length} 个预设`);
        // Show server section
        $("#comfy_server_section").show();
    } else if (settings.apiKey) {
        statusEl.html('<span class="comfy-status-pending">⏳ 待验证</span>');
        presetCountEl.text('');
        $("#comfy_server_section").hide();
    } else {
        statusEl.html('<span class="comfy-status-disconnected">❌ 未连接</span>');
        presetCountEl.text('');
        $("#comfy_server_section").hide();
    }
}

function updateServerUI() {
    const settings = getSettings();
    const select = $("#comfy_server_select");
    const statusEl = $("#comfy_server_status");

    // Clear and rebuild options
    select.empty();
    select.append('<option value="">-- 请选择服务器 --</option>');

    let hasOnlineServer = false;
    for (const server of serversCache) {
        const isOnline = server.isOnline === true;
        const statusIcon = isOnline ? '🟢' : '🔴';
        const statusText = isOnline ? '' : ' (离线)';
        if (isOnline) hasOnlineServer = true;

        const selected = server.id === settings.selectedServerId ? 'selected' : '';
        select.append(`<option value="${server.id}" ${selected} ${!isOnline ? 'disabled' : ''}>${statusIcon} ${escapeHtml(server.name)}${statusText}</option>`);
    }

    // Update status text
    if (serversCache.length === 0) {
        statusEl.text('未找到服务器，请先在 Web 端添加');
    } else if (!hasOnlineServer) {
        statusEl.html('<span style="color: #f87171;">所有服务器离线，无法生图</span>');
    } else if (settings.selectedServerId) {
        const selectedServer = serversCache.find(s => s.id === settings.selectedServerId);
        if (selectedServer) {
            if (selectedServer.isOnline) {
                statusEl.html('<span style="color: #4ade80;">服务器在线，可以生图</span>');
            } else {
                statusEl.html('<span style="color: #f87171;">所选服务器离线，请更换</span>');
            }
        }
    } else {
        statusEl.text('请选择一个在线的服务器');
    }
}

async function onVerifyClick() {
    const baseUrl = $("#comfy_base_url").val().trim();
    const apiKey = $("#comfy_api_key").val().trim();

    if (!baseUrl) {
        toastr.warning('请输入服务器地址');
        return;
    }

    if (!apiKey) {
        toastr.warning('请输入 API Key');
        return;
    }

    if (!apiKey.startsWith('cg_')) {
        toastr.warning('API Key 格式无效（应以 cg_ 开头）');
        return;
    }

    const settings = getSettings();
    settings.baseUrl = baseUrl;
    settings.apiKey = apiKey;
    settings.verified = false;
    saveSettingsDebounced();

    const btn = $("#comfy_verify_btn");
    btn.prop("disabled", true).val("验证中...");

    try {
        const valid = await validateApiKey();
        if (valid) {
            toastr.success('API Key 验证成功！');
            updateLoginStatus();

            // Fetch servers and presets
            await Promise.all([fetchServers(), fetchPresets()]);
            updateLoginStatus();
            updateServerUI();

            resetProcessedState();
            setTimeout(processAllMessages, 100);
        } else {
            toastr.error('API Key 无效');
            settings.verified = false;
            saveSettingsDebounced();
            updateLoginStatus();
        }
    } catch (err) {
        toastr.error(err.message || '验证失败');
        settings.verified = false;
        saveSettingsDebounced();
        updateLoginStatus();
    }

    btn.prop("disabled", false).val("验证连接");
}

function onDisconnectClick() {
    const settings = getSettings();
    settings.apiKey = '';
    settings.verified = false;
    settings.userName = '';
    settings.selectedServerId = null;
    saveSettingsDebounced();

    $("#comfy_api_key").val('');
    presetsCache = [];
    serversCache = [];
    updateLoginStatus();
    updateServerUI();
    toastr.info('已断开连接');
}

function onToggleKeyVisibility() {
    const input = $("#comfy_api_key");
    const currentType = input.attr("type");
    input.attr("type", currentType === "password" ? "text" : "password");
}

function onServerChange() {
    const settings = getSettings();
    const selectedValue = $("#comfy_server_select").val();
    settings.selectedServerId = selectedValue ? parseInt(selectedValue, 10) : null;
    saveSettingsDebounced();
    updateServerUI();

    // Re-process messages with new server
    resetProcessedState();
    setTimeout(processAllMessages, 100);
}

async function onRefreshServersClick() {
    const settings = getSettings();
    if (!settings.apiKey || !settings.verified) {
        toastr.warning('请先验证 API Key');
        return;
    }

    const btn = $("#comfy_refresh_servers");
    const statusEl = $("#comfy_server_status");
    btn.prop("disabled", true).text("⏳");
    statusEl.text('正在检查服务器状态...');

    try {
        await fetchServers();
        updateServerUI();
        const onlineCount = serversCache.filter(s => s.isOnline).length;
        toastr.success(`已刷新: ${onlineCount}/${serversCache.length} 服务器在线`);
    } catch (err) {
        toastr.error('刷新失败: ' + err.message);
    }

    btn.prop("disabled", false).text("🔄");
}

function onSettingChange() {
    const settings = getSettings();
    settings.enabled = $("#comfy_enabled").prop("checked");
    settings.baseUrl = $("#comfy_base_url").val().trim();
    settings.startMarker = $("#comfy_start_marker").val() || defaultSettings.startMarker;
    settings.endMarker = $("#comfy_end_marker").val() || defaultSettings.endMarker;
    settings.globalPositive = $("#comfy_global_positive").val();
    settings.globalNegative = $("#comfy_global_negative").val();
    settings.defaultVideoPrompt = $("#comfy_default_video_prompt").val();
    settings.autoRetry = $("#comfy_auto_retry").prop("checked");
    settings.showPromptInResult = $("#comfy_show_prompt").prop("checked");
    settings.enableNsfwBlur = $("#comfy_nsfw_blur").prop("checked");
    settings.enableCache = $("#comfy_enable_cache").prop("checked");
    settings.enableFancyLoading = $("#comfy_fancy_loading").prop("checked");
    saveSettingsDebounced();

    // Update the "get API key" link when base URL changes
    updateGetKeyLink();
}

function onClearCacheClick() {
    if (clearImageCache()) {
        toastr.success('缓存已清除');
        updateCacheStats();

        // 重新处理所有消息
        resetProcessedState();
        setTimeout(processAllMessages, 100);
    } else {
        toastr.error('清除缓存失败');
    }
}

function onApiKeyChange() {
    const settings = getSettings();
    const newKey = $("#comfy_api_key").val().trim();

    // If API key changed, mark as unverified
    if (newKey !== settings.apiKey) {
        settings.apiKey = newKey;
        settings.verified = false;
        saveSettingsDebounced();
        updateLoginStatus();
    }
}

async function onRefreshPresetsClick() {
    const settings = getSettings();
    if (!settings.apiKey || !settings.verified) {
        toastr.warning('请先验证 API Key');
        return;
    }

    const btn = $("#comfy_refresh_presets");
    btn.prop("disabled", true).text("刷新中...");

    try {
        await fetchPresets();
        updateLoginStatus();
        toastr.success(`已刷新预设列表 (${presetsCache.length} 个)`);

        resetProcessedState();
        setTimeout(processAllMessages, 100);
    } catch (err) {
        toastr.error('刷新失败: ' + err.message);
    }

    btn.prop("disabled", false).text("刷新预设");
}

// ============ Init ============

jQuery(async () => {
    console.log('[ComfyGen] 扩展加载中...');

    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings").append(settingsHtml);
    } catch (err) {
        console.error('[ComfyGen] 加载设置面板失败:', err);
        toastr.error('ComfyGen: 加载设置面板失败');
        return;
    }

    // Setting change handlers
    $("#comfy_enabled").on("change", onSettingChange);
    $("#comfy_base_url").on("input", onSettingChange);
    $("#comfy_start_marker").on("input", onSettingChange);
    $("#comfy_end_marker").on("input", onSettingChange);
    $("#comfy_global_positive").on("input", onSettingChange);
    $("#comfy_global_negative").on("input", onSettingChange);
    $("#comfy_default_video_prompt").on("input", onSettingChange);
    $("#comfy_auto_retry").on("change", onSettingChange);
    $("#comfy_show_prompt").on("change", onSettingChange);
    $("#comfy_nsfw_blur").on("change", onSettingChange);
    $("#comfy_enable_cache").on("change", onSettingChange);
    $("#comfy_fancy_loading").on("change", onSettingChange);

    // API Key handlers
    $("#comfy_api_key").on("input", onApiKeyChange);
    $("#comfy_verify_btn").on("click", onVerifyClick);
    $("#comfy_disconnect_btn").on("click", onDisconnectClick);
    $("#comfy_toggle_key").on("click", onToggleKeyVisibility);
    $("#comfy_refresh_presets").on("click", onRefreshPresetsClick);

    // Server handlers
    $("#comfy_server_select").on("change", onServerChange);
    $("#comfy_refresh_servers").on("click", onRefreshServersClick);

    // Cache handlers
    $("#comfy_clear_cache").on("click", onClearCacheClick);

    // 事件委托：图片点击（支持 NSFW 解除模糊 + 打开图片）
    $(document).on("click", ".comfy-clickable-img", function(e) {
        const img = e.currentTarget;
        const url = img.dataset.url;
        const isNsfw = img.dataset.nsfw === '1';

        if (isNsfw && img.classList.contains('comfy-nsfw-blur')) {
            // 第一次点击：解除模糊
            img.classList.remove('comfy-nsfw-blur');
            const wrapper = img.closest('.comfy-image-wrapper');
            const badge = wrapper?.querySelector('.comfy-nsfw-badge');
            if (badge) badge.remove();
        } else {
            // 第二次点击或非 NSFW：打开图片
            if (url) window.open(url, '_blank');
        }
    });

    // 事件委托：复制链接按钮
    $(document).on("click", ".comfy-copy-btn", function(e) {
        e.preventDefault();
        e.stopPropagation();
        const url = e.currentTarget.dataset.url;
        if (url) {
            navigator.clipboard.writeText(url).then(() => {
                safeToastr('success', '链接已复制');
            }).catch(() => {
                safeToastr('error', '复制失败');
            });
        }
    });

    // 事件委托：生成视频按钮
    $(document).on("click", ".comfy-gen-video-btn", function(e) {
        e.preventDefault();
        e.stopPropagation();
        handleVideoGenClick(e);
    });

    loadSettingsUI();

    // Auto-validate if API key exists
    const settings = getSettings();
    if (settings.apiKey && settings.baseUrl) {
        try {
            const valid = await validateApiKey();
            if (valid) {
                await Promise.all([fetchServers(), fetchPresets()]);
                updateLoginStatus();
                updateServerUI();
            } else {
                console.log('[ComfyGen] API Key 无效，已清除验证状态');
                settings.verified = false;
                saveSettingsDebounced();
                updateLoginStatus();
            }
        } catch (err) {
            console.warn('[ComfyGen] API Key 验证失败:', err);
        }
    }

    const { eventSource, event_types } = SillyTavern.getContext();

    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
        processMessage(messageId);
    });

    eventSource.on(event_types.USER_MESSAGE_RENDERED, (messageId) => {
        processMessage(messageId);
    });

    eventSource.on(event_types.MESSAGE_EDITED, (messageId) => {
        const mesKey = `msg-${messageId}`;
        processedMessages.delete(mesKey);

        const mes = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
        if (mes) {
            delete mes.dataset.comfyProcessed;
        }

        setTimeout(() => processMessage(messageId), 100);
    });

    eventSource.on(event_types.CHAT_CHANGED, () => {
        resetProcessedState();
        setTimeout(processAllMessages, 200);
    });

    eventSource.on(event_types.MESSAGE_SWIPED, () => {
        resetProcessedState();
        setTimeout(processAllMessages, 100);
    });

    // MutationObserver: 监听动态插入的 iframe
    const chatContainer = document.querySelector('#chat');
    if (chatContainer) {
        const iframeObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                // 检查新增节点中的 iframe
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;

                    // 直接是 iframe
                    if (node.tagName === 'IFRAME') {
                        const mes = node.closest('.mes');
                        if (mes) {
                            const messageId = parseInt(mes.getAttribute('mesid'), 10);
                            if (!isNaN(messageId)) {
                                // 绑定 load 事件
                                node.addEventListener('load', () => {
                                    setTimeout(() => {
                                        processIframeContent(node, messageId);
                                    }, 100);
                                }, { once: true });
                            }
                        }
                    }

                    // 或者是包含 iframe 的元素
                    const iframes = node.querySelectorAll?.('iframe');
                    if (iframes) {
                        for (const iframe of iframes) {
                            if (processedIframes.has(iframe)) continue;

                            const mes = iframe.closest('.mes');
                            if (mes) {
                                const messageId = parseInt(mes.getAttribute('mesid'), 10);
                                if (!isNaN(messageId)) {
                                    iframe.addEventListener('load', () => {
                                        setTimeout(() => {
                                            processIframeContent(iframe, messageId);
                                        }, 100);
                                    }, { once: true });
                                }
                            }
                        }
                    }
                }
            }
        });

        iframeObserver.observe(chatContainer, {
            childList: true,
            subtree: true
        });

        console.log('[ComfyGen] iframe 监听器已启动');
    }

    setTimeout(processAllMessages, 500);

    console.log('[ComfyGen] 扩展加载完成');
});
