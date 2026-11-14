export type UserRole = 'buyer' | 'seller' | 'admin';

export type ListingStatus = 'Draft' | 'Pending' | 'Published' | 'Rejected' | 'Sold' | 'Expired';

export type LivestockSex = 'ذكر' | 'أنثى' | 'قطيع مختلط';

export interface User {
  id: string;
  phone: string;
  email: string;
  name: string;
  role: UserRole;
  status: 'active' | 'suspended';
  createdAt: string;
  phoneVerified?: boolean;
}

export interface SellerProfile {
  userId: string;
  displayName: string;
  bio: string;
  regionId: string;
  city: string;
  /** Contact details are only returned by the server to signed-in users. */
  phone?: string;
  whatsapp?: string;
  verifiedAt: string | null;
  yearsExperience: number;
  specialty: string;
  rating: number;
  ratingCount?: number;
  totalSales: number;
}

export interface SellerReview {
  id: string;
  sellerId: string;
  reviewerId: string;
  reviewerName: string;
  rating: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description?: string;
  keywords?: string[];
}

export interface Breed {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  origin: string;
  summary: string;
  avgWeightKg: string;
  priceRangeSar: string;
  imageUrl: string;
  characteristics: string[];
}

export interface Region {
  id: string;
  name: string;
  parentId: string | null;
}

export interface ListingImage {
  id: string;
  url: string;
  position: number;
}

export interface Listing {
  id: string;
  sellerId: string;
  categoryId: string;
  subCategoryId?: string | null;
  breedId: string;
  regionId: string;
  city: string;
  title: string;
  slug: string;
  description: string;
  priceAmount: number;
  expectedPrice?: number | null;
  currency: 'SAR';
  sex: LivestockSex;
  ageMonths: number;
  weightKg: number;
  quantity: number;
  isNegotiable: boolean;
  allowPriceOffers?: boolean;
  vaccinated: boolean;
  status: ListingStatus;
  rejectionReason?: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  images: ListingImage[];
  isFeatured?: boolean;
}

export type PriceOfferStatus = 'pending' | 'accepted' | 'rejected';

export interface PriceOffer {
  id: string;
  listingId: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  offeredPrice: number;
  quantity: number;
  note: string;
  status: PriceOfferStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  updatedAt: string;
  messages: Message[];
}

export interface Report {
  id: string;
  reporterId: string;
  listingId: string;
  reason: string;
  details: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
}

export interface IndicativePrice {
  id: string;
  breedId: string;
  breedName: string;
  categoryName: string;
  ageGroup: string;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  trend: 'up' | 'stable' | 'down';
  regionNote: string;
  updatedAt: string;
}

export interface Article {
  id: string;
  title: string;
  category: string;
  readTimeMinutes: number;
  publishedAt: string;
  excerpt: string;
  content: string;
  imageUrl: string;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetType: 'listing' | 'report' | 'breed' | 'category' | 'offer';
  targetId: string;
  note?: string;
  createdAt: string;
}

export type NotificationType = 'offer_accepted' | 'offer_rejected' | 'new_message';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  listingId?: string;
  conversationId?: string;
  read: boolean;
  createdAt: string;
}

export interface BootstrapPayload {
  sellers: SellerProfile[];
  categories: Category[];
  breeds: Breed[];
  regions: Region[];
  indicativePrices: IndicativePrice[];
  articles: Article[];
  faqs: FAQ[];
  /** null for visitors who are not signed in. */
  currentUser: User | null;
  /** Session-bound CSRF token to send as X-CSRF-Token on state-changing requests. */
  csrfToken: string | null;
  favoriteIds: string[];
  conversations: Conversation[];
  priceOffers: PriceOffer[];
  notifications: AppNotification[];
  sellerReviews: SellerReview[];
  reports: Report[];
  auditLogs: AuditLog[];
}
