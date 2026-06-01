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

  function sendEvent(postId, eventType, value = 0, currency = 'USD') {
    if (!postId) return;
    fetch(`${PROXY_URL}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postId: postId,
        eventType: eventType,
        productId: window.BloggerAnalytics ? window.BloggerAnalytics.productId : null,
        value: value,
        currency: currency
      })
    }).catch(err => console.error("Analytics event failed", err));
  }

  // --- Bug 1: Fix Race Condition using Polling Initialization ---
  function initTracker() {
    if (!window.BloggerAnalytics || !window.BloggerAnalytics.template) {
      setTimeout(initTracker, 50); // Poll until Liquid injects the script
      return;
    }

    // 1. Track Views on Article Pages
    if (window.BloggerAnalytics.template === 'article' && window.BloggerAnalytics.articleId) {
      const articleId = window.BloggerAnalytics.articleId;
      
      fetch(`${PROXY_URL}/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopifyArticleId: articleId,
          userAgent: navigator.userAgent,
          referer: document.referrer,
          visitorHash: getSessionId()
        })
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
        }
      })
      .catch(e => console.error("Analytics view failed:", e));
    }
  }

  // Boot the tracker safely
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTracker);
  } else {
    initTracker();
  }

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
  // Wait for click on a checkout button
  document.addEventListener('click', function(e) {
    const checkoutEl = e.target.closest('[name="checkout"], a[href*="/checkout"]');
    if (checkoutEl) {
      const postId = getSourcePostId();
      if (postId) sendEvent(postId, 'checkout');
    }
  });

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
