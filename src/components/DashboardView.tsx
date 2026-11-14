import { lazy, Suspense, useEffect, useState } from 'react';
import { CheckCircle2, Pencil, Plus, Search, Send, Sparkles, Trash2, XCircle } from 'lucide-react';
import type {
  AuditLog,
  Breed,
  Category,
  Conversation,
  Listing,
  PriceOffer,
  Region,
  Report,
  SellerProfile,
  User,
} from '../types/marketplace';
import { formatPriceSar, formatRelativeArabicTime, formatStatusLabel } from '../lib/format';
import { ListingCard } from './ListingCard';
import { Modal } from './Modal';

// Recharts is heavy: the analytics charts are only fetched when an analytics/admin tab is opened.
const DashboardAnalytics = lazy(() =>
  import('./DashboardAnalytics').then((m) => ({ default: m.DashboardAnalytics })),
);

export type DashboardTab = 'my-listings' | 'favorites' | 'messages' | 'analytics' | 'admin';

interface DashboardViewProps {
  requestedTab?: DashboardTab | null;
  requestedConvId?: string | null;
  onClearNavigationHint?: () => void;
  currentUser: User;
  allListings: Listing[];
  categories: Category[];
  breeds: Breed[];
  regions: Region[];
  sellers: SellerProfile[];
  favoriteIds: string[];
  conversations: Conversation[];
  priceOffers: PriceOffer[];
  reports: Report[];
  auditLogs: AuditLog[];
  onLogout: () => Promise<void>;
  onSelectListing: (listing: Listing) => void;
  onToggleFavorite: (listingId: string) => void;
  onMarkSold: (listingId: string) => Promise<void>;
  onSendMessage: (conversationId: string, body: string) => Promise<void>;
  onRespondToOffer: (offerId: string, status: 'accepted' | 'rejected') => Promise<void>;
  onApproveListing: (listingId: string) => Promise<void>;
  onRejectListing: (listingId: string, reason: string) => Promise<void>;
  onResolveReport: (reportId: string, status: 'resolved' | 'dismissed') => Promise<void>;
  onCreateBreed: (payload: {
    name: string;
    categoryId: string;
    origin: string;
    summary: string;
    avgWeightKg: string;
    priceRangeSar: string;
  }) => Promise<void>;
  onCreateSubCategory: (payload: {
    name: string;
    parentId: string;
    description: string;
    keywords: string;
  }) => Promise<void>;
  onUpdateSubCategory: (
    id: string,
    payload: {
      name: string;
      parentId: string;
      description: string;
      keywords: string;
    }
  ) => Promise<void>;
  onDeleteSubCategory: (id: string) => Promise<void>;
  onAutoCategorizeListings: (payload?: { listingId?: string; subCategoryId?: string }) => Promise<void>;
}

function AnalyticsFallback() {
  return (
    <div className="py-16 text-center" role="status" aria-live="polite">
      <p className="text-sm text-[var(--color-muted)]">جاري تحميل الرسوم البيانية...</p>
    </div>
  );
}

export function DashboardView({
  requestedTab,
  requestedConvId,
  onClearNavigationHint,
  currentUser,
  allListings,
  categories,
  breeds,
  regions,
  sellers,
  favoriteIds,
  conversations,
  priceOffers,
  reports,
  auditLogs,
  onLogout,
  onSelectListing,
  onToggleFavorite,
  onMarkSold,
  onSendMessage,
  onRespondToOffer,
  onApproveListing,
  onRejectListing,
  onResolveReport,
  onCreateBreed,
  onCreateSubCategory,
  onUpdateSubCategory,
  onDeleteSubCategory,
  onAutoCategorizeListings,
}: DashboardViewProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>(
    requestedTab || (currentUser.role === 'admin' ? 'admin' : 'my-listings')
  );
  const [selectedConvId, setSelectedConvId] = useState<string>(
    requestedConvId || conversations[0]?.id || ''
  );
  const [replyText, setReplyText] = useState('');

  useEffect(() => {
    if (requestedTab) {
      setActiveTab(requestedTab);
      if (requestedConvId) {
        setSelectedConvId(requestedConvId);
      }
      onClearNavigationHint?.();
    }
  }, [requestedTab, requestedConvId, onClearNavigationHint]);

  // Admin Reject State
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Admin New Breed Form
  const [breedName, setBreedName] = useState('');
  const [breedCategoryId, setBreedCategoryId] = useState(
    categories.find((c) => c.parentId === null)?.id || 'cat_sheep'
  );
  const [breedOrigin, setBreedOrigin] = useState('');

  // Admin Smart Sub-Category Management State (Table + Modals)
  const mainCategories = categories.filter((c) => c.parentId === null);
  const subCategories = categories.filter((c) => c.parentId !== null);
  const [subSearch, setSubSearch] = useState('');
  const [subParentFilter, setSubParentFilter] = useState('all');

  const filteredSubCategories = subCategories.filter((sub) => {
    const matchesParent = subParentFilter === 'all' || sub.parentId === subParentFilter;
    const term = subSearch.trim().toLowerCase();
    if (!term) return matchesParent;
    const matchesText =
      sub.name.toLowerCase().includes(term) ||
      (sub.description || '').toLowerCase().includes(term) ||
      (sub.keywords || []).some((k) => k.toLowerCase().includes(term));
    return matchesParent && matchesText;
  });

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [subName, setSubName] = useState('');
  const [subParentId, setSubParentId] = useState(mainCategories[0]?.id || 'cat_sheep');
  const [subDescription, setSubDescription] = useState('');
  const [subKeywords, setSubKeywords] = useState('');

  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [editSubName, setEditSubName] = useState('');
  const [editSubParentId, setEditSubParentId] = useState('cat_sheep');
  const [editSubDescription, setEditSubDescription] = useState('');
  const [editSubKeywords, setEditSubKeywords] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [subSaving, setSubSaving] = useState(false);
  const [subModalError, setSubModalError] = useState('');
  const [autoRunning, setAutoRunning] = useState(false);

  const myListings = allListings.filter((l) => l.sellerId === currentUser.id);
  const myOffers = priceOffers.filter(
    (o) =>
      o.sellerId === currentUser.id ||
      o.buyerId === currentUser.id ||
      currentUser.role === 'admin'
  );
  const favoriteListings = allListings.filter(
    (l) => favoriteIds.includes(l.id) && l.status === 'Published'
  );
  const pendingListings = allListings.filter((l) => l.status === 'Pending');

  const activeConv =
    conversations.find((c) => c.id === selectedConvId) || conversations[0] || null;

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || !replyText.trim()) return;
    try {
      await onSendMessage(activeConv.id, replyText.trim());
      setReplyText('');
    } catch {
      // The app already showed the error toast; keep the typed reply so the user can retry.
    }
  };

  const handleAddBreedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!breedName.trim()) return;
    await onCreateBreed({
      name: breedName.trim(),
      categoryId: breedCategoryId,
      origin: breedOrigin.trim() || 'المملكة العربية السعودية',
      summary: 'سلالة مضافة عبر لوحة إدارة التصنيفات والسلالات.',
      avgWeightKg: '38 – 60 كجم',
      priceRangeSar: '1,300 – 2,200 ر.س',
    });
    setBreedName('');
    setBreedOrigin('');
  };

  const openCreateModal = () => {
    setSubModalError('');
    setSubName('');
    setSubParentId(mainCategories[0]?.id || 'cat_sheep');
    setSubDescription('');
    setSubKeywords('');
    setCreateModalOpen(true);
  };

  const handleCreateSubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subName.trim()) {
      setSubModalError('يرجى إدخال اسم الفئة الفرعية');
      return;
    }
    setSubModalError('');
    setSubSaving(true);
    try {
      await onCreateSubCategory({
        name: subName.trim(),
        parentId: subParentId,
        description: subDescription.trim(),
        keywords: subKeywords.trim(),
      });
      setCreateModalOpen(false);
    } catch (err: any) {
      setSubModalError(err?.message || 'تعذر حفظ الفئة الفرعية');
    } finally {
      setSubSaving(false);
    }
  };

  const openEditModal = (sub: Category) => {
    setSubModalError('');
    setEditTarget(sub);
    setEditSubName(sub.name);
    setEditSubParentId(sub.parentId || mainCategories[0]?.id || 'cat_sheep');
    setEditSubDescription(sub.description || '');
    setEditSubKeywords((sub.keywords || []).join('، '));
  };

  const handleSaveEditSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || !editSubName.trim()) {
      setSubModalError('يرجى إدخال اسم الفئة الفرعية');
      return;
    }
    setSubModalError('');
    setSubSaving(true);
    try {
      await onUpdateSubCategory(editTarget.id, {
        name: editSubName.trim(),
        parentId: editSubParentId,
        description: editSubDescription.trim(),
        keywords: editSubKeywords.trim(),
      });
      setEditTarget(null);
    } catch (err: any) {
      setSubModalError(err?.message || 'تعذر تحديث الفئة الفرعية');
    } finally {
      setSubSaving(false);
    }
  };

  const handleConfirmDeleteSub = async () => {
    if (!deleteTarget) return;
    setSubModalError('');
    setSubSaving(true);
    try {
      await onDeleteSubCategory(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err: any) {
      setSubModalError(err?.message || 'تعذر حذف الفئة الفرعية');
    } finally {
      setSubSaving(false);
    }
  };

  const fieldCls =
    'h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/75 focus:outline-none focus:border-[var(--color-green-ink)]';

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Account Bar & Role Switcher */}
      <div className="bg-[var(--color-cream)] rounded-xl border border-[var(--color-border)] p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <p className="text-xs font-medium text-[var(--color-muted)]">
            الحساب النشط حالياً ·{' '}
            {currentUser.role === 'admin'
              ? 'مشرف المنصة'
              : currentUser.role === 'seller'
              ? 'بائع / مربي'
              : 'مشتري'}
          </p>
          <h1 className="font-display text-2xl font-extrabold text-[var(--color-ink)] mt-1">
            مرحباً، {currentUser.name}
          </h1>
          <p className="text-xs text-[var(--color-muted)] tabular-nums mt-1">
            رقم الجوال: {currentUser.phone}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onLogout()}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-ink)] hover:bg-[var(--color-cream-hover)]"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>

      {/* Navigation Segmented Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('my-listings')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === 'my-listings'
              ? 'bg-[var(--color-green)] text-white'
              : 'text-[var(--color-muted)] hover:bg-[var(--color-cream)]'
          }`}
        >
          إعلاناتي ({myListings.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('favorites')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === 'favorites'
              ? 'bg-[var(--color-green)] text-white'
              : 'text-[var(--color-muted)] hover:bg-[var(--color-cream)]'
          }`}
        >
          المفضلة ({favoriteListings.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('messages')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === 'messages'
              ? 'bg-[var(--color-green)] text-white'
              : 'text-[var(--color-muted)] hover:bg-[var(--color-cream)]'
          }`}
        >
          المحادثات ({conversations.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === 'analytics'
              ? 'bg-[var(--color-green)] text-white'
              : 'text-[var(--color-muted)] hover:bg-[var(--color-cream)]'
          }`}
        >
          لوحة تحكم الأداء
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('admin')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === 'admin'
              ? 'bg-[var(--color-gold)] text-[#14261D]'
              : 'text-[var(--color-muted)] hover:bg-[var(--color-cream)]'
          }`}
        >
          لوحة المشرف {currentUser.role === 'admin' ? `(${pendingListings.length} بانتظار المراجعة)` : ''}
        </button>
      </div>

      {/* Tab 1: My Listings */}
      {activeTab === 'my-listings' && (
        <div className="space-y-8">
          {myListings.length === 0 ? (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-8 text-center">
              <p className="font-display text-lg font-bold text-[var(--color-ink)]">
                لم تقم بإضافة أي إعلانات بعد بهذا الحساب
              </p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                يمكنك إضافة إعلان جديد من زر «أضف إعلانك».
              </p>
            </div>
          ) : (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-[var(--color-cream)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted)]">
                    <th className="py-3 px-4">الإعلان</th>
                    <th className="py-3 px-4">السعر</th>
                    <th className="py-3 px-4">الحالة</th>
                    <th className="py-3 px-4">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)] text-sm">
                  {myListings.map((item) => (
                    <tr key={item.id}>
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => onSelectListing(item)}
                          className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-green-ink)] text-right cursor-pointer"
                        >
                          {item.title}
                        </button>
                        {item.rejectionReason && (
                          <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                            سبب الرفض: {item.rejectionReason}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-[var(--color-green-ink)] tabular-nums">
                        <div>{formatPriceSar(item.priceAmount)}</div>
                        {item.expectedPrice && (
                          <p className="text-[11px] font-medium text-[var(--color-muted)] mt-0.5">
                            المتوقع: {formatPriceSar(item.expectedPrice)}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-semibold text-[var(--color-ink)]">
                        {formatStatusLabel(item.status)}
                      </td>
                      <td className="py-3.5 px-4">
                        {item.status === 'Published' && (
                          <button
                            type="button"
                            onClick={() => onMarkSold(item.id)}
                            className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-cream)] cursor-pointer"
                          >
                            تحديد كمباع
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Price Offers / Negotiation Activity */}
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-4">
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
                عروض الأسعار والتفاوض (السوم) ({myOffers.length})
              </h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                متابعة عروض الأسعار الواردة على إعلاناتك أو العروض التي أرسلتها للمربين
              </p>
            </div>

            {myOffers.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">
                لا توجد عروض أسعار مسجلة لهذا الحساب حالياً.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
                <table className="w-full text-right text-sm border-collapse">
                  <thead>
                    <tr className="bg-[var(--color-cream)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted)]">
                      <th className="py-2.5 px-3">الإعلان</th>
                      <th className="py-2.5 px-3">المشتري</th>
                      <th className="py-2.5 px-3">العرض المقدم</th>
                      <th className="py-2.5 px-3">الحالة</th>
                      <th className="py-2.5 px-3 text-left">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {myOffers.map((offer) => {
                      const listing = allListings.find((l) => l.id === offer.listingId);
                      const canRespond =
                        offer.status === 'pending' &&
                        (offer.sellerId === currentUser.id || currentUser.role === 'admin');
                      return (
                        <tr key={offer.id}>
                          <td className="py-3 px-3">
                            {listing ? (
                              <button
                                type="button"
                                onClick={() => onSelectListing(listing)}
                                className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-green-ink)] text-right cursor-pointer"
                              >
                                {listing.title}
                              </button>
                            ) : (
                              <span className="text-[var(--color-muted)]">{offer.listingId}</span>
                            )}
                            {offer.note && (
                              <p className="text-xs text-[var(--color-muted)] mt-0.5">{offer.note}</p>
                            )}
                          </td>
                          <td className="py-3 px-3 text-xs text-[var(--color-ink)] whitespace-nowrap">
                            {offer.buyerName}
                          </td>
                          <td className="py-3 px-3 font-bold text-[var(--color-green-ink)] tabular-nums whitespace-nowrap">
                            {formatPriceSar(offer.offeredPrice)} × {offer.quantity}
                          </td>
                          <td className="py-3 px-3 text-xs font-semibold whitespace-nowrap">
                            <span
                              className={
                                offer.status === 'accepted'
                                  ? 'text-[var(--color-green-ink)]'
                                  : offer.status === 'rejected'
                                  ? 'text-red-700 dark:text-red-400'
                                  : 'text-[var(--color-gold)]'
                              }
                            >
                              {offer.status === 'accepted'
                                ? 'مقبول'
                                : offer.status === 'rejected'
                                ? 'مرفوض'
                                : 'بانتظار الرد'}
                            </span>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            {canRespond && (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => onRespondToOffer(offer.id, 'accepted')}
                                  className="px-2.5 py-1 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer"
                                >
                                  قبول
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onRespondToOffer(offer.id, 'rejected')}
                                  className="px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold cursor-pointer"
                                >
                                  رفض
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Favorites */}
      {activeTab === 'favorites' && (
        <div>
          {favoriteListings.length === 0 ? (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-8 text-center">
              <p className="font-display text-lg font-bold text-[var(--color-ink)]">
                قائمة المفضلة فارغة
              </p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                اضغط على أيقونة القلب في أي إعلان لحفظه والرجوع إليه لاحقاً.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {favoriteListings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  breed={breeds.find((b) => b.id === listing.breedId)}
                  subCategory={categories.find((c) => c.id === listing.subCategoryId)}
                  region={regions.find((r) => r.id === listing.regionId)}
                  seller={sellers.find((s) => s.userId === listing.sellerId)}
                  isFavorite={true}
                  onSelect={onSelectListing}
                  onToggleFavorite={onToggleFavorite}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Conversations */}
      {activeTab === 'messages' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden min-h-[420px]">
          <div className="lg:col-span-4 border-l border-[var(--color-border)] bg-[var(--color-cream)]/40 divide-y divide-[var(--color-border)]">
            {conversations.length === 0 ? (
              <p className="p-6 text-sm text-[var(--color-muted)]">لا توجد محادثات حتى الآن.</p>
            ) : (
              conversations.map((conv) => {
                const listing = allListings.find((l) => l.id === conv.listingId);
                const selected = activeConv?.id === conv.id;
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => setSelectedConvId(conv.id)}
                    className={`w-full text-right p-4 transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[var(--color-surface)]'
                        : 'hover:bg-[var(--color-surface)]/60'
                    }`}
                  >
                    <p className="font-display text-sm font-bold text-[var(--color-ink)] truncate">
                      {listing?.title || 'استفسار عن إعلان'}
                    </p>
                    <p className="text-xs text-[var(--color-muted)] mt-1 truncate">
                      {conv.messages[conv.messages.length - 1]?.body || 'بدء المحادثة'}
                    </p>
                  </button>
                );
              })
            )}
          </div>

          <div className="lg:col-span-8 flex flex-col justify-between">
            {activeConv ? (
              <>
                <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-cream)]/30">
                  <p className="font-display text-base font-bold text-[var(--color-ink)]">
                    {allListings.find((l) => l.id === activeConv.listingId)?.title}
                  </p>
                </div>

                <div className="p-4 space-y-3 flex-1 overflow-y-auto max-h-[340px]">
                  {activeConv.messages.map((msg) => {
                    const isMine = msg.senderId === currentUser.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMine ? 'items-start' : 'items-end'}`}
                      >
                        <div
                          className={`max-w-md rounded-xl px-4 py-2.5 text-sm ${
                            isMine
                              ? 'bg-[var(--color-green)] text-white'
                              : 'bg-[var(--color-cream)] text-[var(--color-ink)] border border-[var(--color-border)]'
                          }`}
                        >
                          <p>{msg.body}</p>
                        </div>
                        <span className="text-[11px] text-[var(--color-muted)] mt-1">
                          {formatRelativeArabicTime(msg.createdAt)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <form
                  onSubmit={handleReplySubmit}
                  className="p-4 border-t border-[var(--color-border)] flex gap-2"
                >
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="اكتب رسالتك هنا..."
                    className="flex-1 h-11 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/75"
                  />
                  <button
                    type="submit"
                    className="h-11 px-5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Send size={15} aria-hidden="true" />
                    <span>إرسال</span>
                  </button>
                </form>
              </>
            ) : (
              <div className="p-8 text-center text-sm text-[var(--color-muted)]">
                اختر محادثة لعرض الرسائل أو أرسل استفساراً من أي صفحة إعلان.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Dashboard Analytics */}
      {activeTab === 'analytics' && (
        <Suspense fallback={<AnalyticsFallback />}>
          <DashboardAnalytics
            listings={allListings}
            regions={regions}
            isAdmin={currentUser.role === 'admin'}
          />
        </Suspense>
      )}

      {/* Tab 5: Admin Moderation Panel */}
      {activeTab === 'admin' && (
        <div className="space-y-8">
          {currentUser.role !== 'admin' ? (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-8 text-center max-w-xl mx-auto">
              <p className="font-display text-lg font-bold text-[var(--color-ink)]">
                لوحة الإشراف مخصصة لإدارة المنصة
              </p>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                اعتماد الإعلانات المعلّقة ومعالجة البلاغات وإدارة السلالات متاحة لحسابات المشرفين فقط.
              </p>
            </div>
          ) : (
            <>
              <Suspense fallback={<AnalyticsFallback />}>
                <DashboardAnalytics
                  listings={allListings}
                  regions={regions}
                  isAdmin={true}
                />
              </Suspense>

              {/* Pending Listings Queue */}
              <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6">
                <h2 className="font-display text-xl font-bold text-[var(--color-ink)] mb-4">
                  طابور مراجعة الإعلانات ({pendingListings.length})
                </h2>

                {pendingListings.length === 0 ? (
                  <p className="text-sm text-[var(--color-muted)]">
                    لا توجد إعلانات بانتظار المراجعة حالياً.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {pendingListings.map((item) => {
                      const breed = breeds.find((b) => b.id === item.breedId);
                      const region = regions.find((r) => r.id === item.regionId);
                      return (
                        <div
                          key={item.id}
                          className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/40 flex flex-col md:flex-row md:items-center justify-between gap-4"
                        >
                          <div>
                            <p className="text-xs text-[var(--color-muted)]">
                              {breed?.name} · {region?.name} — {item.city} ·{' '}
                              <span className="tabular-nums font-bold text-[var(--color-green-ink)]">
                                {formatPriceSar(item.priceAmount)}
                              </span>
                            </p>
                            <h3 className="font-display text-base font-bold text-[var(--color-ink)] mt-1">
                              {item.title}
                            </h3>
                            <p className="text-xs text-[var(--color-muted)] mt-1 line-clamp-2">
                              {item.description}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => onApproveListing(item.id)}
                              className="px-4 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <CheckCircle2 size={15} />
                              <span>اعتماد ونشر</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejectTargetId(item.id)}
                              className="px-4 py-2 rounded-lg border border-red-300 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <XCircle size={15} />
                              <span>رفض</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {rejectTargetId && (
                  <div className="mt-4 p-4 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/30 space-y-3">
                    <p className="text-sm font-semibold text-red-900 dark:text-red-300">
                      سبب رفض الإعلان (يظهر للبائع):
                    </p>
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="مثال: الصور غير واضحة أو السعر غير مكتمل"
                      className="w-full h-10 px-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-[var(--color-surface)] text-sm text-[var(--color-ink)]"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!rejectReason.trim()) return;
                          await onRejectListing(rejectTargetId, rejectReason.trim());
                          setRejectTargetId(null);
                          setRejectReason('');
                        }}
                        className="px-4 py-2 rounded-lg bg-red-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        تأكيد الرفض
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectTargetId(null);
                          setRejectReason('');
                        }}
                        className="px-4 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-ink)] cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Smart Listing Categorization Section (Table + Modals) */}
              <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--color-border)]">
                  <div>
                    <h2 className="font-display text-xl font-bold text-[var(--color-ink)]">
                      التصنيف الذكي للإعلانات (الفئات الفرعية)
                    </h2>
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      استعرض وأدر الفئات الفرعية للإعلانات مثل «مواشي للتربية» و«ذبائح» و«مواشي للعرض» مع الكلمات المفتاحية لتسهيل الفلترة على المستخدمين.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={openCreateModal}
                      className="px-4 py-2.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus size={15} aria-hidden="true" />
                      <span>إنشاء فئة فرعية</span>
                    </button>

                    <button
                      type="button"
                      disabled={autoRunning}
                      onClick={async () => {
                        setAutoRunning(true);
                        try {
                          await onAutoCategorizeListings();
                        } finally {
                          setAutoRunning(false);
                        }
                      }}
                      className="px-4 py-2.5 rounded-lg bg-[var(--color-gold)] hover:bg-[var(--color-gold-hover)] text-[#14261D] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      <Sparkles size={15} aria-hidden="true" />
                      <span>{autoRunning ? 'جاري التصنيف...' : 'تصنيف تلقائي ذكي'}</span>
                    </button>
                  </div>
                </div>

                {/* Sub-Categories Table Filter Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search
                      size={15}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      value={subSearch}
                      onChange={(e) => setSubSearch(e.target.value)}
                      placeholder="ابحث باسم الفئة أو الكلمة المفتاحية..."
                      className="w-full h-10 pr-9 pl-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]/40 text-xs text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/75 focus:outline-none focus:border-[var(--color-green-ink)]"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="sub-parent-filter"
                      className="text-xs text-[var(--color-muted)] whitespace-nowrap"
                    >
                      التصنيف الرئيسي:
                    </label>
                    <select
                      id="sub-parent-filter"
                      value={subParentFilter}
                      onChange={(e) => setSubParentFilter(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                    >
                      <option value="all">الكل ({subCategories.length})</option>
                      {mainCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Sub-Categories Management Table */}
                <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
                  <table className="w-full text-right text-sm border-collapse">
                    <thead>
                      <tr className="bg-[var(--color-cream)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted)]">
                        <th className="py-3 px-4">الفئة الفرعية</th>
                        <th className="py-3 px-4">التصنيف الرئيسي</th>
                        <th className="py-3 px-4">الوصف والكلمات المفتاحية</th>
                        <th className="py-3 px-4">عدد الإعلانات</th>
                        <th className="py-3 px-4 text-left">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
                      {filteredSubCategories.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 px-4 text-center text-sm text-[var(--color-muted)]">
                            {subCategories.length === 0
                              ? 'لا توجد فئات فرعية مضافة حالياً. اضغط على «إنشاء فئة فرعية» للبدء.'
                              : 'لا توجد فئات فرعية مطابقة لخيار البحث المحدد.'}
                          </td>
                        </tr>
                      ) : (
                        filteredSubCategories.map((sub) => {
                          const parentName =
                            mainCategories.find((m) => m.id === sub.parentId)?.name || 'عام';
                          const count = allListings.filter(
                            (l) => l.subCategoryId === sub.id
                          ).length;

                          return (
                            <tr key={sub.id} className="hover:bg-[var(--color-cream)]/40">
                              <td className="py-3.5 px-4 font-display font-bold text-[var(--color-ink)] whitespace-nowrap">
                                {sub.name}
                              </td>
                              <td className="py-3.5 px-4 text-xs text-[var(--color-muted)] whitespace-nowrap">
                                {parentName}
                              </td>
                              <td className="py-3.5 px-4 max-w-md">
                                {sub.description && (
                                  <p className="text-xs text-[var(--color-ink)] line-clamp-1">
                                    {sub.description}
                                  </p>
                                )}
                                {sub.keywords && sub.keywords.length > 0 && (
                                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5 line-clamp-1">
                                    المطابقة: {sub.keywords.join(' · ')}
                                  </p>
                                )}
                              </td>
                              <td className="py-3.5 px-4 font-semibold text-[var(--color-green-ink)] tabular-nums whitespace-nowrap">
                                {count} إعلان
                              </td>
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(sub)}
                                    className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-cream)] inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Pencil size={13} aria-hidden="true" />
                                    <span>تعديل</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSubModalError('');
                                      setDeleteTarget(sub);
                                    }}
                                    className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Trash2 size={13} aria-hidden="true" />
                                    <span>حذف</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Create Sub-Category Modal */}
                <Modal
                  open={createModalOpen}
                  onClose={() => setCreateModalOpen(false)}
                  title="إنشاء فئة فرعية جديدة"
                  subtitle="أضف فئة فرعية لتصنيف الإعلانات وتسهيل فلترة المشترين داخل السوق."
                  size="lg"
                >
                  <form onSubmit={handleCreateSubSubmit} className="space-y-4">
                    {subModalError && (
                      <p className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
                        {subModalError}
                      </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="modal-sub-name"
                          className="block text-xs text-[var(--color-muted)] mb-1"
                        >
                          اسم الفئة الفرعية
                        </label>
                        <input
                          id="modal-sub-name"
                          type="text"
                          value={subName}
                          onChange={(e) => setSubName(e.target.value)}
                          placeholder="مثال: أضاحي العيد"
                          required
                          className={`w-full ${fieldCls}`}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="modal-sub-parent"
                          className="block text-xs text-[var(--color-muted)] mb-1"
                        >
                          التصنيف الرئيسي المرتبط
                        </label>
                        <select
                          id="modal-sub-parent"
                          value={subParentId}
                          onChange={(e) => setSubParentId(e.target.value)}
                          className={`w-full ${fieldCls}`}
                        >
                          {mainCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="modal-sub-desc"
                        className="block text-xs text-[var(--color-muted)] mb-1"
                      >
                        وصف الفئة
                      </label>
                      <input
                        id="modal-sub-desc"
                        type="text"
                        value={subDescription}
                        onChange={(e) => setSubDescription(e.target.value)}
                        placeholder="وصف مختصر يوضح غرض هذه الفئة للمستخدمين..."
                        className={`w-full ${fieldCls}`}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="modal-sub-kw"
                        className="block text-xs text-[var(--color-muted)] mb-1"
                      >
                        كلمات مفتاحية للتصنيف التلقائي الذكي (مفصولة بفاصلة)
                      </label>
                      <input
                        id="modal-sub-kw"
                        type="text"
                        value={subKeywords}
                        onChange={(e) => setSubKeywords(e.target.value)}
                        placeholder="أضحية، جذع، هرفي، مناسبات"
                        className={`w-full ${fieldCls}`}
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
                      <button
                        type="button"
                        onClick={() => setCreateModalOpen(false)}
                        className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--color-cream)] cursor-pointer"
                      >
                        إلغاء
                      </button>
                      <button
                        type="submit"
                        disabled={subSaving}
                        className="px-5 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                      >
                        {subSaving ? 'جاري الحفظ...' : 'حفظ الفئة الفرعية'}
                      </button>
                    </div>
                  </form>
                </Modal>

                {/* Edit Sub-Category Modal */}
                <Modal
                  open={Boolean(editTarget)}
                  onClose={() => setEditTarget(null)}
                  title={editTarget ? `تعديل الفئة الفرعية: ${editTarget.name}` : 'تعديل الفئة الفرعية'}
                  subtitle="حدّث الاسم أو التصنيف الرئيسي أو الكلمات المفتاحية المستخدمة في المطابقة الذكية."
                  size="lg"
                >
                  <form onSubmit={handleSaveEditSub} className="space-y-4">
                    {subModalError && (
                      <p className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
                        {subModalError}
                      </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="edit-sub-name"
                          className="block text-xs text-[var(--color-muted)] mb-1"
                        >
                          اسم الفئة الفرعية
                        </label>
                        <input
                          id="edit-sub-name"
                          type="text"
                          value={editSubName}
                          onChange={(e) => setEditSubName(e.target.value)}
                          required
                          className={`w-full ${fieldCls}`}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="edit-sub-parent"
                          className="block text-xs text-[var(--color-muted)] mb-1"
                        >
                          التصنيف الرئيسي المرتبط
                        </label>
                        <select
                          id="edit-sub-parent"
                          value={editSubParentId}
                          onChange={(e) => setEditSubParentId(e.target.value)}
                          className={`w-full ${fieldCls}`}
                        >
                          {mainCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="edit-sub-desc"
                        className="block text-xs text-[var(--color-muted)] mb-1"
                      >
                        وصف الفئة
                      </label>
                      <input
                        id="edit-sub-desc"
                        type="text"
                        value={editSubDescription}
                        onChange={(e) => setEditSubDescription(e.target.value)}
                        className={`w-full ${fieldCls}`}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="edit-sub-kw"
                        className="block text-xs text-[var(--color-muted)] mb-1"
                      >
                        كلمات مفتاحية للتصنيف الذكي (مفصولة بفاصلة)
                      </label>
                      <input
                        id="edit-sub-kw"
                        type="text"
                        value={editSubKeywords}
                        onChange={(e) => setEditSubKeywords(e.target.value)}
                        className={`w-full ${fieldCls}`}
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
                      <button
                        type="button"
                        onClick={() => setEditTarget(null)}
                        className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--color-cream)] cursor-pointer"
                      >
                        إلغاء
                      </button>
                      <button
                        type="submit"
                        disabled={subSaving}
                        className="px-5 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                      >
                        {subSaving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                      </button>
                    </div>
                  </form>
                </Modal>

                {/* Delete Confirmation Modal */}
                <Modal
                  open={Boolean(deleteTarget)}
                  onClose={() => setDeleteTarget(null)}
                  title="تأكيد حذف الفئة الفرعية"
                  size="md"
                >
                  {deleteTarget && (
                    <div className="space-y-4">
                      {subModalError && (
                        <p className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
                          {subModalError}
                        </p>
                      )}

                      <p className="text-sm text-[var(--color-ink)] leading-relaxed">
                        هل أنت متأكد من حذف الفئة الفرعية{' '}
                        <span className="font-bold text-[var(--color-green-ink)]">
                          «{deleteTarget.name}»
                        </span>
                        ؟
                      </p>
                      <p className="text-xs text-[var(--color-muted)] bg-[var(--color-cream)] border border-[var(--color-border)] rounded-lg p-3 leading-relaxed">
                        يوجد حالياً{' '}
                        <span className="font-bold tabular-nums text-[var(--color-ink)]">
                          {allListings.filter((l) => l.subCategoryId === deleteTarget.id).length}
                        </span>{' '}
                        إعلان مرتبط بهذه الفئة، وسيتم إعادة تصنيفها تلقائياً على أقرب فئة فرعية متبقية عند الحذف.
                      </p>

                      <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(null)}
                          className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--color-cream)] cursor-pointer"
                        >
                          إلغاء
                        </button>
                        <button
                          type="button"
                          disabled={subSaving}
                          onClick={handleConfirmDeleteSub}
                          className="px-5 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                        >
                          {subSaving ? 'جاري الحذف...' : 'تأكيد الحذف'}
                        </button>
                      </div>
                    </div>
                  )}
                </Modal>

                {/* Quick Per-Listing Smart Category Assignment */}
                <div className="pt-4 border-t border-[var(--color-border)]">
                  <p className="text-sm font-bold text-[var(--color-ink)] mb-3">
                    تخصيص الفئة الفرعية للإعلانات الحالية
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-muted)]">
                          <th className="py-2 px-3">عنوان الإعلان</th>
                          <th className="py-2 px-3">الحالة</th>
                          <th className="py-2 px-3">الفئة الفرعية المسندة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border)]">
                        {allListings.map((item) => (
                          <tr key={item.id}>
                            <td className="py-2.5 px-3 font-medium text-[var(--color-ink)]">
                              {item.title}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-[var(--color-muted)]">
                              {formatStatusLabel(item.status)}
                            </td>
                            <td className="py-2.5 px-3">
                              <select
                                aria-label={`الفئة الفرعية لإعلان ${item.title}`}
                                value={item.subCategoryId || ''}
                                onChange={(e) =>
                                  onAutoCategorizeListings({
                                    listingId: item.id,
                                    subCategoryId: e.target.value,
                                  })
                                }
                                className="h-9 px-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-ink)]"
                              >
                                <option value="">غير مصنف</option>
                                {subCategories.map((sub) => (
                                  <option key={sub.id} value={sub.id}>
                                    {sub.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Dynamic Breed Management + Reports */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <form
                  onSubmit={handleAddBreedSubmit}
                  className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-4"
                >
                  <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
                    إدارة السلالات من قاعدة البيانات
                  </h2>
                  <p className="text-xs text-[var(--color-muted)]">
                    أضف سلالات جديدة لتظهر فوراً في نموذج إضافة الإعلان وفلاتر البحث ودليل السلالات.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="اسم السلالة (مثال: رفيدي)"
                      value={breedName}
                      onChange={(e) => setBreedName(e.target.value)}
                      required
                      className={fieldCls}
                    />
                    <select
                      value={breedCategoryId}
                      onChange={(e) => setBreedCategoryId(e.target.value)}
                      className={fieldCls}
                    >
                      {mainCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="text"
                    placeholder="الموطن (مثال: جنوب المملكة)"
                    value={breedOrigin}
                    onChange={(e) => setBreedOrigin(e.target.value)}
                    className={`w-full ${fieldCls}`}
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer"
                  >
                    حفظ السلالة الجديدة
                  </button>
                </form>

                {/* Reports */}
                <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6">
                  <h2 className="font-display text-lg font-bold text-[var(--color-ink)] mb-4">
                    البلاغات الواردة ({reports.filter((r) => r.status === 'open').length} مفتوح)
                  </h2>
                  {reports.length === 0 ? (
                    <p className="text-sm text-[var(--color-muted)]">لا توجد بلاغات حالياً.</p>
                  ) : (
                    <div className="space-y-3">
                      {reports.map((rep) => (
                        <div
                          key={rep.id}
                          className="p-3.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]/40 flex items-center justify-between gap-3"
                        >
                          <div>
                            <p className="text-sm font-semibold text-[var(--color-ink)]">
                              {rep.reason}
                            </p>
                            <p className="text-xs text-[var(--color-muted)] mt-0.5">{rep.details}</p>
                          </div>
                          {rep.status === 'open' ? (
                            <button
                              type="button"
                              onClick={() => onResolveReport(rep.id, 'resolved')}
                              className="px-3 py-1.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold shrink-0 cursor-pointer"
                            >
                              تمت المعالجة
                            </button>
                          ) : (
                            <span className="text-xs font-medium text-[var(--color-muted)]">
                              مغلق
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Audit Logs */}
              <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6">
                <h2 className="font-display text-lg font-bold text-[var(--color-ink)] mb-4">
                  سجل التدقيق الإداري
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-muted)]">
                        <th className="py-2.5 px-3">الإجراء</th>
                        <th className="py-2.5 px-3">المنفذ</th>
                        <th className="py-2.5 px-3">التفاصيل</th>
                        <th className="py-2.5 px-3">التوقيت</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="py-2.5 px-3 font-semibold text-[var(--color-green-ink)]">
                            {log.action}
                          </td>
                          <td className="py-2.5 px-3 text-[var(--color-ink)]">{log.actorName}</td>
                          <td className="py-2.5 px-3 text-[var(--color-muted)]">
                            {log.note || log.targetId}
                          </td>
                          <td className="py-2.5 px-3 text-xs text-[var(--color-muted)]">
                            {formatRelativeArabicTime(log.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
