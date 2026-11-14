import { useState } from 'react';
import { ChevronDown, ShieldCheck, Star, X } from 'lucide-react';
import type { Article, FAQ, IndicativePrice, SellerProfile } from '../types/marketplace';
import { formatPriceSar } from '../lib/format';
import { SafeImage } from './SafeImage';

interface BreedersAndGuidesViewProps {
  sellers: SellerProfile[];
  articles: Article[];
  faqs: FAQ[];
  indicativePrices: IndicativePrice[];
  onOpenSeller: (sellerId: string) => void;
}

export function BreedersAndGuidesView({
  sellers,
  articles,
  faqs,
  indicativePrices,
  onOpenSeller,
}: BreedersAndGuidesViewProps) {
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [openFaqId, setOpenFaqId] = useState<string | null>(faqs[0]?.id || null);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-14">
      {/* Verified Breeders */}
      <div>
        <div className="pb-6 border-b border-[var(--color-border)]">
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--color-ink)]">
            المربون الموثقون وأدلة السوق
          </h1>
          <p className="mt-1.5 text-sm text-[var(--color-muted)]">
            مزارع ومراحات معتمدة في مختلف مناطق المملكة، مع دليل المقالات والأسئلة الشائعة ومؤشر الأسعار.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          {sellers.map((seller) => (
            <article
              key={seller.userId}
              className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-muted)]">
                  <span>{seller.city}</span>
                  {seller.verifiedAt && (
                    <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-green-ink)]">
                      <ShieldCheck size={14} aria-hidden="true" />
                      <span>مربي موثق</span>
                    </span>
                  )}
                </div>

                <h2 className="mt-2 font-display text-lg font-bold text-[var(--color-ink)]">
                  {seller.displayName}
                </h2>
                <p className="mt-2 text-sm text-[var(--color-muted)] leading-relaxed">
                  {seller.bio}
                </p>
              </div>

              <div className="pt-4 border-t border-[var(--color-border)] flex items-center justify-between">
                <div className="text-xs text-[var(--color-muted)] tabular-nums">
                  <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-ink)]">
                    <Star
                      size={13}
                      className="text-[var(--color-gold)] fill-[var(--color-gold)]"
                      aria-hidden="true"
                    />
                    <span>{seller.rating.toFixed(1)}</span>
                    {seller.ratingCount !== undefined && (
                      <span className="font-normal text-[var(--color-muted)]">
                        ({seller.ratingCount})
                      </span>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="font-normal text-[var(--color-muted)]">
                      {seller.specialty}
                    </span>
                  </span>
                  <span className="block mt-0.5">
                    خبرة {seller.yearsExperience} سنة · {seller.totalSales} عملية بيع
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenSeller(seller.userId)}
                  className="px-4 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer"
                >
                  عرض المراح
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Indicative Price Strip */}
      <div className="bg-[var(--color-cream)] rounded-xl border border-[var(--color-border)] p-6">
        <h2 className="font-display text-xl font-bold text-[var(--color-ink)] mb-4">
          ملخص الأسعار الاسترشادية اليوم
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {indicativePrices.map((p) => (
            <div
              key={p.id}
              className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] p-4"
            >
              <p className="text-xs text-[var(--color-muted)]">{p.ageGroup}</p>
              <p className="font-display text-base font-bold text-[var(--color-ink)] mt-0.5">
                {p.breedName}
              </p>
              <p className="font-display text-lg font-extrabold text-[var(--color-green-ink)] tabular-nums mt-2">
                {formatPriceSar(p.avgPrice)}
              </p>
              <p className="text-[11px] text-[var(--color-muted)] tabular-nums mt-1">
                من {formatPriceSar(p.minPrice)} إلى {formatPriceSar(p.maxPrice)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Articles */}
      <div>
        <h2 className="font-display text-2xl font-bold text-[var(--color-ink)] mb-6">
          مقالات وإرشادات للمربين والمشترين
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {articles.map((article) => (
            <article
              key={article.id}
              className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden flex flex-col"
            >
              <div className="aspect-[4/3] bg-[var(--color-cream)]">
                <SafeImage
                  src={article.imageUrl}
                  alt={article.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                <div>
                  <div className="text-xs text-[var(--color-muted)] flex items-center gap-2">
                    <span className="font-semibold text-[var(--color-green-ink)]">
                      {article.category}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{article.readTimeMinutes} دقائق قراءة</span>
                  </div>
                  <h3 className="mt-1.5 font-display text-lg font-bold text-[var(--color-ink)] leading-snug">
                    {article.title}
                  </h3>
                  <p className="mt-2 text-sm text-[var(--color-muted)] leading-relaxed">
                    {article.excerpt}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedArticle(article)}
                  className="text-sm font-semibold text-[var(--color-green-ink)] hover:underline text-right cursor-pointer"
                >
                  قراءة المقال كاملاً
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* FAQ Accordion */}
      <div className="max-w-3xl">
        <h2 className="font-display text-2xl font-bold text-[var(--color-ink)] mb-5">
          الأسئلة الشائعة
        </h2>
        <div className="divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-xl bg-[var(--color-surface)] overflow-hidden">
          {faqs.map((faq) => {
            const isOpen = openFaqId === faq.id;
            return (
              <div key={faq.id}>
                <button
                  type="button"
                  onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                  className="w-full px-5 py-4 text-right flex items-center justify-between gap-4 hover:bg-[var(--color-cream)]/50 cursor-pointer"
                  aria-expanded={isOpen}
                >
                  <span className="font-display text-base font-bold text-[var(--color-ink)]">
                    {faq.question}
                  </span>
                  <ChevronDown
                    size={18}
                    className={`shrink-0 text-[var(--color-muted)] transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-sm text-[var(--color-muted)] leading-relaxed">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Article Reader Modal */}
      {selectedArticle && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="article-modal-title"
          onClick={() => setSelectedArticle(null)}
        >
          <div
            className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-[var(--color-border)]">
              <div>
                <p className="text-xs font-semibold text-[var(--color-green-ink)]">
                  {selectedArticle.category} · {selectedArticle.readTimeMinutes} دقائق قراءة
                </p>
                <h3
                  id="article-modal-title"
                  className="mt-1 font-display text-xl font-extrabold text-[var(--color-ink)]"
                >
                  {selectedArticle.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedArticle(null)}
                aria-label="إغلاق المقال"
                className="w-9 h-9 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-ink)] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-5 aspect-[16/9] rounded-lg overflow-hidden bg-[var(--color-cream)]">
              <SafeImage
                src={selectedArticle.imageUrl}
                alt={selectedArticle.title}
                className="w-full h-full object-cover"
              />
            </div>
            <p className="mt-5 text-base text-[var(--color-ink)] leading-loose whitespace-pre-line">
              {selectedArticle.content}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
