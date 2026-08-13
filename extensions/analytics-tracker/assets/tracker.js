(function() {
  const PROXY_URL = '/apps/blog-analytics';

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

  function getSourcePostId() {
    return sessionStorage.getItem('blogger_source_post_id');
  }

  function setSourcePostId(id) {
    if (id) {
      sessionStorage.setItem('blogger_source_post_id', id);
    }
  }

  // Carries attribution through Shopify's checkout for stores where checkout/thank-you pages
  // are Shopify-hosted and never load this script at all (standard, non-Plus stores). Cart
  // attributes are Shopify's own mechanism for exactly this: they survive through checkout
  // untouched and land in the resulting order's note_attributes, where a server-side webhook
  // (orders/create) reads them back out — no client script needs to run anywhere near checkout.
  // Fire-and-forget; /cart/update.js auto-creates a cart if none exists yet, so this is safe to
  // call before any item has been added.
  function writeCartAttribute(postId) {
    fetch('/cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attributes: { blogger_source_post_id: String(postId) } })
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
    // resolves the post ID so funnel events below can still be attributed correctly.
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
        if (data && data.postId) {
          setSourcePostId(data.postId); // Store internal ID for funnel events
          writeCartAttribute(data.postId); // Carries attribution through checkout server-side
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

  // --- Bug 2: Patch Fetch Interceptor Crash ---
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    try {
      const response = await originalFetch.apply(this, args);
      const urlArg = args[0];
      let urlStr = "";

      // Safely extract URL whether it's a string or a Request object
      if (typeof urlArg === 'string') {
        urlStr = urlArg;
      } else if (urlArg instanceof Request) {
        urlStr = urlArg.url;
      }

      if (urlStr && urlStr.includes('/cart/add')) {
        const postId = getSourcePostId();
        if (postId) sendEvent(postId, 'add_to_cart');
      }
      return response;
    } catch (e) {
      // Re-throw to not break storefront functionality if fetch naturally fails
      throw e;
    }
  };

  // --- Bug 3: Add Legacy AJAX (XMLHttpRequest) Fallback ---
  const originalXHR = window.XMLHttpRequest.prototype.open;
  window.XMLHttpRequest.prototype.open = function(method, url) {
    if (typeof url === 'string' && url.includes('/cart/add')) {
      this.addEventListener('load', function() {
        const postId = getSourcePostId();
        if (postId) sendEvent(postId, 'add_to_cart');
      });
    }
    return originalXHR.apply(this, arguments);
  };

  // 4. Track Add To Cart via standard Form Submit
  document.addEventListener('submit', function(e) {
    if (e.target.action && e.target.action.includes('/cart/add')) {
      const postId = getSourcePostId();
      if (postId) sendEvent(postId, 'add_to_cart');
    }
  });

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
  if (window.location.pathname.includes('/checkout') && !window.location.pathname.includes('/thank_you')) {
    if (!sessionStorage.getItem('blogger_tracked_checkout')) {
      const postId = getSourcePostId();
      if (postId) {
        sendEvent(postId, 'checkout');
        markCheckoutTracked();
      }
    }
  }

  // 6. Track Conversions on Order Status (Thank You) page
  if (window.location.pathname.includes('/thank_you') || window.location.pathname.includes('/orders/')) {
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
