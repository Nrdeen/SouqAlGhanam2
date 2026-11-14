/** Pure authorization rules. Routes call these; they never trust anything the client says about identity. */

export interface Actor {
  id: string;
  role: 'buyer' | 'seller' | 'admin';
  status?: string;
}

export const isAdmin = (u: Actor | null | undefined) => !!u && u.role === 'admin';

export function canViewListing(u: Actor | null, listing: { sellerId: string; status: string }): boolean {
  if (listing.status === 'Published') return true;
  if (!u) return false;
  return u.id === listing.sellerId || isAdmin(u);
}

export function canEditListing(u: Actor | null, listing: { sellerId: string }): boolean {
  return !!u && (u.id === listing.sellerId || isAdmin(u));
}

export function canAccessConversation(u: Actor | null, conv: { buyerId: string; sellerId: string }): boolean {
  return !!u && (u.id === conv.buyerId || u.id === conv.sellerId);
}

export function canRespondToOffer(u: Actor | null, offer: { sellerId: string }): boolean {
  return !!u && (u.id === offer.sellerId || isAdmin(u));
}

export function visibleOffers<T extends { buyerId: string; sellerId: string }>(u: Actor | null, offers: T[]): T[] {
  if (!u) return [];
  if (isAdmin(u)) return offers;
  return offers.filter((o) => o.buyerId === u.id || o.sellerId === u.id);
}

export function visibleConversations<T extends { buyerId: string; sellerId: string }>(u: Actor | null, convs: T[]): T[] {
  if (!u) return [];
  return convs.filter((c) => canAccessConversation(u, c));
}
