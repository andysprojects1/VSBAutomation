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
    const mode = this.config.soldSearchMode || 'web';
    if (mode === 'web') {
      return this.searchSoldWebListings(query);
    }

    if (mode === 'hybrid') {
      const webListings = await this.searchSoldWebListings(query);
      if (webListings.length) return webListings;
      return this.searchSoldListingsViaApi(query);
    }

    return this.searchSoldListingsViaApi(query);
  }

  async searchSoldListingsViaApi(query) {
    const listings = [];

    if (this.isConfigured()) {
      try {
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
        listings.push(...(data.itemSales ?? []).map((item) => mapSaleItem(item, query.queryText)));
      } catch (error) {
        log.warn('eBay Marketplace Insights sold search failed. Trying completed-items fallback.', {
          query: query.queryText,
          error: error.message
        });
      }
    } else {
      log.warn('eBay OAuth credentials missing, skipping Marketplace Insights sold search.');
    }

    if (!listings.length) {
      listings.push(...await this.searchCompletedListings(query));
    }

    if (!listings.length && this.config.enableWebSoldFallback) {
      listings.push(...await this.searchSoldWebListings(query));
    }

    return listings;
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

  async searchCompletedListings(query) {
    if (!this.config.appId) {
      log.warn('eBay App ID missing, skipping Finding completed-items fallback.');
      return [];
    }

    const url = new URL(this.config.findingUrl);
    url.searchParams.set('OPERATION-NAME', 'findCompletedItems');
    url.searchParams.set('SERVICE-VERSION', '1.13.0');
    url.searchParams.set('SECURITY-APPNAME', this.config.appId);
    url.searchParams.set('RESPONSE-DATA-FORMAT', 'JSON');
    url.searchParams.set('REST-PAYLOAD', '');
    url.searchParams.set('keywords', query.queryText);
    url.searchParams.set('paginationInput.entriesPerPage', String(Math.min(this.config.maxCompsPerQuery, 25)));
    url.searchParams.set('itemFilter(0).name', 'SoldItemsOnly');
    url.searchParams.set('itemFilter(0).value', 'true');
    url.searchParams.set('sortOrder', 'EndTimeSoonest');
    if (this.config.categoryIds[0]) {
      url.searchParams.set('categoryId', this.config.categoryIds[0]);
    }

    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Finding API failed (${response.status}): ${text.slice(0, 300)}`);
      }
      const data = JSON.parse(text);
      const apiResponse = data.findCompletedItemsResponse?.[0];
      const ack = apiResponse?.ack?.[0];
      if (ack && ack !== 'Success' && ack !== 'Warning') {
        throw new Error(`Finding API ${ack}: ${JSON.stringify(apiResponse?.errorMessage ?? {}).slice(0, 300)}`);
      }
      const items = apiResponse?.searchResult?.[0]?.item ?? [];
      return items.map((item) => mapFindingItem(item, query.queryText)).filter((listing) => listing.price != null);
    } catch (error) {
      log.warn('eBay Finding completed-items fallback failed.', {
        query: query.queryText,
        error: error.message
      });
      return [];
    }
  }

  async searchSoldWebListings(query) {
    const url = new URL('https://www.ebay.com/sch/i.html');
    url.searchParams.set('_nkw', query.queryText);
    url.searchParams.set('LH_Sold', '1');
    url.searchParams.set('LH_Complete', '1');
    url.searchParams.set('_sacat', this.config.webSoldCategoryId ?? '0');
    url.searchParams.set('_sop', '13');

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      const html = await response.text();
      if (!response.ok) {
        throw new Error(`eBay sold web search failed (${response.status}). Search manually: ${url.toString()}`);
      }
      return parseSoldSearchHtml(html, query.queryText, url.toString()).slice(0, this.config.maxCompsPerQuery);
    } catch (error) {
      log.warn('eBay sold web fallback failed.', {
        query: query.queryText,
        error: error.message,
        soldSearchUrl: url.toString()
      });
      return [];
    }
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

function mapFindingItem(item, queryText) {
  const externalId = item.itemId?.[0] ?? item.viewItemURL?.[0] ?? item.title?.[0];
  const priceObject = item.sellingStatus?.[0]?.convertedCurrentPrice?.[0] ?? item.sellingStatus?.[0]?.currentPrice?.[0];
  const sellingState = item.sellingStatus?.[0]?.sellingState?.[0] ?? '';
  return {
    id: `lst_ebay_finding_${Buffer.from(String(externalId)).toString('base64url').slice(0, 24)}`,
    source: 'ebay_finding_completed',
    externalSourceId: String(externalId),
    url: item.viewItemURL?.[0] ?? null,
    title: item.title?.[0] ?? 'Untitled eBay completed sale',
    description: item.subtitle?.[0] ?? '',
    price: parseMoney(priceObject?.__value__),
    currency: priceObject?.['@currencyId'] ?? 'USD',
    sold: sellingState === 'EndedWithSales' || sellingState === 'Ended',
    soldDate: item.listingInfo?.[0]?.endTime?.[0] ?? null,
    imageUrls: [item.galleryURL?.[0], item.pictureURLLarge?.[0], item.pictureURLSuperSize?.[0]].filter(Boolean),
    rawPayload: { ...item, queryText }
  };
}

function parseSoldSearchHtml(html, queryText, soldSearchUrl) {
  const items = html.match(/<li[^>]+class="[^"]*s-item[^"]*"[\s\S]*?<\/li>/g) ?? [];
  return items.map((block, index) => {
    const title = decodeHtml(extractFirst(block, /class="[^"]*s-item__title[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i));
    const priceText = decodeHtml(extractFirst(block, /class="[^"]*s-item__price[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i));
    const url = decodeHtml(extractFirst(block, /class="[^"]*s-item__link[^"]*"[^>]*href="([^"]+)"/i));
    const image = decodeHtml(extractFirst(block, /class="[^"]*s-item__image-img[^"]*"[^>]*src="([^"]+)"/i));
    const soldDate = decodeHtml(extractFirst(block, /class="[^"]*s-item__title--tagblock[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i));
    const price = parseMoney(priceText);
    if (!title || title === 'Shop on eBay' || price == null) return null;
    return {
      id: `lst_ebay_web_${Buffer.from(`${url || title}-${index}`).toString('base64url').slice(0, 24)}`,
      source: 'ebay_sold_search',
      externalSourceId: url || `${queryText}-${index}`,
      url: url || soldSearchUrl,
      title,
      description: soldDate,
      price,
      currency: priceText.includes('GBP') ? 'GBP' : priceText.includes('EUR') ? 'EUR' : 'USD',
      sold: true,
      soldDate: null,
      imageUrls: image ? [image] : [],
      rawPayload: { queryText, soldSearchUrl, priceText, soldDate }
    };
  }).filter(Boolean);
}

function extractFirst(text, regex) {
  const match = text.match(regex);
  return match?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
}

function decodeHtml(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}
