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
    fetch(`${PROXY_URL}/${postId}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: eventType,
        productId: window.BloggerAnalytics ? window.BloggerAnalytics.productId : null,
        value: value,
        currency: currency
      })
    }).catch(err => console.error("Analytics event failed", err));
  }

  // 1. Track Views on Article Pages
  if (window.BloggerAnalytics && window.BloggerAnalytics.template === 'article' && window.BloggerAnalytics.articleId) {
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
    .then(res => res.json())
    .then(data => {
      if (data && data.postId) {
        setSourcePostId(data.postId); // Store internal ID for funnel events
      }
    })
    .catch(e => console.error("Analytics view failed:", e));
  }

  // 2. Track Add To Cart via Fetch
  const originalFetch = window.fetch;
  window.fetch = async function() {
    const response = await originalFetch.apply(this, arguments);
    const url = arguments[0];
    if (typeof url === 'string' && url.includes('/cart/add.js')) {
      const postId = getSourcePostId();
      if (postId) sendEvent(postId, 'add_to_cart');
    }
    return response;
  };

  // 3. Track Add To Cart via standard Form Submit
  document.addEventListener('submit', function(e) {
    if (e.target.action && e.target.action.includes('/cart/add')) {
      const postId = getSourcePostId();
      if (postId) sendEvent(postId, 'add_to_cart');
    }
  });

  // 4. Track Checkout initiation
  // Wait for click on a checkout button
  document.addEventListener('click', function(e) {
    if (e.target.name === 'checkout' || (e.target.href && e.target.href.includes('/checkout'))) {
      const postId = getSourcePostId();
      if (postId) sendEvent(postId, 'checkout');
    }
  });

  // 5. Track Conversions on Order Status (Thank You) page
  if (window.Shopify && window.Shopify.Checkout && window.Shopify.Checkout.page === 'thank_you') {
    const postId = getSourcePostId();
    if (postId) {
       const revenue = Shopify.checkout ? Shopify.checkout.total_price : 0;
       const currency = Shopify.checkout ? Shopify.checkout.currency : 'USD';
       sendEvent(postId, 'conversion', revenue, currency);
       
       // Clear session after conversion
       sessionStorage.removeItem('blogger_source_post_id');
    }
  }

})();
