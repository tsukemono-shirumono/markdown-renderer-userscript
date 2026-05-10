// ==UserScript==
// @name         Markdown Renderer
// @namespace    https://example.local/userscripts
// @version      0.8.0
// @description  Render URLs ending in .md as HTML with MathJax SVG math and CSP-resistant images.
// @author       you
// @match        http://*/*.md*
// @match        https://*/*.md*
// @include      /^https?:\/\/.*\.md(?:[?#].*)?$/
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      *
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

    // arXiv などの透明PNG対策。
    imageCanvasBackground: '#ffffff',
  };

  const mdRendererObjectUrls = [];

  if (!CONFIG.markdownUrlPattern.test(location.href)) return;

  window.addEventListener('pagehide', () => {
    for (const url of mdRendererObjectUrls) {
      URL.revokeObjectURL(url);
    }
  });

  function hasRequiredLibraries() {
    return (
      window.marked &&
      window.DOMPurify &&
      window.MathJax
    );
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

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function addCss() {
    GM_addStyle(`
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

      .md-renderer-blob-image,
      .md-renderer-canvas-image {
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

      .md-renderer-image-placeholder {
        padding: 12px 14px;
        border: 1px dashed color-mix(in srgb, CanvasText 28%, transparent);
        border-radius: 8px;
        color: color-mix(in srgb, CanvasText 72%, transparent);
        background: color-mix(in srgb, CanvasText 5%, transparent);
        font-size: 14px;
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

      @media (max-width: 640px) {
        .md-renderer-shell {
          padding: 20px 14px 56px;
        }

        .md-renderer-header {
          flex-direction: column;
        }

        .md-renderer-title {
          font-size: 20px;
        }
      }
    `);
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

      // <img src="https://..."> をここで作らない。
      // CSP の img-src に当たらないよう、後段で GM_xmlhttpRequest + blob/canvas に変換する。
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
        // raw HTML の <img> は使わない。Markdown画像は上の renderer.image で独自処理する。
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
        const url = new URL(href, location.href);

        if (url.origin !== location.origin) {
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
        }
      } catch {
        // ignore invalid URL
      }
    });
  }

  function makeImagePlaceholder(message, url) {
    /**
     * 画像読み込み中やエラー時に表示するプレースホルダを生成する。
     */
    const div = document.createElement('div');
    div.className = 'md-renderer-image-placeholder';

    const text = document.createElement('span');
    text.textContent = message;
    div.appendChild(text);

    if (url) {
      div.appendChild(document.createTextNode(' '));

      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Open image';
      div.appendChild(a);
    }

    return div;
  }

  function makeImageFigure(node, visualElement, absoluteUrl, alt) {
    /**
     * 画像要素を figure でラップし、元のノードと置換する。
     */
    const figure = document.createElement('figure');
    figure.className = 'md-renderer-image-figure';

    const link = document.createElement('a');
    link.href = absoluteUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.display = 'inline-block';
    link.style.maxWidth = '100%';

    link.appendChild(visualElement);
    figure.appendChild(link);

    if (alt) {
      const figcaption = document.createElement('figcaption');
      figcaption.textContent = alt;
      figure.appendChild(figcaption);
    }

    node.replaceWith(figure);

    return figure;
  }

  // ---------------------------------------------------------------------------
  // 画像表示戦略（優先順）:
  //   1. 直接 <img src="元URL"> — CSP が許可していれば最速・最も互換性が高い
  //   2. fetch API → blob URL — CORS 対応サーバなら動作、CSP img-src を回避
  //   3. GM_xmlhttpRequest → blob/data URL — CORS 非対応でも動作（デスクトップ向け）
  //   4. エラー表示
  //
  // iPad Safari の Userscripts 拡張では GM_xmlhttpRequest の
  // responseType: blob/arraybuffer 指定時にコールバックがサイレントフェイルする
  // 既知の問題があるため、GM_xmlhttpRequest は最終手段とする。
  // ---------------------------------------------------------------------------

  function tryDirectImage(absoluteUrl, alt, title) {
    /**
     * 直接 <img src="元URL"> で表示を試みる。
     * CSP が img-src を制限していなければこれだけで十分。
     */
    return new Promise((resolve, reject) => {
      const image = document.createElement('img');
      image.className = 'md-renderer-blob-image';
      image.alt = alt || '';
      image.title = title || alt || '';
      image.decoding = 'async';
      image.style.background = CONFIG.imageCanvasBackground || '#ffffff';

      image.onload = () => {
        console.info('[md-renderer] image rendered via direct img:', absoluteUrl);
        resolve(image);
      };

      image.onerror = () => {
        reject(new Error('Direct <img> loading failed (likely CSP block).'));
      };

      image.src = absoluteUrl;
    });
  }

  async function tryFetchBlobImage(absoluteUrl, alt, title) {
    /**
     * fetch API で画像を取得し、blob URL の <img> として表示する。
     * CORS 対応サーバの画像であれば CSP の img-src 制限を回避できる。
     */
    const response = await fetch(absoluteUrl, { mode: 'cors', credentials: 'omit' });

    if (!response.ok) {
      throw new Error(`fetch failed: HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    mdRendererObjectUrls.push(objectUrl);

    return new Promise((resolve, reject) => {
      const image = document.createElement('img');
      image.className = 'md-renderer-blob-image';
      image.alt = alt || '';
      image.title = title || alt || '';
      image.decoding = 'async';
      image.style.background = CONFIG.imageCanvasBackground || '#ffffff';

      image.onload = () => {
        console.info('[md-renderer] image rendered via fetch+blob:', absoluteUrl);
        resolve(image);
      };

      image.onerror = () => {
        reject(new Error('fetch+blob image rendering failed.'));
      };

      image.src = objectUrl;
    });
  }

  function gmRequestBlob(url) {
    /**
     * GM_xmlhttpRequest で画像を取得し Blob として返す。
     * コールバックがサイレントフェイルする拡張向けに独自タイムアウトを設定。
     */
    return new Promise((resolve, reject) => {
      const request =
        typeof GM_xmlhttpRequest === 'function'
          ? GM_xmlhttpRequest
          : window.GM?.xmlHttpRequest;

      if (!request) {
        reject(new Error('GM_xmlhttpRequest is not available.'));
        return;
      }

      let settled = false;

      const settle = (fn) => {
        if (settled) return;
        settled = true;
        fn();
      };

      // コールバックが一切発火しない場合の保護用タイムアウト（15秒）
      const fallbackTimer = setTimeout(() => {
        settle(() => reject(new Error('GM_xmlhttpRequest: no callback fired (silent failure).')));
      }, 15000);

      request({
        method: 'GET',
        url,
        responseType: 'blob',
        timeout: 30000,

        onload(response) {
          clearTimeout(fallbackTimer);

          settle(() => {
            if (response.status < 200 || response.status >= 300) {
              reject(new Error(`Image request failed: HTTP ${response.status}`));
              return;
            }

            const contentType =
              /^content-type:\s*([^;\n]+)/im.exec(response.responseHeaders || '')?.[1]?.trim() ||
              'application/octet-stream';

            let blob;

            if (response.response instanceof Blob) {
              blob = response.response;
            } else if (response.response instanceof ArrayBuffer) {
              blob = new Blob([response.response], { type: contentType });
            } else {
              blob = new Blob([response.response], { type: contentType });
            }

            resolve(blob);
          });
        },

        onerror() {
          clearTimeout(fallbackTimer);
          settle(() => reject(new Error('Image request failed.')));
        },

        ontimeout() {
          clearTimeout(fallbackTimer);
          settle(() => reject(new Error('Image request timed out.')));
        },
      });
    });
  }

  async function tryGmImage(absoluteUrl, alt, title) {
    /**
     * GM_xmlhttpRequest で画像を取得し、blob URL → data URL の順で <img> 表示を試みる。
     */
    const blob = await gmRequestBlob(absoluteUrl);
    const objectUrl = URL.createObjectURL(blob);
    mdRendererObjectUrls.push(objectUrl);

    return new Promise((resolve, reject) => {
      const image = document.createElement('img');
      image.className = 'md-renderer-blob-image';
      image.alt = alt || '';
      image.title = title || alt || '';
      image.decoding = 'async';
      image.style.background = CONFIG.imageCanvasBackground || '#ffffff';

      image.onload = () => {
        console.info('[md-renderer] image rendered via GM_xmlhttpRequest+blob:', absoluteUrl);
        resolve(image);
      };

      image.onerror = async () => {
        // blob: URL が CSP でブロックされた場合、data: URL にフォールバック
        console.warn('[md-renderer] blob: URL blocked, trying data: URL:', absoluteUrl);
        try {
          const reader = new FileReader();
          const dataUrl = await new Promise((res, rej) => {
            reader.onload = () => res(reader.result);
            reader.onerror = () => rej(new Error('FileReader failed.'));
            reader.readAsDataURL(blob);
          });
          image.onerror = () => {
            reject(new Error('GM blob+data URL image rendering failed.'));
          };
          image.src = dataUrl;
        } catch {
          reject(new Error('GM blob image rendering and data URL conversion failed.'));
        }
      };

      image.src = objectUrl;
    });
  }

  async function replaceImageRequestWithRenderableImage(requestNode, absoluteUrl, alt, title) {
    /**
     * 画像プレースホルダを実際の画像に置換する。
     * 4段階フォールバック: 直接img → fetch+blob → GM_xmlhttpRequest+blob/data → エラー
     */
    if (requestNode.dataset.mdRendererProxyStarted === '1') return;
    requestNode.dataset.mdRendererProxyStarted = '1';

    const placeholder = makeImagePlaceholder(
      'Loading image...',
      absoluteUrl
    );

    requestNode.replaceWith(placeholder);

    // 戦略1: 直接 <img src="元URL"> で表示（CSP 非制限環境向け）
    try {
      const image = await tryDirectImage(absoluteUrl, alt, title);
      makeImageFigure(placeholder, image, absoluteUrl, alt);
      return;
    } catch (e) {
      console.warn('[md-renderer] direct img failed:', absoluteUrl, e.message);
    }

    // 戦略2: fetch API → blob URL（CORS 対応サーバ向け）
    try {
      const image = await tryFetchBlobImage(absoluteUrl, alt, title);
      makeImageFigure(placeholder, image, absoluteUrl, alt);
      return;
    } catch (e) {
      console.warn('[md-renderer] fetch+blob failed:', absoluteUrl, e.message);
    }

    // 戦略3: GM_xmlhttpRequest → blob/data URL（デスクトップ向けフォールバック）
    try {
      const image = await tryGmImage(absoluteUrl, alt, title);
      makeImageFigure(placeholder, image, absoluteUrl, alt);
      return;
    } catch (e) {
      console.warn('[md-renderer] GM_xmlhttpRequest failed:', absoluteUrl, e.message);
    }

    // すべて失敗
    console.error('[md-renderer] all image strategies failed:', absoluteUrl);
    const failed = makeImagePlaceholder('Image could not be rendered.', absoluteUrl);
    placeholder.replaceWith(failed);
  }

  function postProcessImages(root) {
    root
      .querySelectorAll('.md-renderer-image-request[data-md-image-src]')
      .forEach((node) => {
        const src = node.getAttribute('data-md-image-src') || '';
        const alt = node.getAttribute('data-md-image-alt') || '';
        const title = node.getAttribute('data-md-image-title') || '';

        let absoluteUrl;

        try {
          absoluteUrl = new URL(src, location.href).href;
        } catch {
          const failed = makeImagePlaceholder('Invalid image URL.', src);
          node.replaceWith(failed);
          return;
        }

        replaceImageRequestWithRenderableImage(node, absoluteUrl, alt, title);
      });
  }

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
        GM_addStyle(css);
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

  async function renderPage(markdown) {
    configureMarked();

    const rawHtml = window.marked.parse(markdown);
    const safeHtml = sanitizeHtml(rawHtml);

    const fileName = decodeURIComponent(
      location.pathname.split('/').pop() || 'Markdown'
    );

    document.title = `Markdown: ${fileName}`;
    document.documentElement.classList.add('md-renderer-active');
    document.body.classList.add('md-renderer-body');

    document.body.innerHTML = `
      <main class="md-renderer-shell">
        <header class="md-renderer-header">
          <div>
            <div class="md-renderer-eyebrow">Rendered Markdown</div>
            <h1 class="md-renderer-title">${escapeHtml(fileName)}</h1>
          </div>
          <button type="button" class="md-renderer-button" id="md-renderer-toggle-raw">
            Toggle Raw
          </button>
        </header>

        <article id="md-renderer-content" class="md-renderer-content">
          ${safeHtml}
        </article>

        <details class="md-renderer-raw" id="md-renderer-raw">
          <summary>Raw Markdown</summary>
          <pre><code>${escapeHtml(markdown)}</code></pre>
        </details>
      </main>
    `;

    const contentRoot = document.getElementById('md-renderer-content');
    const rawDetails = document.getElementById('md-renderer-raw');
    const toggleRaw = document.getElementById('md-renderer-toggle-raw');

    postProcessLinks(contentRoot);
    postProcessImages(contentRoot);
    await renderMath(contentRoot);

    toggleRaw.addEventListener('click', () => {
      rawDetails.open = !rawDetails.open;
    });

    console.info('[md-renderer] rendered successfully');
  }

  async function main() {
    if (!hasRequiredLibraries()) {
      console.error('[md-renderer] Required libraries are missing.', {
        marked: !!window.marked,
        DOMPurify: !!window.DOMPurify,
        MathJax: !!window.MathJax,
      });
      return;
    }

    const markdown = getRawMarkdown();

    if (!markdown.trim()) {
      console.warn('[md-renderer] Markdown body is empty.');
      return;
    }

    addCss();
    await renderPage(markdown);
  }

  main().catch((error) => {
    console.error('[md-renderer] Fatal error:', error);
  });
})();