import { useState } from 'react';
import type { Breed, Category, LivestockSex, Region } from '../types/marketplace';
import { STOCK_GALLERY_OPTIONS } from '../lib/format';
import { SafeImage } from './SafeImage';

interface AddListingViewProps {
  categories: Category[];
  breeds: Breed[];
  regions: Region[];
  isAdmin: boolean;
  onCreate: (payload: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

export function AddListingView({
  categories,
  breeds,
  regions,
  isAdmin,
  onCreate,
  onCancel,
}: AddListingViewProps) {
  const mainCategories = categories.filter((c) => c.parentId === null);
  const subCategories = categories.filter((c) => c.parentId !== null);
  const [categoryId, setCategoryId] = useState(mainCategories[0]?.id || 'cat_sheep');
  const [subCategoryId, setSubCategoryId] = useState('auto');
  const [breedId, setBreedId] = useState(breeds[0]?.id || 'brd_naimi');
  const [regionId, setRegionId] = useState(regions[0]?.id || 'reg_riyadh');
  const [city, setCity] = useState('الرياض');
  const [title, setTitle] = useState('');
  const [priceAmount, setPriceAmount] = useState('1800');
  const [expectedPrice, setExpectedPrice] = useState('1700');
  const [sex, setSex] = useState<LivestockSex>('ذكر');
  const [ageMonths, setAgeMonths] = useState('8');
  const [weightKg, setWeightKg] = useState('45');
  const [quantity, setQuantity] = useState('1');
  const [isNegotiable, setIsNegotiable] = useState(true);
  const [allowPriceOffers, setAllowPriceOffers] = useState(true);
  const [vaccinated, setVaccinated] = useState(true);
  const [description, setDescription] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([
    STOCK_GALLERY_OPTIONS[0].url,
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const filteredBreeds = breeds.filter((b) => b.categoryId === categoryId);

  const toggleImage = (url: string) => {
    setSelectedImages((prev) =>
      prev.includes(url) ? (prev.length > 1 ? prev.filter((u) => u !== url) : prev) : [...prev, url]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!title.trim() || Number(priceAmount) <= 0) {
      setError('يرجى إدخال عنوان واضح وسعر صحيح بالريال السعودي');
      return;
    }

    setSubmitting(true);
    try {
      await onCreate({
        categoryId,
        subCategoryId,
        breedId,
        regionId,
        city,
        title: title.trim(),
        priceAmount: Number(priceAmount),
        expectedPrice: expectedPrice.trim() ? Number(expectedPrice) : null,
        sex,
        ageMonths: Number(ageMonths),
        weightKg: Number(weightKg),
        quantity: Number(quantity),
        isNegotiable: isNegotiable || allowPriceOffers,
        allowPriceOffers,
        vaccinated,
        description: description.trim(),
        imageUrls: selectedImages,
      });
    } catch (err: any) {
      setError(err?.message || 'تعذر حفظ الإعلان');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    'w-full h-11 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/75 focus:outline-none focus:border-[var(--color-green-ink)]';

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="pb-6 border-b border-[var(--color-border)]">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--color-ink)]">
          إضافة إعلان جديد
        </h1>
        <p className="mt-1.5 text-sm text-[var(--color-muted)]">
          {isAdmin
            ? 'سيتم نشر الإعلان مباشرة بصلاحية المشرف.'
            : 'أدخل البيانات المنظمة بدقة؛ يمر الإعلان بمراجعة المشرفين قبل الظهور في القائمة العامة.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        {error && (
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-sm text-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-5">
          <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
            1. التصنيف والموقع
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="add-cat"
                className="block text-xs font-medium text-[var(--color-muted)] mb-1.5"
              >
                التصنيف الرئيسي
              </label>
              <select
                id="add-cat"
                value={categoryId}
                onChange={(e) => {
                  const nextCat = e.target.value;
                  setCategoryId(nextCat);
                  const firstBreed = breeds.find((b) => b.categoryId === nextCat);
                  if (firstBreed) setBreedId(firstBreed.id);
                }}
                className={inputCls}
              >
                {mainCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="add-subcat"
                className="block text-xs font-medium text-[var(--color-muted)] mb-1.5"
              >
                الفئة الفرعية (الغرض)
              </label>
              <select
                id="add-subcat"
                value={subCategoryId}
                onChange={(e) => setSubCategoryId(e.target.value)}
                className={inputCls}
              >
                <option value="auto">تصنيف تلقائي ذكي حسب العنوان والمواصفات</option>
                {subCategories.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="add-breed"
                className="block text-xs font-medium text-[var(--color-muted)] mb-1.5"
              >
                السلالة
              </label>
              <select
                id="add-breed"
                value={breedId}
                onChange={(e) => setBreedId(e.target.value)}
                className={inputCls}
              >
                {(filteredBreeds.length > 0 ? filteredBreeds : breeds).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="add-region"
                className="block text-xs font-medium text-[var(--color-muted)] mb-1.5"
              >
                المنطقة
              </label>
              <select
                id="add-region"
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
                className={inputCls}
              >
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="add-city"
                className="block text-xs font-medium text-[var(--color-muted)] mb-1.5"
              >
                المدينة أو المحافظة
              </label>
              <input
                id="add-city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
                className={inputCls}
              />
            </div>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-5">
          <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
            2. تفاصيل الحلال والسعر
          </h2>

          <div>
            <label
              htmlFor="add-title"
              className="block text-xs font-medium text-[var(--color-muted)] mb-1.5"
            >
              عنوان الإعلان
            </label>
            <input
              id="add-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: جذعان نعيمي بلدي تربية مراح محصنة"
              required
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div>
              <label
                htmlFor="add-price"
                className="block text-xs font-medium text-[var(--color-muted)] mb-1.5"
              >
                السعر المطلوب للرأس (ر.س)
              </label>
              <input
                id="add-price"
                type="number"
                min="100"
                value={priceAmount}
                onChange={(e) => setPriceAmount(e.target.value)}
                required
                className={`${inputCls} tabular-nums`}
              />
            </div>

            <div>
              <label
                htmlFor="add-expected-price"
                className="block text-xs font-medium text-[var(--color-muted)] mb-1.5"
              >
                السعر المتوقع للرأس (ر.س)
              </label>
              <input
                id="add-expected-price"
                type="number"
                min="0"
                value={expectedPrice}
                onChange={(e) => setExpectedPrice(e.target.value)}
                placeholder="مثال: 1700"
                className={`${inputCls} tabular-nums`}
              />
            </div>

            <div>
              <label
                htmlFor="add-age"
                className="block text-xs font-medium text-[var(--color-muted)] mb-1.5"
              >
                العمر (بالأشهر)
              </label>
              <input
                id="add-age"
                type="number"
                min="1"
                value={ageMonths}
                onChange={(e) => setAgeMonths(e.target.value)}
                required
                className={`${inputCls} tabular-nums`}
              />
            </div>

            <div>
              <label
                htmlFor="add-weight"
                className="block text-xs font-medium text-[var(--color-muted)] mb-1.5"
              >
                الوزن التقريبي (كجم)
              </label>
              <input
                id="add-weight"
                type="number"
                min="5"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                required
                className={`${inputCls} tabular-nums`}
              />
            </div>

            <div>
              <label
                htmlFor="add-qty"
                className="block text-xs font-medium text-[var(--color-muted)] mb-1.5"
              >
                العدد (رأس)
              </label>
              <input
                id="add-qty"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                className={`${inputCls} tabular-nums`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-center pt-1">
            <div>
              <label
                htmlFor="add-sex"
                className="block text-xs font-medium text-[var(--color-muted)] mb-1.5"
              >
                الجنس
              </label>
              <select
                id="add-sex"
                value={sex}
                onChange={(e) => setSex(e.target.value as LivestockSex)}
                className={inputCls}
              >
                <option value="ذكر">ذكر</option>
                <option value="أنثى">أنثى</option>
                <option value="قطيع مختلط">قطيع مختلط</option>
              </select>
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-[var(--color-ink)] pt-5 cursor-pointer">
              <input
                type="checkbox"
                checked={isNegotiable}
                onChange={(e) => setIsNegotiable(e.target.checked)}
                className="w-4 h-4 accent-[#0B3A29]"
              />
              <span>السعر قابل للتفاوض</span>
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-[var(--color-ink)] pt-5 cursor-pointer">
              <input
                type="checkbox"
                checked={allowPriceOffers}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAllowPriceOffers(checked);
                  if (checked) setIsNegotiable(true);
                }}
                className="w-4 h-4 accent-[#0B3A29]"
              />
              <span>تفعيل تقديم عرض سعر (السوم)</span>
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-[var(--color-ink)] pt-5 cursor-pointer">
              <input
                type="checkbox"
                checked={vaccinated}
                onChange={(e) => setVaccinated(e.target.checked)}
                className="w-4 h-4 accent-[#0B3A29]"
              />
              <span>محصّن بيطرياً</span>
            </label>
          </div>

          {allowPriceOffers && (
            <p className="text-xs text-[var(--color-muted)] bg-[var(--color-cream)] border border-[var(--color-border)] rounded-lg px-3.5 py-2.5 leading-relaxed">
              سيتمكن المشترون في صفحة الإعلان من إرسال عروض أسعار منظمة بالكمية والملاحظات ومقارنتها مع السعر المتوقع، ويمكنك قبولها أو رفضها من تفاصيل الإعلان أو لوحة حسابي.
            </p>
          )}

          <div>
            <label
              htmlFor="add-desc"
              className="block text-xs font-medium text-[var(--color-muted)] mb-1.5"
            >
              الوصف الكامل والحالة الصحية
            </label>
            <textarea
              id="add-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اذكر نوع العلف، التحصينات، إمكانية التوصيل، وأي ملاحظات تهم المشتري..."
              required
              className="w-full p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/75 focus:outline-none focus:border-[var(--color-green-ink)]"
            />
          </div>
        </div>

        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
            3. صور الإعلان (اختر صورة أو أكثر)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {STOCK_GALLERY_OPTIONS.map((opt) => {
              const selected = selectedImages.includes(opt.url);
              return (
                <button
                  key={opt.url}
                  type="button"
                  onClick={() => toggleImage(opt.url)}
                  className={`rounded-lg overflow-hidden border-2 text-right transition-all cursor-pointer ${
                    selected
                      ? 'border-[var(--color-green-ink)] ring-2 ring-[var(--color-gold)]/50'
                      : 'border-[var(--color-border)] opacity-75'
                  }`}
                >
                  <div className="aspect-[4/3]">
                    <SafeImage src={opt.url} alt={opt.label} className="w-full h-full object-cover" />
                  </div>
                  <p className="px-2 py-1.5 text-xs font-medium text-[var(--color-ink)] bg-[var(--color-cream)] truncate">
                    {opt.label}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 rounded-lg border border-[var(--color-border)] text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-cream)] cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
          >
            {submitting ? 'جاري الإرسال...' : isAdmin ? 'نشر الإعلان مباشرة' : 'إرسال للمراجعة والنشر'}
          </button>
        </div>
      </form>
    </section>
  );
}
