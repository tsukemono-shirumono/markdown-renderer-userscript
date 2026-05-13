// ==UserScript==
// @name         Markdown Renderer (Safari)
// @namespace    https://example.local/userscripts
// @version      0.9.1
// @description  Render raw .md URLs as standalone HTML on Safari/iPad. Embeds external images as Base64 data URLs before opening a blob HTML document.
// @author       you
// @match        http://*/*.md*
// @match        https://*/*.md*
// @include      /^https?:\/\/.*\.md(?:[?#].*)?$/
// @run-at       document-idle
// @inject-into  content
// @grant        GM_addStyle
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @require      https://cdn.jsdelivr.net/npm/marked@15.0.12/marked.min.js
// @require      https://cdn.jsdelivr.net/npm/dompurify@3.2.5/dist/purify.min.js
// @require      https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg-full.js
// ==/UserScript==

(async () => {
  'use strict';

  const CONFIG = {
    maxWidth: '920px',

    // GitHub 風に通常改行を <br> にしたい場合は true。
    breaks: false,

    markdownUrlPattern: /\.md(?:[?#].*)?$/i,

    // $...$ をインライン数式として扱う。
    enableSingleDollarInlineMath: true,

    // 画像を GM.xmlHttpRequest で取得して data:image/...;base64,... に埋め込む。
    embedImagesAsDataUrls: true,

    // iPad Safari のメモリ対策。大きすぎる画像は外部 URL フォールバックにする。
    maxImageBytes: 12 * 1024 * 1024,

    // 同時ダウンロード数。多すぎると iPad Safari で不安定になりやすい。
    imageConcurrency: 3,

    imageTimeoutMs: 30000,

    // Userscripts 側の通信が返ってこない場合に備えた追加タイムアウト。
    hardTimeoutE([github.com](https://github.com/quoid/userscripts?utm_source=chatgpt.com))  // 画像取得ログを Safari Web Inspector の Console に出す。
    debugImageRequests: true,

    // SVG は data URL 化して <img> 表示するだけなら通常スクリプト実行されないが、
    // 安全側に倒して既定では埋め込まない。必要なら true にする。
    allowSvgImageEmbedding: false,
  };

  const STATE = {
    sourceUrl: location.href,
    sourceTitle: decodeURIComponent(location.pathname.split('/').pop() || 'Markdown'),
    mathJaxCss: '',
  };

  const APP_CSS = `
    :root {
      color-scheme: light dark;
    }

    html.md-renderer-active,
    html.md-renderer-active body {
      margin: 0;
      background: Canvas;
      color: CanvasText;
    }

    body.md-renderer-body {
      font-family:
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        "Noto Sans JP",
        "Noto Sans",
        Helvetica,
        Arial,
        sans-serif;
      line-height: 1.65;
    }

    .md-renderer-shell {
      box-sizing: border-box;
      max-width: ${CONFIG.maxWidth};
      margin: 0 auto;
      padding: 32px 20px 72px;
    }

    .md-renderer-header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 32px;
      padding-bottom: 20px;
      border-bottom: 1px solid color-mix(in srgb, CanvasText 16%, transparent);
    }

    .md-renderer-eyebrow {
      margin-bottom: 4px;
      color: color-mix(in srgb, CanvasText 58%, transparent);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .md-renderer-title {
      margin: 0;
      font-size: 24px;
      line-height: 1.25;
      word-break: break-word;
    }

    .md-renderer-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }

    .md-renderer-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 34px;
      padding: 0 12px;
      border: 1px solid color-mix(in srgb, CanvasText 18%, transparent);
      border-radius: 8px;
      color: CanvasText;
      text-decoration: none;
      font-size: 13px;
      background: color-mix(in srgb, Canvas 92%, CanvasText);
      cursor: pointer;
    }

    .md-renderer-button:hover {
      background: color-mix(in srgb, Canvas 84%, CanvasText);
    }

    .md-renderer-content {
      font-size: 16px;
    }

    .md-renderer-content > :first-child {
      margin-top: 0;
    }

    .md-renderer-content > :last-child {
      margin-bottom: 0;
    }

    .md-renderer-content h1,
    .md-renderer-content h2,
    .md-renderer-content h3,
    .md-renderer-content h4,
    .md-renderer-content h5,
    .md-renderer-content h6 {
      margin-top: 1.8em;
      margin-bottom: 0.7em;
      line-height: 1.25;
    }

    .md-renderer-content h1 {
      padding-bottom: 0.3em;
      border-bottom: 1px solid color-mix(in srgb, CanvasText 16%, transparent);
      font-size: 2em;
    }

    .md-renderer-content h2 {
      padding-bottom: 0.25em;
      border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, transparent);
      font-size: 1.5em;
    }

    .md-renderer-content h3 {
      font-size: 1.25em;
    }

    .md-renderer-content p,
    .md-renderer-content ul,
    .md-renderer-content ol,
    .md-renderer-content blockquote,
    .md-renderer-content table,
    .md-renderer-content pre,
    .md-renderer-content figure {
      margin-top: 0;
      margin-bottom: 1em;
    }

    .md-renderer-content a {
      color: LinkText;
    }

    .md-renderer-content blockquote {
      padding: 0 1em;
      color: color-mix(in srgb, CanvasText 68%, transparent);
      border-left: 4px solid color-mix(in srgb, CanvasText 22%, transparent);
    }

    .md-renderer-content code {
      padding: 0.15em 0.35em;
      border-radius: 5px;
      background: color-mix(in srgb, CanvasText 9%, transparent);
      font-family:
        ui-monospace,
        SFMono-Regular,
        SFMono,
        Consolas,
        "Liberation Mono",
        Menlo,
        monospace;
      font-size: 0.88em;
    }

    .md-renderer-content pre {
      overflow: auto;
      padding: 16px;
      border-radius: 10px;
      background: color-mix(in srgb, CanvasText 8%, transparent);
    }

    .md-renderer-content pre code {
      display: block;
      padding: 0;
      background: transparent;
      font-size: 0.9em;
      white-space: pre;
    }

    .md-renderer-content table {
      display: block;
      width: 100%;
      overflow: auto;
      border-collapse: collapse;
    }

    .md-renderer-content th,
    .md-renderer-content td {
      padding: 6px 12px;
      border: 1px solid color-mix(in srgb, CanvasText 18%, transparent);
    }

    .md-renderer-content th {
      background: color-mix(in srgb, CanvasText 7%, transparent);
      font-weight: 600;
    }

    .md-renderer-content hr {
      height: 1px;
      margin: 24px 0;
      border: 0;
      background: color-mix(in srgb, CanvasText 18%, transparent);
    }

    .md-renderer-blob-image {
      display: block;
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      background: #fff;
      box-sizing: border-box;
      border: 1px solid color-mix(in srgb, CanvasText 12%, transparent);
    }

    .md-renderer-image-figure {
      display: block;
      margin: 1.2em 0;
      max-width: 100%;
      overflow-x: auto;
    }

    .md-renderer-image-figure a {
      display: inline-block;
      max-width: 100%;
    }

    .md-renderer-image-figure figcaption {
      margin-top: 0.5em;
      color: color-mix(in srgb, CanvasText 68%, transparent);
      font-size: 0.92em;
      line-height: 1.45;
    }

    .md-renderer-image-note {
      margin-top: 0.45em;
      color: color-mix(in srgb, CanvasText 58%, transparent);
      font-size: 0.84em;
      line-height: 1.45;
      word-break: break-word;
    }

    .md-renderer-raw {
      margin-top: 48px;
      padding-top: 20px;
      border-top: 1px solid color-mix(in srgb, CanvasText 14%, transparent);
    }

    .md-renderer-raw summary {
      cursor: pointer;
      font-weight: 700;
    }

    .md-renderer-raw pre {
      overflow: auto;
      margin-top: 12px;
      padding: 16px;
      border-radius: 10px;
      background: color-mix(in srgb, CanvasText 8%, transparent);
    }

    .md-renderer-math-inline mjx-container {
      display: inline-block;
      vertical-align: -0.12em;
    }

    .md-renderer-math-display {
      display: block;
      overflow-x: auto;
      margin: 1em 0;
      text-align: center;
    }

    .md-renderer-math-display mjx-container {
      display: inline-block;
      max-width: 100%;
    }

    .md-renderer-math-error {
      color: #b00020;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      white-space: pre-wrap;
    }

    .md-renderer-status-card {
      box-sizing: border-box;
      max-width: 680px;
      margin: 12vh auto;
      padding: 24px 20px;
      border: 1px solid color-mix(in srgb, CanvasText 16%, transparent);
      border-radius: 14px;
      background: color-mix(in srgb, Canvas 96%, CanvasText);
      color: CanvasText;
      box-shadow: 0 12px 36px color-mix(in srgb, CanvasText 12%, transparent);
    }

    .md-renderer-status-title {
      margin: 0 0 8px;
      font-size: 20px;
      line-height: 1.35;
    }

    .md-renderer-status-detail {
      margin: 0;
      color: color-mix(in srgb, CanvasText 68%, transparent);
      font-size: 14px;
      line-height: 1.6;
      word-break: break-word;
    }

    @media (max-width: 640px) {
      .md-renderer-shell {
        padding: 20px 14px 56px;
      }

      .md-renderer-header {
        flex-direction: column;
      }

      .md-renderer-actions {
        justify-content: flex-start;
      }

      .md-renderer-title {
        font-size: 20px;
      }
    }
  `;

  if (!CONFIG.markdownUrlPattern.test(location.href)) return;

  function hasRequiredLibraries() {
    return Boolean(window.marked && window.DOMPurify && window.MathJax);
  }

  function addStyle(css) {
    if (!css) return;

    try {
      if (typeof GM_addStyle === 'function') {
        GM_addStyle(css);
        return;
      }
    } catch {
      // fall through
    }

    try {
      if (window.GM && typeof window.GM.addStyle === 'function') {
        window.GM.addStyle(css);
        return;
      }
    } catch {
      // fall through
    }

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function setStatus(title, detail = '') {
    document.documentElement.classList.add('md-renderer-active');
    document.body.classList.add('md-renderer-body');

    document.body.innerHTML = `
      <main class="md-renderer-shell">
        <section class="md-renderer-status-card" role="status" aria-live="polite">
          <h1 class="md-renderer-status-title">${escapeHtml(title)}</h1>
          <p class="md-renderer-status-detail">${escapeHtml(detail)}</p>
        </section>
      </main>
    `;
  }

  function getRawMarkdown() {
    if (!document.body) return '';

    const onlyChild =
      document.body.children.length === 1
        ? document.body.children[0]
        : null;

    if (onlyChild && onlyChild.tagName === 'PRE') {
      return onlyChild.textContent || '';
    }

    return document.body.innerText || document.body.textContent || '';
  }

  function configureMarked() {
    const renderer = new window.marked.Renderer();

    renderer.image = function imageRenderer(hrefOrToken, titleArg, textArg) {
      let href = '';
      let title = '';
      let text = '';

      // marked v15 形式: renderer.image(token)
      if (
        hrefOrToken &&
        typeof hrefOrToken === 'object' &&
        Object.prototype.hasOwnProperty.call(hrefOrToken, 'href')
      ) {
        href = hrefOrToken.href || '';
        title = hrefOrToken.title || '';
        text = hrefOrToken.text || '';
      } else {
        // 旧形式互換: renderer.image(href, title, text)
        href = hrefOrToken || '';
        title = titleArg || '';
        text = textArg || '';
      }

      return `
        <span
          class="md-renderer-image-request"
          data-md-image-src="${escapeHtml(href)}"
          data-md-image-alt="${escapeHtml(text)}"
          data-md-image-title="${escapeHtml(title)}"
        ></span>
      `;
    };

    window.marked.setOptions({
      gfm: true,
      breaks: CONFIG.breaks,
      async: false,
      renderer,
    });
  }

  function sanitizeHtml(html) {
    return window.DOMPurify.sanitize(html, {
      USE_PROFILES: {
        html: true,
      },
      ADD_TAGS: [
        'details',
        'summary',
        'figure',
        'figcaption',
      ],
      ADD_ATTR: [
        'class',
        'id',
        'name',
        'target',
        'rel',
        'aria-hidden',
        'aria-label',
        'title',
        'data-md-image-src',
        'data-md-image-alt',
        'data-md-image-title',
      ],
      FORBID_TAGS: [
        'img',
      ],
    });
  }

  function postProcessLinks(root) {
    root.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') || '';

      if (
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:')
      ) {
        return;
      }

      try {
        const url = new URL(href, STATE.sourceUrl);
        a.href = url.href;

        if (url.origin !== location.origin) {
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
        }
      } catch {
        // ignore invalid URL
      }
    });
  }

  function getGmXmlHttpRequest() {
    if (window.GM && typeof window.GM.xmlHttpRequest === 'function') {
      return {
        mode: 'promise',
        request: window.GM.xmlHttpRequest.bind(window.GM),
      };
    }

    if (typeof GM_xmlhttpRequest === 'function') {
      return {
        mode: 'callback',
        request: GM_xmlhttpRequest,
      };
    }

    return null;
  }

  function toError(value, fallbackMessage = 'GM request failed') {
    if (value instanceof Error) return value;

    if (value && typeof value === 'object') {
      const status = value.status ? `HTTP ${value.status}` : '';
      const statusText = value.statusText || '';
      const message = [status, statusText].filter(Boolean).join(' ');
      return new Error(message || fallbackMessage);
    }

    return new Error(String(value || fallbackMessage));
  }

  function withHardTimeout(promise, { timeoutMs, abort, label }) {
    let timer = null;
    let settled = false;

    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;

        try {
          if (typeof abort === 'function') abort();
        } catch {
          // ignore abort errors
        }

        reject(new Error(`GM request hard-timeout after ${timeoutMs}ms: ${label}`));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      settled = true;
      if (timer) clearTimeout(timer);
    });
  }

  async function gmXmlHttpRequest(details) {
    const gm = getGmXmlHttpRequest();

    if (!gm) {
      throw new Error('GM.xmlHttpRequest is not available. Use @inject-into content and grant GM.xmlHttpRequest.');
    }

    const timeoutMs = Number(details.timeout || CONFIG.imageTimeoutMs || 30000);
    const hardTimeoutMs = timeoutMs + Number(CONFIG.hardTimeoutExtraMs || 0);
    const label = details.url || 'unknown URL';

    if (gm.mode === 'promise') {
      let handle = null;

      const requestDetails = { ...details };
      delete requestDetails.onload;
      delete requestDetails.onerror;
      delete requestDetails.onabort;
      delete requestDetails.ontimeout;
      delete requestDetails.onreadystatechange;
      delete requestDetails.onloadend;
      delete requestDetails.onloadstart;

      const promise = new Promise((resolve, reject) => {
        try {
          if (CONFIG.debugImageRequests) {
            console.info('[md-renderer] GM.xmlHttpRequest start:', label);
          }

          handle = gm.request(requestDetails);
          Promise.resolve(handle).then(resolve, reject);
        } catch (error) {
          reject(error);
        }
      }).then((response) => {
        if (CONFIG.debugImageRequests) {
          console.info('[md-renderer] GM.xmlHttpRequest done:', label, response?.status, response?.responseType);
        }

        return response;
      });

      return await withHardTimeout(promise, {
        timeoutMs: hardTimeoutMs,
        label,
        abort: () => handle?.abort?.(),
      });
    }

    return await new Promise((resolve, reject) => {
      let handle = null;
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;

        try {
          handle?.abort?.();
        } catch {
          // ignore abort errors
        }

        reject(new Error(`GM request hard-timeout after ${hardTimeoutMs}ms: ${label}`));
      }, hardTimeoutMs);

      const settleResolve = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        if (CONFIG.debugImageRequests) {
          console.info('[md-renderer] GM_xmlhttpRequest done:', label, value?.status, value?.responseType);
        }

        resolve(value);
      };

      const settleReject = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(toError(error));
      };

      try {
        if (CONFIG.debugImageRequests) {
          console.info('[md-renderer] GM_xmlhttpRequest start:', label);
        }

        handle = gm.request({
          ...details,
          onload: settleResolve,
          onerror: settleReject,
          onabort: () => settleReject(new Error('GM request aborted')),
          ontimeout: () => settleReject(new Error('GM request timed out')),
        });
      } catch (error) {
        settleReject(error);
      }
    });
  }

  function getHeader(responseHeaders, name) {
    const lowerName = name.toLowerCase();

    return String(responseHeaders || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf(':');
        if (index === -1) return null;
        return {
          name: line.slice(0, index).trim().toLowerCase(),
          value: line.slice(index + 1).trim(),
        };
      })
      .filter(Boolean)
      .find((header) => header.name === lowerName)?.value || '';
  }

  function normalizeMimeType(value) {
    return String(value || '').split(';')[0].trim().toLowerCase();
  }

  function guessImageMimeType(url) {
    const pathname = (() => {
      try {
        return new URL(url).pathname.toLowerCase();
      } catch {
        return String(url).toLowerCase();
      }
    })();

    if (pathname.endsWith('.png')) return 'image/png';
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
    if (pathname.endsWith('.gif')) return 'image/gif';
    if (pathname.endsWith('.webp')) return 'image/webp';
    if (pathname.endsWith('.avif')) return 'image/avif';
    if (pathname.endsWith('.svg') || pathname.endsWith('.svgz')) return 'image/svg+xml';

    return '';
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error || new Error('Failed to convert image to data URL'));

      reader.readAsDataURL(blob);
    });
  }

  function normalizeImageUrl(src) {
    const url = new URL(src, STATE.sourceUrl);

    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'data:') {
      return url.href;
    }

    throw new Error(`Unsupported image URL scheme: ${url.protocol}`);
  }

  async function fetchImageBlob(url) {
    const response = await gmXmlHttpRequest({
      method: 'GET',
      url,
      responseType: 'arraybuffer',
      timeout: CONFIG.imageTimeoutMs,
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });

    const status = Number(response?.status || 0);

    if (status < 200 || status >= 300) {
      throw new Error(`HTTP ${status || 'unknown'}`);
    }

    const headerMimeType = normalizeMimeType(getHeader(response.responseHeaders, 'content-type'));
    const guessedMimeType = guessImageMimeType(url);
    let mimeType = headerMimeType || guessedMimeType || 'application/octet-stream';
    let body = response.response;

    if (body instanceof Blob) {
      if (!mimeType && body.type) {
        mimeType = normalizeMimeType(body.type);
      }
    } else if (body instanceof ArrayBuffer) {
      body = new Blob([body], { type: mimeType });
    } else if (ArrayBuffer.isView(body)) {
      body = new Blob([body.buffer], { type: mimeType });
    } else if (typeof body === 'string') {
      body = new Blob([body], { type: mimeType });
    } else if (typeof response.responseText === 'string') {
      body = new Blob([response.responseText], { type: mimeType });
    } else {
      throw new Error(`Unsupported GM response body: ${Object.prototype.toString.call(body)}`);
    }

    let blob = body;

    if (!(blob instanceof Blob)) {
      throw new Error('Response is not convertible to Blob');
    }

    if (!mimeType || mimeType === 'application/octet-stream') {
      mimeType = normalizeMimeType(blob.type) || guessedMimeType || mimeType;
    }

    if (blob.size > CONFIG.maxImageBytes) {
      throw new Error(`Image is too large: ${(blob.size / 1024 / 1024).toFixed(1)} MB`);
    }

    if (!mimeType.startsWith('image/')) {
      throw new Error(`Response is not an image: ${mimeType || 'unknown content-type'}`);
    }

    if (!CONFIG.allowSvgImageEmbedding && mimeType === 'image/svg+xml') {
      throw new Error('SVG embedding is disabled');
    }

    if (blob.type !== mimeType) {
      blob = blob.slice(0, blob.size, mimeType);
    }

    return blob;
  }

  async function imageUrlToDataUrl(url) {
    if (url.startsWith('data:')) {
      if (!url.startsWith('data:image/')) {
        throw new Error('Only data:image/... URLs are allowed for images');
      }

      return url;
    }

    const blob = await fetchImageBlob(url);
    return await blobToDataUrl(blob);
  }

  function createImageFigure({ originalUrl, imageSrc, alt, title, embedded, error }) {
    const figure = document.createElement('figure');
    figure.className = 'md-renderer-image-figure';

    const link = document.createElement('a');
    link.href = originalUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    const image = document.createElement('img');
    image.className = 'md-renderer-blob-image';
    image.alt = alt;
    image.title = title || alt;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.src = imageSrc;

    if (embedded) {
      image.dataset.mdRendererEmbedded = 'true';
    } else {
      image.dataset.mdRendererEmbedded = 'false';
    }

    link.appendChild(image);
    figure.appendChild(link);

    if (alt) {
      const figcaption = document.createElement('figcaption');
      figcaption.textContent = alt;
      figure.appendChild(figcaption);
    }

    if (error) {
      const note = document.createElement('div');
      note.className = 'md-renderer-image-note';
      note.textContent = `Image was not embedded; falling back to external URL. ${error.message || String(error)}`;
      figure.appendChild(note);
    }

    return figure;
  }

  async function mapLimit(items, limit, worker) {
    let index = 0;
    const workerCount = Math.max(1, Math.min(limit, items.length));

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (index < items.length) {
          const currentIndex = index;
          index++;
          await worker(items[currentIndex], currentIndex);
        }
      })
    );
  }

  async function postProcessImages(root) {
    const nodes = [...root.querySelectorAll('.md-renderer-image-request[data-md-image-src]')];

    if (!nodes.length) return;

    let completed = 0;
    let embeddedCount = 0;
    let fallbackCount = 0;

    const updateProgress = () => {
      setStatus(
        'Embedding images...',
        `${completed}/${nodes.length} processed, ${embeddedCount} embedded, ${fallbackCount} fallback.`
      );
    };

    updateProgress();

    await mapLimit(nodes, CONFIG.imageConcurrency, async (node) => {
      const src = node.getAttribute('data-md-image-src') || '';
      const alt = node.getAttribute('data-md-image-alt') || '';
      const title = node.getAttribute('data-md-image-title') || '';

      let originalUrl;

      try {
        originalUrl = normalizeImageUrl(src);
      } catch (error) {
        const fallback = document.createElement('span');
        fallback.textContent = alt || src;
        node.replaceWith(fallback);

        completed++;
        fallbackCount++;
        updateProgress();
        return;
      }

      let imageSrc = originalUrl;
      let embedded = false;
      let error = null;

      if (CONFIG.embedImagesAsDataUrls) {
        try {
          imageSrc = await imageUrlToDataUrl(originalUrl);
          embedded = true;
          embeddedCount++;
        } catch (caught) {
          error = caught;
          fallbackCount++;
          console.warn('[md-renderer] image embedding failed:', originalUrl, caught);
        }
      }

      const figure = createImageFigure({
        originalUrl,
        imageSrc,
        alt,
        title,
        embedded,
        error,
      });

      node.replaceWith(figure);
      completed++;
      updateProgress();
    });

    console.info(
      `[md-renderer] image processing finished: ${embeddedCount} embedded, ${fallbackCount} fallback(s)`
    );
  }

  // ---------------------------------------------------------------------------
  // 数式レンダリング
  // ---------------------------------------------------------------------------

  function shouldSkipMathNode(node) {
    const parent = node.parentElement;
    if (!parent) return true;

    return Boolean(
      parent.closest(
        'script, noscript, style, textarea, pre, code, option, .nomath, .no-math, .no-mathjax'
      )
    );
  }

  function isEscaped(text, index) {
    let slashCount = 0;

    for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) {
      slashCount++;
    }

    return slashCount % 2 === 1;
  }

  function findClosing(text, openEnd, close) {
    let i = openEnd;

    while (i < text.length) {
      const found = text.indexOf(close, i);
      if (found === -1) return -1;

      if (!isEscaped(text, found)) return found;

      i = found + close.length;
    }

    return -1;
  }

  function findNextMath(text, startIndex = 0) {
    const candidates = [];

    const pushCandidate = (index, open, close, display) => {
      if (index === -1) return;
      if (isEscaped(text, index)) return;
      candidates.push({ index, open, close, display });
    };

    pushCandidate(text.indexOf('$$', startIndex), '$$', '$$', true);
    pushCandidate(text.indexOf('\\[', startIndex), '\\[', '\\]', true);
    pushCandidate(text.indexOf('\\(', startIndex), '\\(', '\\)', false);

    if (CONFIG.enableSingleDollarInlineMath) {
      let dollarIndex = text.indexOf('$', startIndex);

      while (dollarIndex !== -1) {
        const isDoubleDollar = text.slice(dollarIndex, dollarIndex + 2) === '$$';

        if (!isDoubleDollar && !isEscaped(text, dollarIndex)) {
          pushCandidate(dollarIndex, '$', '$', false);
          break;
        }

        dollarIndex = text.indexOf('$', dollarIndex + 1);
      }
    }

    candidates.sort((a, b) => {
      if (a.index !== b.index) return a.index - b.index;
      return b.open.length - a.open.length;
    });

    for (const candidate of candidates) {
      const contentStart = candidate.index + candidate.open.length;
      const closeIndex = findClosing(text, contentStart, candidate.close);

      if (closeIndex === -1) continue;

      const tex = text.slice(contentStart, closeIndex).trim();

      if (!tex) continue;

      return {
        start: candidate.index,
        end: closeIndex + candidate.close.length,
        tex,
        display: candidate.display,
      };
    }

    return null;
  }

  function collectTextNodesForMath(root) {
    const nodes = [];

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (shouldSkipMathNode(node)) {
            return NodeFilter.FILTER_REJECT;
          }

          const text = node.nodeValue || '';

          if (
            text.includes('$') ||
            text.includes('\\(') ||
            text.includes('\\[')
          ) {
            return NodeFilter.FILTER_ACCEPT;
          }

          return NodeFilter.FILTER_REJECT;
        },
      }
    );

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    return nodes;
  }

  async function mathJaxReady() {
    if (window.MathJax.startup?.promise) {
      await window.MathJax.startup.promise;
    }

    if (typeof window.MathJax.tex2svgPromise !== 'function') {
      throw new Error('MathJax.tex2svgPromise is not available.');
    }

    if (typeof window.MathJax.svgStylesheet === 'function') {
      const style = window.MathJax.svgStylesheet();
      const css = style?.textContent || style?.innerHTML || '';

      if (css) {
        STATE.mathJaxCss = css;
      }
    }
  }

  async function renderTexToSvg(tex, display) {
    try {
      const wrapper = document.createElement(display ? 'div' : 'span');

      wrapper.className = display
        ? 'md-renderer-math-display'
        : 'md-renderer-math-inline';

      const output = await window.MathJax.tex2svgPromise(tex, { display });

      wrapper.appendChild(output);
      return wrapper;
    } catch (error) {
      console.warn('[md-renderer] MathJax render failed:', tex, error);

      const fallback = document.createElement('span');
      fallback.className = 'md-renderer-math-error';
      fallback.textContent = display ? `$$${tex}$$` : `$${tex}$`;

      return fallback;
    }
  }

  async function renderMath(root) {
    await mathJaxReady();

    const textNodes = collectTextNodesForMath(root);
    let count = 0;

    if (textNodes.length) {
      setStatus('Rendering math...', `${textNodes.length} text node(s) may contain TeX.`);
    }

    for (const textNode of textNodes) {
      const text = textNode.nodeValue || '';
      const fragment = document.createDocumentFragment();

      let cursor = 0;
      let foundAny = false;

      while (cursor < text.length) {
        const match = findNextMath(text, cursor);

        if (!match) {
          fragment.appendChild(document.createTextNode(text.slice(cursor)));
          break;
        }

        if (match.start > cursor) {
          fragment.appendChild(
            document.createTextNode(text.slice(cursor, match.start))
          );
        }

        const mathNode = await renderTexToSvg(match.tex, match.display);
        fragment.appendChild(mathNode);

        count++;
        foundAny = true;
        cursor = match.end;
      }

      if (foundAny) {
        textNode.replaceWith(fragment);
      }
    }

    console.info(`[md-renderer] MathJax SVG rendered: ${count} expression(s)`);
  }

  // ---------------------------------------------------------------------------
  // Standalone HTML
  // ---------------------------------------------------------------------------

  function buildStandaloneHtml({ contentHtml, rawMarkdown }) {
    const title = `Markdown: ${STATE.sourceTitle}`;
    const css = `${APP_CSS}\n${STATE.mathJaxCss || ''}`;

    return `<!doctype html>
<html class="md-renderer-active">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: http: https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <title>${escapeHtml(title)}</title>
  <style>${css}</style>
</head>
<body class="md-renderer-body">
  <main class="md-renderer-shell">
    <header class="md-renderer-header">
      <div>
        <div class="md-renderer-eyebrow">Rendered Markdown</div>
        <h1 class="md-renderer-title">${escapeHtml(STATE.sourceTitle)}</h1>
      </div>
      <nav class="md-renderer-actions" aria-label="Document actions">
        <a class="md-renderer-button" href="${escapeHtml(STATE.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open Raw</a>
      </nav>
    </header>

    <article class="md-renderer-content">
      ${contentHtml}
    </article>

    <details class="md-renderer-raw">
      <summary>Raw Markdown</summary>
      <pre><code>${escapeHtml(rawMarkdown)}</code></pre>
    </details>
  </main>
</body>
</html>`;
  }

  function openStandaloneHtml(html) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    location.replace(blobUrl);
  }

  async function renderPage(markdown) {
    configureMarked();

    setStatus('Parsing Markdown...', STATE.sourceUrl);

    const rawHtml = window.marked.parse(markdown);
    const safeHtml = sanitizeHtml(rawHtml);

    const container = document.createElement('article');
    container.className = 'md-renderer-content';
    container.innerHTML = safeHtml;

    postProcessLinks(container);
    await postProcessImages(container);
    await renderMath(container);

    setStatus('Opening rendered document...', 'Switching to a standalone blob HTML document.');

    const standaloneHtml = buildStandaloneHtml({
      contentHtml: container.innerHTML,
      rawMarkdown: markdown,
    });

    openStandaloneHtml(standaloneHtml);

    console.info('[md-renderer] rendered successfully (Safari standalone edition)');
  }

  async function main() {
    const markdown = getRawMarkdown();

    addStyle(APP_CSS);

    if (!hasRequiredLibraries()) {
      setStatus(
        'Markdown Renderer failed',
        'Required libraries are missing: marked, DOMPurify, or MathJax.'
      );

      console.error('[md-renderer] Required libraries are missing.', {
        marked: !!window.marked,
        DOMPurify: !!window.DOMPurify,
        MathJax: !!window.MathJax,
      });
      return;
    }

    if (!markdown.trim()) {
      setStatus('Markdown Renderer skipped', 'Markdown body is empty.');
      console.warn('[md-renderer] Markdown body is empty.');
      return;
    }

    await renderPage(markdown);
  }

  main().catch((error) => {
    addStyle(APP_CSS);
    setStatus('Markdown Renderer failed', error?.message || String(error));
    console.error('[md-renderer] Fatal error:', error);
  });
})();
