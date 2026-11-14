import { Heart } from 'lucide-react';
import type { Breed, Category, Listing, Region, SellerProfile } from '../types/marketplace';
import { formatPriceSar, formatRelativeArabicTime } from '../lib/format';
import { SafeImage } from './SafeImage';

interface ListingCardProps {
  listing: Listing;
  breed?: Breed;
  subCategory?: Category;
  region?: Region;
  seller?: SellerProfile;
  isFavorite: boolean;
  onSelect: (listing: Listing) => void;
  onToggleFavorite: (listingId: string) => void;
}

export function ListingCard({
  listing,
  breed,
  subCategory,
  region,
  seller,
  isFavorite,
  onSelect,
  onToggleFavorite,
}: ListingCardProps) {
  const coverImage = listing.images[0]?.url || breed?.imageUrl;

  return (
    <article className="group bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md flex flex-col">
      {/* Uniform 4:3 Image Container */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-cream)]">
        <button
          type="button"
          onClick={() => onSelect(listing)}
          className="w-full h-full block text-right cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
          aria-label={`عرض تفاصيل ${listing.title}`}
        >
          <SafeImage
            src={coverImage}
            alt={listing.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </button>

        {/* Favorite Toggle */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(listing.id);
          }}
          aria-label={isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
          aria-pressed={isFavorite}
          className={`absolute top-3 left-3 w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--color-gold)] ${
            isFavorite
              ? 'bg-[var(--color-green)] text-[var(--color-gold)]'
              : 'bg-[var(--color-surface)]/90 text-[var(--color-ink)] hover:bg-[var(--color-surface)]'
          }`}
        >
          <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Card Body: Clean Unboxed Metadata, Title, Prominent Green Price */}
      <div className="p-4 flex flex-col flex-1 justify-between gap-3">
        <div>
          {/* Unboxed Metadata Line (Zero-Pill Rule) */}
          <div className="flex items-center flex-wrap gap-1.5 text-xs text-[var(--color-muted)] mb-1.5">
            <span className="font-semibold text-[var(--color-green-ink)]">
              {breed?.name || 'أغنام'}
            </span>
            {subCategory && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[var(--color-ink)] font-medium">{subCategory.name}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{listing.ageMonths} أشهر</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{listing.weightKg} كجم</span>
          </div>

          <h3 className="font-display text-base font-bold text-[var(--color-ink)] leading-snug line-clamp-2">
            <button
              type="button"
              onClick={() => onSelect(listing)}
              className="text-right hover:text-[var(--color-green-ink)] transition-colors cursor-pointer"
            >
              {listing.title}
            </button>
          </h3>
        </div>

        <div className="pt-3 border-t border-[var(--color-border)]/80 flex items-baseline justify-between gap-2">
          <div>
            <p className="font-display text-lg font-extrabold text-[var(--color-green-ink)] tabular-nums">
              {formatPriceSar(listing.priceAmount)}
            </p>
            <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
              {listing.allowPriceOffers
                ? 'يقبل عروض السعر'
                : listing.isNegotiable
                ? 'قابل للتفاوض'
                : 'سعر ثابت'}
              {seller?.verifiedAt ? ' · مربي موثق' : ''}
            </p>
          </div>

          <div className="text-left text-xs text-[var(--color-muted)] shrink-0">
            <p className="font-medium text-[var(--color-ink)]">
              {region?.name || ''} — {listing.city}
            </p>
            <p className="text-[11px] mt-0.5">{formatRelativeArabicTime(listing.publishedAt)}</p>
          </div>
        </div>
      </div>
    </article>
  );
}
