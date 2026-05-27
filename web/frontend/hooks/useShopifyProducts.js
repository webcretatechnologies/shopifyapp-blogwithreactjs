/**
 * useShopifyProducts.js
 *
 * Shared data-fetching hook for Shopify products and collections.
 * Used by ProductGridBlock, CollectionBlock, and BuyButtonBlock.
 *
 * Features:
 * - Debounced search query
 * - Local in-memory cache (per session) for repeated queries
 * - Loading / error state management
 * - Collection products fetching
 * - Store currency fetching
 */
import { useState, useEffect, useRef, useCallback } from 'react';

// Simple in-memory cache — cleared on full page reload
const _cache = new Map();
const _storeCurrencyCache = null; // Will be a promise

/**
 * Fetch the store's default currency code.
 * Cached after first fetch for the session lifetime.
 *
 * @returns {{ currencyCode: string, moneyFormat: string, moneyWithCurrencyFormat: string }}
 */
export function useShopifyStoreCurrency() {
  const [storeCurrency, setStoreCurrency] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchCurrency = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/posts/shopify/store');
        if (!res.ok) throw new Error('Failed to fetch store currency');
        const data = await res.json();
        if (!cancelled) {
          setStoreCurrency(data.currencyCode || 'USD');
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchCurrency();
    return () => { cancelled = true; };
  }, []);

  return { storeCurrency: storeCurrency || 'USD', isLoading, error };
}

/**
 * Fetch products with optional text search.
 * @param {string} query   - Shopify search query string
 * @param {number} limit   - Max results (default 20)
 */
export function useShopifyProducts(query = '', limit = 20) {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounceTimer = useRef(null);

  const fetchProducts = useCallback(async (q, l) => {
    const cacheKey = `products:${q}:${l}`;
    if (_cache.has(cacheKey)) {
      setProducts(_cache.get(cacheKey));
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ query: q, limit: l });
      const res = await fetch(`/api/posts/shopify/products?${params}`);
      if (!res.ok) throw new Error('Failed to fetch products');
      const data = await res.json();
      _cache.set(cacheKey, data.products || []);
      setProducts(data.products || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchProducts(query, limit);
    }, 350);
    return () => clearTimeout(debounceTimer.current);
  }, [query, limit, fetchProducts]);

  return { products, isLoading, error, refetch: () => fetchProducts(query, limit) };
}

/**
 * Fetch all collections.
 */
export function useShopifyCollections(query = '', limit = 30) {
  const [collections, setCollections] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const cacheKey = `collections:${query}:${limit}`;
    if (_cache.has(cacheKey)) {
      setCollections(_cache.get(cacheKey));
      return;
    }
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ query, limit });
    fetch(`/api/posts/shopify/collections?${params}`)
      .then(r => r.json())
      .then(data => {
        _cache.set(cacheKey, data.collections || []);
        setCollections(data.collections || []);
      })
      .catch(err => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [query, limit]);

  return { collections, isLoading, error };
}

/**
 * Fetch products for a specific collection by handle.
 */
export function useCollectionProducts(handle, limit = 12) {
  const [products, setProducts] = useState([]);
  const [collection, setCollection] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!handle) {
      setProducts([]);
      setCollection(null);
      return;
    }
    const cacheKey = `collection_products:${handle}:${limit}`;
    if (_cache.has(cacheKey)) {
      const cached = _cache.get(cacheKey);
      setCollection(cached.collection);
      setProducts(cached.products);
      return;
    }
    setIsLoading(true);
    setError(null);
    fetch(`/api/posts/shopify/collections/${handle}/products?limit=${limit}`)
      .then(r => r.json())
      .then(data => {
        _cache.set(cacheKey, data);
        setCollection(data.collection || null);
        setProducts(data.products || []);
      })
      .catch(err => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [handle, limit]);

  return { collection, products, isLoading, error };
}
