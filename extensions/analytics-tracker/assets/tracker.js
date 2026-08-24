(function() {
  const PROXY_URL = '/apps/blog-analytics';

  // How long a "candidate" blog-post visit stays eligible to be CONFIRMED as the source of a
  // later add-to-cart, and separately, how long a CONFIRMED attribution stays eligible to credit
  // a later checkout/conversion. Both here (sessionStorage) and server-side (the cart attribute
  // read by ORDERS_CREATE/CHECKOUTS_CREATE in index.js) MUST use this exact same window.
  const ATTRIBUTION_TTL_MS = 30 * 60 * 1000;

  function generateHash() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  function getSessionId() {
    let sid = sessionStorage.getItem('blogger_analytics_sid');
    if (!sid) {
      sid = generateHash();
      sessionStorage.setItem('blogger_analytics_sid', sid);
    }
    return sid;
  }

  // ── CONFIRMED attribution — set ONLY by a genuine matched add-to-cart (see below), never by
  // merely viewing an article. This is what checkout/conversion tracking reads. ──────────────
  function getSourcePostId() {
    const id = sessionStorage.getItem('blogger_source_post_id');
    if (!id) return null;
    const ts = Number(sessionStorage.getItem('blogger_source_post_ts') || 0);
    if (!ts || Date.now() - ts > ATTRIBUTION_TTL_MS) {
      sessionStorage.removeItem('blogger_source_post_id');
      sessionStorage.removeItem('blogger_source_post_ts');
      return null;
    }
    return id;
  }

  function confirmSourcePostId(id) {
    if (!id) return;
    sessionStorage.setItem('blogger_source_post_id', id);
    sessionStorage.setItem('blogger_source_post_ts', String(Date.now()));
  }

  // ── CANDIDATE attribution — refreshed on every article-page view. Represents "which post
  // might a purchase be credited to, IF the visitor goes on to add one of its featured products".
  // Never read directly by checkout/conversion tracking — only used to decide whether an
  // add-to-cart action should be promoted to a CONFIRMED attribution. ──────────────────────────
  function setCandidate(postId, productIds, variantIds) {
    sessionStorage.setItem('blogger_candidate_post_id', String(postId));
    sessionStorage.setItem('blogger_candidate_ts', String(Date.now()));
    sessionStorage.setItem('blogger_candidate_product_ids', JSON.stringify(productIds || []));
    sessionStorage.setItem('blogger_candidate_variant_ids', JSON.stringify(variantIds || []));
  }

  function getCandidate() {
    const postId = sessionStorage.getItem('blogger_candidate_post_id');
    if (!postId) return null;
    const ts = Number(sessionStorage.getItem('blogger_candidate_ts') || 0);
    if (!ts || Date.now() - ts > ATTRIBUTION_TTL_MS) return null;
    let productIds = [];
    let variantIds = [];
    try { productIds = JSON.parse(sessionStorage.getItem('blogger_candidate_product_ids') || '[]'); } catch (e) {}
    try { variantIds = JSON.parse(sessionStorage.getItem('blogger_candidate_variant_ids') || '[]'); } catch (e) {}
    return { postId: postId, productIds: productIds, variantIds: variantIds };
  }

  // Carries CONFIRMED attribution through Shopify's checkout for stores where checkout/thank-you
  // pages are Shopify-hosted and never load this script at all (standard, non-Plus stores). Cart
  // attributes are Shopify's own mechanism for exactly this: they survive through checkout
  // untouched and land in the resulting order's note_attributes, where a server-side webhook
  // (orders/create) reads them back out — no client script needs to run anywhere near checkout.
  // Only ever called once a matched add-to-cart has confirmed attribution (see below) — never on
  // a bare article view — so its mere presence on an order already implies product-relevance; the
  // server-side webhook doesn't need (and, per its own docblock, deliberately avoids requesting
  // access to) each order's line items to re-verify that.
  function writeCartAttribute(postId) {
    fetch('/cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attributes: { blogger_source_post_id: JSON.stringify({ postId: postId, ts: Date.now() }) } })
    }).catch(function () {});
  }

  function sendEvent(postId, eventType, value = 0, currency = 'USD') {
    if (!postId) return;
    const payload = JSON.stringify({
      postId: postId,
      eventType: eventType,
      productId: window.BloggerAnalytics ? window.BloggerAnalytics.productId : null,
      value: value,
      currency: currency
    });
    const url = `${PROXY_URL}/event`;
    // checkout/conversion fire right as the page is navigating away — a plain fetch() here is
    // routinely cancelled by the browser mid-flight when the page unloads before the response
    // arrives. keepalive:true is fetch's purpose-built answer to exactly that (request survives
    // page unload) while keeping the IDENTICAL request shape — same headers, same JSON body —
    // that was already proven working for add_to_cart. A prior version of this function tried
    // navigator.sendBeacon() instead, which sends the body as a Blob; that changed how the
    // request reaches this endpoint through Shopify's App Proxy and broke every event type
    // (not just checkout) rather than just fixing the one that needed it. keepalive fixes the
    // actual problem (survive unload) without changing anything else about the request.
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true
    }).catch(err => console.error("Analytics event failed", err));
  }

  // --- Bug 1: Fix Race Condition using Polling Initialization ---
  function initTracker() {
    if (!window.BloggerAnalytics || !window.BloggerAnalytics.template) {
      setTimeout(initTracker, 50); // Poll until Liquid injects the script
      return;
    }

    // 1. Resolve the internal post ID on Article Pages (NOT a view — the article's own
    // embedded pixel/script, baked into body_html by ArticleSyncService, already counts the
    // view unconditionally on every load with zero merchant setup required. This tracker is
    // opt-in per merchant (theme app embed), so it previously ALSO counted a view here,
    // double-counting every article view whenever a merchant had the embed enabled. This only
    // resolves the post ID (and its featured products) so funnel events below can be attributed
    // to the right post AND restricted to purchases that actually involve what's in it.
    if (window.BloggerAnalytics.template === 'article' && window.BloggerAnalytics.articleId) {
      const articleId = window.BloggerAnalytics.articleId;

      fetch(`${PROXY_URL}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopifyArticleId: articleId })
      })
      .then(res => {
        const contentType = res.headers.get("content-type");
        if (!res.ok || !contentType || !contentType.includes("application/json")) {
          throw new Error(`Invalid response (status: ${res.status}, type: ${contentType})`);
        }
        return res.json();
      })
      .then(data => {
        // Viewing the post only ever makes it a CANDIDATE — attribution isn't confirmed (and
        // nothing is written to the cart) until a matching add-to-cart actually happens. This is
        // what stops an unrelated purchase made later in the same session/cart from silently
        // being counted as blog-driven, which is exactly what "any checkout on the site
        // increments revenue" turned out to be caused by.
        if (data && data.postId) {
          setCandidate(data.postId, data.productIds, data.variantIds);
        }
      })
      .catch(e => console.error("Analytics resolve failed:", e));
    }
  }

  // Boot the tracker safely
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTracker);
  } else {
    initTracker();
  }

  // add_to_cart reporting lives ONLY here now (fetch/XHR/submit interception), not duplicated in
  // BlockRenderer.js's article-embedded slider script. That script used to report directly too,
  // using an absolute URL baked into the article at sync time — when the dev tunnel rotated after
  // sync, that baked URL went dead, and worse, it had already set a suppression flag telling
  // *this* interceptor (which uses a stable, relative /apps/... URL immune to tunnel rotation) to
  // skip its own report — so a single stale sync silently killed add_to_cart tracking entirely,
  // with no fallback. One reliable mechanism beats two mechanisms that can disable each other.

  // Extracts the variant id(s) a /cart/add request is actually adding, from whatever shape the
  // request body happens to be in (Shopify's AJAX Cart API accepts all of these). Returns an
  // array of strings; empty if the shape can't be parsed — callers treat "couldn't verify" as "no
  // match" rather than assuming a match, since the whole point of this is to stop over-crediting.
  function extractVariantIdsFromCartAddBody(body) {
    if (!body) return [];
    try {
      if (typeof body === 'string') {
        try {
          const json = JSON.parse(body);
          if (Array.isArray(json.items)) return json.items.map(function (i) { return String(i.id); });
          if (json.id != null) return [String(json.id)];
        } catch (e) {
          const params = new URLSearchParams(body);
          const id = params.get('id');
          if (id) return [id];
        }
      } else if (typeof FormData !== 'undefined' && body instanceof FormData) {
        const id = body.get('id');
        if (id) return [String(id)];
      } else if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
        const id = body.get('id');
        if (id) return [id];
      }
    } catch (e) {}
    return [];
  }

  // The one place a candidate gets promoted to a confirmed attribution — called by every
  // add-to-cart interception point below with whatever variant id(s) it managed to extract.
  // Matches by variant id (what /cart/add actually receives), not product id, since a request
  // only ever carries the specific variant being added.
  //
  // Themes often both submit a /cart/add form AND fire fetch/XHR for the same add. Without a
  // short once-per-add guard, that records two add_to_cart events for one click.
  var lastAddToCartKey = null;
  var lastAddToCartAt = 0;
  var ADD_TO_CART_DEDUP_MS = 2500;

  function maybeConfirmFromAddToCart(variantIds) {
    const candidate = getCandidate();
    if (!candidate) return false;
    const matched = variantIds.length > 0 && variantIds.some(function (vid) {
      return candidate.variantIds.indexOf(vid) !== -1;
    });
    if (!matched) return false;

    var key = String(candidate.postId) + ':' + variantIds.map(String).sort().join(',');
    var now = Date.now();
    if (lastAddToCartKey === key && (now - lastAddToCartAt) < ADD_TO_CART_DEDUP_MS) {
      return true;
    }
    lastAddToCartKey = key;
    lastAddToCartAt = now;

    confirmSourcePostId(candidate.postId);
    writeCartAttribute(candidate.postId);
    sendEvent(candidate.postId, 'add_to_cart');
    return true;
  }

  // Resolve cart-add body for both fetch(url, { body }) and fetch(new Request(...)).
  // Must clone+read Request before the real fetch consumes its body stream.
  async function resolveFetchCartAddBody(args) {
    const init = args[1];
    if (init && init.body != null) return init.body;
    const urlArg = args[0];
    if (typeof Request !== 'undefined' && urlArg instanceof Request) {
      try {
        const cloned = urlArg.clone();
        const ct = (cloned.headers && cloned.headers.get('content-type')) || '';
        if (ct.indexOf('multipart/form-data') !== -1 || ct.indexOf('application/x-www-form-urlencoded') !== -1) {
          try {
            return await cloned.formData();
          } catch (e) {
            return await cloned.text();
          }
        }
        return await cloned.text();
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  // --- Bug 2: Patch Fetch Interceptor Crash ---
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const urlArg = args[0];
    let urlStr = "";
    if (typeof urlArg === 'string') {
      urlStr = urlArg;
    } else if (typeof Request !== 'undefined' && urlArg instanceof Request) {
      urlStr = urlArg.url;
    }

    let cartAddBody = null;
    if (urlStr && urlStr.includes('/cart/add')) {
      cartAddBody = await resolveFetchCartAddBody(args);
    }

    try {
      const response = await originalFetch.apply(this, args);
      if (urlStr && urlStr.includes('/cart/add') && response && response.ok) {
        maybeConfirmFromAddToCart(extractVariantIdsFromCartAddBody(cartAddBody));
      }
      return response;
    } catch (e) {
      // Re-throw to not break storefront functionality if fetch naturally fails
      throw e;
    }
  };

  // --- Bug 3: Add Legacy AJAX (XMLHttpRequest) Fallback ---
  const originalXHR = window.XMLHttpRequest.prototype.open;
  const originalXHRSend = window.XMLHttpRequest.prototype.send;
  window.XMLHttpRequest.prototype.open = function(method, url) {
    if (typeof url === 'string' && url.includes('/cart/add')) {
      this._blogger_isCartAdd = true;
    }
    return originalXHR.apply(this, arguments);
  };
  window.XMLHttpRequest.prototype.send = function(body) {
    if (this._blogger_isCartAdd) {
      const self = this;
      this.addEventListener('load', function() {
        if (self.status >= 200 && self.status < 300) {
          maybeConfirmFromAddToCart(extractVariantIdsFromCartAddBody(body));
        }
      });
    }
    return originalXHRSend.apply(this, arguments);
  };

  // 4. Native /cart/add form submit — do NOT confirm here. Fetch/XHR wait for HTTP 2xx;
  // submit fires before the POST, so preventDefault (theme AJAX) or a failed add would
  // still promote the candidate, write the cart attribute, and record add_to_cart.
  // If another handler already preventDefault'd, those interceptors confirm on success.
  // If the browser continues with a native POST, Shopify redirects to /cart (or checkout)
  // on success and stays on the product page on failure — consume the pending flag then.
  var PENDING_NATIVE_CART_ADD_KEY = 'blogger_pending_cart_add';
  var PENDING_NATIVE_CART_ADD_MS = 20000;

  function pathLooksLikeCartOrCheckout() {
    var path = window.location.pathname || '';
    return path === '/cart' || /\/cart\/?$/.test(path) || path.indexOf('/checkout') !== -1;
  }

  function consumePendingNativeCartAdd() {
    try {
      var raw = sessionStorage.getItem(PENDING_NATIVE_CART_ADD_KEY);
      sessionStorage.removeItem(PENDING_NATIVE_CART_ADD_KEY);
      if (!raw) return;
      var pending = JSON.parse(raw);
      if (!pending || !pending.variantIds || (Date.now() - pending.at) > PENDING_NATIVE_CART_ADD_MS) return;
      if (pathLooksLikeCartOrCheckout()) {
        maybeConfirmFromAddToCart(pending.variantIds);
      }
    } catch (err) {}
  }

  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form || (form.tagName || '').toUpperCase() !== 'FORM') return;
    var action = String(form.action || form.getAttribute('action') || '');
    if (action.indexOf('/cart/add') === -1) return;
    if (e.defaultPrevented) return;
    try {
      sessionStorage.setItem(PENDING_NATIVE_CART_ADD_KEY, JSON.stringify({
        variantIds: extractVariantIdsFromCartAddBody(new FormData(form)),
        at: Date.now(),
      }));
    } catch (err) {}
  });

  consumePendingNativeCartAdd();
  window.addEventListener('pageshow', consumePendingNativeCartAdd);

  // 5. Track Checkout initiation
  function markCheckoutTracked() {
    sessionStorage.setItem('blogger_tracked_checkout', 'true');
  }

  // Click-based detection: catches ordinary "Check out" buttons/links early, before navigation.
  // NOT sufficient on its own — accelerated checkout buttons (Shop Pay, Buy it now, PayPal, etc.)
  // render as a cross-origin iframe for PCI compliance, so a click inside them never bubbles to
  // this document's click listener at all. Confirmed in production: add_to_cart events were
  // recording correctly while checkouts stayed at 0 for a shop using one of these buttons.
  //
  // Two matchers, since we can't know every theme's exact markup:
  //  1. Attribute-based — Shopify's own standard cart form checkout button/link.
  //  2. Text-based fallback — many themes/custom cart drawers wrap or rename that button
  //     (framework components, renamed attributes, nested spans) so the attribute selector
  //     alone misses them; matching on visible "checkout"/"buy now" text on a clickable element
  //     catches those without needing to know the theme's specific markup.
  function isCheckoutTrigger(el) {
    if (!el) return false;
    if (el.closest('[name="checkout"], a[href*="/checkout"]')) return true;
    const clickable = el.closest('button, a, input[type="submit"], [role="button"]');
    if (!clickable) return false;
    const text = (clickable.innerText || clickable.value || clickable.getAttribute('aria-label') || '').trim().toLowerCase();
    if (!text) return false;
    return /\bcheck\s*out\b/.test(text) || /\bbuy(\s+it)?\s+now\b/.test(text);
  }

  document.addEventListener('click', function(e) {
    if (isCheckoutTrigger(e.target) && !sessionStorage.getItem('blogger_tracked_checkout')) {
      const postId = getSourcePostId();
      if (postId) {
        sendEvent(postId, 'checkout');
        markCheckoutTracked();
      }
    }
  });

  // Submit-based detection: Shopify's standard cart form posts to /cart (not /checkout — Shopify
  // redirects to checkout server-side after processing the cart), with the "Check out" button
  // itself carrying name="checkout". event.submitter identifies exactly which button triggered
  // the submit, regardless of how it's styled, wrapped, or nested — more reliable than guessing
  // at clickable-element structure the way the click listener above has to.
  document.addEventListener('submit', function(e) {
    if (sessionStorage.getItem('blogger_tracked_checkout')) return;
    var submitter = e.submitter;
    if (!submitter) return;
    var name = submitter.getAttribute('name') || '';
    var text = (submitter.innerText || submitter.value || '').trim().toLowerCase();
    var matches = name === 'checkout' || /\bcheck\s*out\b/.test(text) || /\bbuy(\s+it)?\s+now\b/.test(text);
    if (matches) {
      const postId = getSourcePostId();
      if (postId) {
        sendEvent(postId, 'checkout');
        markCheckoutTracked();
      }
    }
  });

  // URL-based detection: fires on any page load under /checkout(s) — robust regardless of HOW
  // the visitor got there (ordinary button, accelerated/iframe checkout button, JS redirect, back
  // button, direct URL). This is the same "check where we actually are" pattern already used for
  // the thank-you page below, and is what actually guarantees checkout gets counted.
  //
  // Note this (and the thank-you tracking below) only ever fires for a CONFIRMED attribution
  // (getSourcePostId) — i.e. only once a matching add-to-cart already happened this session. A
  // visitor who checks out with only unrelated products in their cart has no confirmed
  // attribution at all, so nothing is tracked here regardless of how recently they read a post.
  if (window.location.pathname.includes('/checkout') && !window.location.pathname.includes('/thank_you')) {
    if (!sessionStorage.getItem('blogger_tracked_checkout')) {
      const postId = getSourcePostId();
      if (postId) {
        sendEvent(postId, 'checkout');
        markCheckoutTracked();
      }
    }
  }

  // 6. Track Conversions on Order Status / Thank You page only.
  // Do NOT match `/account/orders/...` — that is customer order history and would fire a
  // conversion (often $0) whenever a attributed visitor opens past orders in-account.
  const path = window.location.pathname;
  const isThankYouPage = path.includes('/thank_you');
  const isCheckoutOrderStatusPage =
    !path.includes('/account/') && /\/orders\/[^/]+/.test(path);
  if (isThankYouPage || isCheckoutOrderStatusPage) {
    const trackedOrder = sessionStorage.getItem('blogger_tracked_order');
    if (!trackedOrder) {
      const postId = getSourcePostId();
      if (postId) {
        let revenue = 0;
        let currency = 'USD';

        if (window.Shopify && window.Shopify.checkout) {
          const priceStr = String(window.Shopify.checkout.total_price || '0');
          const parsedPrice = parseFloat(priceStr);
          // If it contains a dot, it's already a decimal (e.g. 10.00), otherwise it's cents (e.g. 1000)
          revenue = priceStr.includes('.') ? parsedPrice : parsedPrice / 100;
          currency = window.Shopify.checkout.currency || 'USD';
        } else {
          // Fallback: try to read from DOM for newer checkouts if theme embed runs there
          const totalEl = document.querySelector('.payment-due__price, [data-checkout-payment-due-target], .total-recap__final-price');
          if (totalEl) {
            const priceText = totalEl.textContent.replace(/[^0-9.]/g, '');
            revenue = parseFloat(priceText) || 0;
          }
        }

        sendEvent(postId, 'conversion', revenue, currency);
        sessionStorage.setItem('blogger_tracked_order', 'true');
        // Clear source post session after successful conversion
        sessionStorage.removeItem('blogger_source_post_id');
      }
    }
  }

})();
