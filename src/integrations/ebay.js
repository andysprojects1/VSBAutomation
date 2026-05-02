import { createLogger } from '../utils/log.js';
import { parseMoney } from '../utils/money.js';

const log = createLogger('ebay');

export class EbayClient {
  constructor(config) {
    this.config = config;
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  isConfigured() {
    return Boolean(this.config.clientId && this.config.clientSecret);
  }

  async getAccessToken(scope) {
    if (!this.isConfigured()) {
      throw new Error('eBay client ID and secret are not configured.');
    }
    if (this.token && Date.now() < this.tokenExpiresAt - 60000) {
      return this.token;
    }

    const credentials = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      scope
    });

    const response = await fetch(this.config.oauthUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`eBay OAuth failed (${response.status}): ${text.slice(0, 300)}`);
    }

    const data = await response.json();
    this.token = data.access_token;
    this.tokenExpiresAt = Date.now() + ((data.expires_in ?? 7200) * 1000);
    return this.token;
  }

  async request(path, params, scope) {
    const token = await this.getAccessToken(scope);
    const url = new URL(`${this.config.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === '') continue;
      if (Array.isArray(value) && !value.length) continue;
      url.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': this.config.marketplaceId,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`eBay request failed (${response.status}): ${text.slice(0, 500)}`);
    }
    return response.json();
  }

  async searchSoldListings(query) {
    if (!this.isConfigured()) {
      log.warn('eBay credentials missing, skipping live sold search.');
      return [];
    }

    const params = {
      q: query.queryText,
      limit: this.config.maxCompsPerQuery,
      offset: 0
    };
    if (this.config.categoryIds.length) {
      params.category_ids = this.config.categoryIds;
    }

    const data = await this.request(
      '/buy/marketplace_insights/v1_beta/item_sales/search',
      params,
      'https://api.ebay.com/oauth/api_scope/buy.marketplace.insights'
    );

    return (data.itemSales ?? []).map((item) => mapSaleItem(item, query.queryText));
  }

  async searchActiveListings(query) {
    if (!this.isConfigured() || !this.config.enableActiveFallback) return [];
    const params = {
      q: query.queryText,
      limit: Math.min(this.config.maxCompsPerQuery, 10),
      offset: 0
    };
    if (this.config.categoryIds.length) {
      params.category_ids = this.config.categoryIds;
    }
    const data = await this.request(
      '/buy/browse/v1/item_summary/search',
      params,
      'https://api.ebay.com/oauth/api_scope'
    );
    return (data.itemSummaries ?? []).map((item) => mapActiveItem(item, query.queryText));
  }
}

function mapSaleItem(item, queryText) {
  const imageUrls = [
    item.image?.imageUrl,
    ...(item.additionalImages ?? []).map((image) => image.imageUrl)
  ].filter(Boolean);
  const externalId = item.itemId || item.legacyItemId || item.itemWebUrl;
  return {
    id: `lst_ebay_${Buffer.from(String(externalId)).toString('base64url').slice(0, 24)}`,
    source: 'ebay_marketplace_insights',
    externalSourceId: String(externalId),
    url: item.itemWebUrl ?? null,
    title: item.title ?? 'Untitled eBay sale',
    description: item.shortDescription ?? '',
    price: parseMoney(item.price ?? item.lastSoldPrice ?? item.currentBidPrice),
    currency: item.price?.currency ?? item.lastSoldPrice?.currency ?? 'USD',
    sold: true,
    soldDate: item.lastSoldDate ?? item.itemEndDate ?? null,
    imageUrls,
    rawPayload: { ...item, queryText }
  };
}

function mapActiveItem(item, queryText) {
  const imageUrls = [
    item.image?.imageUrl,
    ...(item.additionalImages ?? []).map((image) => image.imageUrl)
  ].filter(Boolean);
  const externalId = item.itemId || item.legacyItemId || item.itemWebUrl;
  return {
    id: `lst_ebay_active_${Buffer.from(String(externalId)).toString('base64url').slice(0, 24)}`,
    source: 'ebay_browse_active',
    externalSourceId: String(externalId),
    url: item.itemWebUrl ?? null,
    title: item.title ?? 'Untitled eBay active listing',
    description: item.shortDescription ?? '',
    price: parseMoney(item.price ?? item.currentBidPrice),
    currency: item.price?.currency ?? 'USD',
    sold: false,
    soldDate: null,
    imageUrls,
    rawPayload: { ...item, queryText, note: 'Active listing fallback. Not a sold comp.' }
  };
}
