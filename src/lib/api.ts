import type {
  BootstrapPayload,
  Breed,
  Conversation,
  Listing,
  Message,
  PriceOffer,
  Report,
  SellerProfile,
  SellerReview,
  User,
} from '../types/marketplace';

let csrfToken: string | null = null;

/** Called whenever the server hands out a (new) CSRF token: bootstrap, login, register. */
export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

async function apiFetch<T>(url: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  // Identity comes only from the HttpOnly session cookie; the client never states who it is.
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      credentials: 'same-origin',
      headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
    });
  } catch {
    // Offline / server down / blocked request: show a clear Arabic message instead of the browser's raw "Failed to fetch".
    throw new Error('تعذر الاتصال بالخادم، تحقق من اتصالك بالإنترنت وحاول مرة أخرى');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Stale CSRF token (e.g. server restarted): fetch a fresh one once and retry.
    if (res.status === 403 && data?.code === 'bad_csrf' && !isRetry) {
      const me = await fetch('/api/v1/auth/me', { credentials: 'same-origin' })
        .then((r) => r.json())
        .catch(() => null);
      if (me?.csrfToken) {
        csrfToken = me.csrfToken;
        return apiFetch<T>(url, options, true);
      }
    }
    // Session ended (expired / revoked): let the app return to the signed-out state.
    if (res.status === 401 && data?.code === 'unauthenticated') {
      window.dispatchEvent(new CustomEvent('souq:unauthenticated'));
    }
    throw new Error(data?.error || 'حدث خطأ أثناء الاتصال بالخادم');
  }
  return data;
}

export const api = {
  bootstrap: () => apiFetch<BootstrapPayload>('/api/v1/bootstrap'),

  login: (payload: { phone: string; password: string }) =>
    apiFetch<{ user: User; csrfToken: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  register: (payload: { name: string; phone: string; password: string; role: 'buyer' | 'seller' }) =>
    apiFetch<{ user: User; csrfToken: string }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () => apiFetch<{ ok: boolean }>('/api/v1/auth/logout', { method: 'POST' }),

  getListings: (params: Record<string, string | number | boolean | undefined> = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '' && v !== 'all') {
        search.set(k, String(v));
      }
    });
    const qs = search.toString();
    return apiFetch<{ listings: Listing[] }>(`/api/v1/listings${qs ? `?${qs}` : ''}`);
  },

  createListing: (payload: Record<string, unknown>) =>
    apiFetch<{ listing: Listing }>('/api/v1/listings', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateListing: (id: string, payload: Record<string, unknown>) =>
    apiFetch<{ listing: Listing }>(`/api/v1/listings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  toggleFavorite: (listingId: string) =>
    apiFetch<{ favoriteIds: string[]; isFavorite: boolean }>('/api/v1/favorites/toggle', {
      method: 'POST',
      body: JSON.stringify({ listingId }),
    }),

  startConversation: (listingId: string, initialMessage?: string) =>
    apiFetch<{ conversation: Conversation }>('/api/v1/conversations', {
      method: 'POST',
      body: JSON.stringify({ listingId, initialMessage }),
    }),

  sendMessage: (conversationId: string, body: string) =>
    apiFetch<{ message: Message; conversation: Conversation }>(
      `/api/v1/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({ body }),
      }
    ),

  submitPriceOffer: (
    listingId: string,
    payload: { offeredPrice: number; quantity: number; note: string }
  ) =>
    apiFetch<{ offer: PriceOffer }>(`/api/v1/listings/${listingId}/offers`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  respondToOffer: (offerId: string, status: 'accepted' | 'rejected') =>
    apiFetch<{ offer: PriceOffer }>(`/api/v1/offers/${offerId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),

  createReport: (listingId: string, reason: string, details: string) =>
    apiFetch<{ report: Report }>('/api/v1/reports', {
      method: 'POST',
      body: JSON.stringify({ listingId, reason, details }),
    }),

  approveListing: (id: string) =>
    apiFetch<{ listing: Listing }>(`/api/v1/admin/listings/${id}/approve`, {
      method: 'POST',
    }),

  rejectListing: (id: string, reason: string) =>
    apiFetch<{ listing: Listing }>(`/api/v1/admin/listings/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  resolveReport: (id: string, status: 'resolved' | 'dismissed') =>
    apiFetch<{ report: Report }>(`/api/v1/admin/reports/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),

  createBreed: (payload: {
    name: string;
    categoryId: string;
    origin: string;
    summary: string;
    avgWeightKg: string;
    priceRangeSar: string;
  }) =>
    apiFetch<{ breed: Breed }>('/api/v1/admin/breeds', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createSubCategory: (payload: {
    name: string;
    parentId: string;
    description: string;
    keywords: string;
  }) =>
    apiFetch<{ category: import('../types/marketplace').Category }>('/api/v1/admin/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateSubCategory: (
    id: string,
    payload: {
      name: string;
      parentId: string;
      description: string;
      keywords: string;
    }
  ) =>
    apiFetch<{ category: import('../types/marketplace').Category }>(
      `/api/v1/admin/categories/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    ),

  deleteSubCategory: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/v1/admin/categories/${id}`, {
      method: 'DELETE',
    }),

  autoCategorizeListings: (payload: { listingId?: string; subCategoryId?: string } = {}) =>
    apiFetch<{ updatedCount: number }>('/api/v1/admin/listings/auto-categorize', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  markNotificationRead: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/v1/notifications/${id}/read`, {
      method: 'POST',
    }),

  markAllNotificationsRead: () =>
    apiFetch<{ ok: boolean }>('/api/v1/notifications/read-all', {
      method: 'POST',
    }),

  submitSellerReview: (sellerId: string, payload: { rating: number; comment: string }) =>
    apiFetch<{ review: SellerReview; seller: SellerProfile; reviews: SellerReview[] }>(
      `/api/v1/sellers/${sellerId}/reviews`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),
};
