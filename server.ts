import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { loadConfig, type AppConfig } from './server/config';
import { createAuthMiddleware } from './server/auth/middleware';
import { createAuthRouter } from './server/auth/routes';
import { SessionManager } from './server/auth/sessions';
import { migrateAuthFields, DEMO_USER_IDS } from './server/auth/migrate';
import { hashPassword } from './server/auth/password';
import { toPublicSeller, toSelfUser } from './server/auth/serialize';
import {
  canAccessConversation,
  canEditListing,
  canRespondToOffer,
  canViewListing,
  isAdmin,
  visibleConversations,
  visibleOffers,
} from './server/auth/policy';
import { createRealtime } from './server/realtime';
import { loadEnvForEntryPoint } from './server/env';
import { acquireStoreLock, resolveDataDir, STORE_FILE_NAME } from './server/storage';
import type { Credential } from './server/auth/types';
import type { SessionRecord } from './server/auth/sessions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * Where one server instance keeps its data. It is created per startServer() call and passed explicitly:
 * there is deliberately NO module-level DATA_DIR / STORE_PATH, so two instances in one process
 * (integration tests, tooling) can never write into each other's store.
 */
interface StorePaths {
  readonly dataDir: string;
  readonly storePath: string;
}

function makeStorePaths(dataDir: string): StorePaths {
  return { dataDir, storePath: path.join(dataDir, STORE_FILE_NAME) };
}

interface StoreData {
  users: any[];
  sellers: any[];
  categories: any[];
  breeds: any[];
  regions: any[];
  listings: any[];
  favorites: Record<string, string[]>;
  conversations: any[];
  priceOffers: any[];
  notifications: any[];
  sellerReviews: any[];
  reports: any[];
  indicativePrices: any[];
  articles: any[];
  faqs: any[];
  auditLogs: any[];
  /** Argon2id password hashes, one per account that can sign in. Never sent to clients. */
  credentials: Credential[];
  /** Server-side sessions (only SHA-256 hashes of the cookie tokens are stored). */
  sessions: SessionRecord[];
}

const IMG = {
  hero: '/src/assets/images/hero_saudi_livestock_1794608168927.jpg',
  naimi: '/src/assets/images/breed_naimi_sheep_1794608169331.jpg',
  najdi: '/src/assets/images/breed_najdi_sheep_1794608169810.jpg',
  harri: '/src/assets/images/breed_harri_sheep_1794608169989.jpg',
  ardhi: '/src/assets/images/breed_ardhi_goat_1794608169786.jpg',
  sawakni: '/src/assets/images/breed_sawakni_camels_1794608171012.jpg',
};

function createSeedData(): StoreData {
  const now = new Date('2026-11-13T12:00:00Z').getTime();
  const hoursAgo = (h: number) => new Date(now - h * 3600 * 1000).toISOString();

  const users = [
    {
      id: 'usr_seller_1',
      phone: '0504829104',
      email: 'fahad@alqahtani-farm.sa',
      name: 'فهد القحطاني',
      role: 'seller',
      status: 'active',
      createdAt: hoursAgo(720),
    },
    {
      id: 'usr_seller_2',
      phone: '0559134287',
      email: 'abdulrahman@najd-herds.sa',
      name: 'عبدالرحمن الدوسري',
      role: 'seller',
      status: 'active',
      createdAt: hoursAgo(960),
    },
    {
      id: 'usr_seller_3',
      phone: '0547201833',
      email: 'salem@hijaz-livestock.sa',
      name: 'سالم الحربي',
      role: 'seller',
      status: 'active',
      createdAt: hoursAgo(600),
    },
    {
      id: 'usr_buyer_1',
      phone: '0561940281',
      email: 'khalid@riyadh.sa',
      name: 'خالد السبيعي',
      role: 'buyer',
      status: 'active',
      createdAt: hoursAgo(300),
    },
    {
      id: 'usr_admin_1',
      phone: '0500000001',
      email: 'admin@souqalghanam.sa',
      name: 'إدارة المنصة',
      role: 'admin',
      status: 'active',
      createdAt: hoursAgo(2000),
    },
  ];

  const sellers = [
    {
      userId: 'usr_seller_1',
      displayName: 'مراح القحطاني للنعيمي الفاخر',
      bio: 'مربٍ متخصص في سلالات النعيمي النجدية والشمالية منذ أكثر من 18 عاماً، مع التزام تام بالتحصين البيطري والتغذية الطبيعية.',
      regionId: 'reg_riyadh',
      city: 'الرياض — المزاحمية',
      phone: '0504829104',
      whatsapp: '966504829104',
      verifiedAt: hoursAgo(500),
      yearsExperience: 18,
      specialty: 'نعيمي ونجدي',
      rating: 4.8,
      ratingCount: 2,
      totalSales: 142,
    },
    {
      userId: 'usr_seller_2',
      displayName: 'مزارع الدوسري للسلالات النجدية والعارضية',
      bio: 'إنتاج وتأصيل الفحول النجدية والماعز العارضي الصنف في منطقة القصيم والخرج، مع شهادة صحية لكل رأس.',
      regionId: 'reg_qassim',
      city: 'بريدة — القصيم',
      phone: '0559134287',
      whatsapp: '966559134287',
      verifiedAt: hoursAgo(800),
      yearsExperience: 14,
      specialty: 'نجدي وعارضي',
      rating: 4.5,
      ratingCount: 2,
      totalSales: 98,
    },
    {
      userId: 'usr_seller_3',
      displayName: 'حظائر الحربي للحري والسواكني',
      bio: 'توفير أجود أنواع الحري البلدي والسواكني المربى محلياً للمناسبات والذبائح والتربية في منطقة مكة المكرمة والطائف.',
      regionId: 'reg_makkah',
      city: 'الطائف — مكة المكرمة',
      phone: '0547201833',
      whatsapp: '966547201833',
      verifiedAt: hoursAgo(400),
      yearsExperience: 11,
      specialty: 'حري وسواكني',
      rating: 5.0,
      ratingCount: 1,
      totalSales: 176,
    },
  ];

  const categories = [
    { id: 'cat_sheep', name: 'الأغنام', slug: 'sheep', parentId: null },
    { id: 'cat_goats', name: 'الماعز', slug: 'goats', parentId: null },
    { id: 'cat_breeding', name: 'فحول الإنتاج', slug: 'breeding-rams', parentId: null },
    {
      id: 'sub_slaughter',
      name: 'ذبائح',
      slug: 'slaughter',
      parentId: 'cat_sheep',
      description: 'أغنام وماعز جاهزة للذبح والمناسبات والأضاحي',
      keywords: ['جذعان', 'هرفي', 'بهم', 'طليان', 'ذبيحة', 'ذبائح', 'ولائم', 'عزائم', 'مناسبات'],
    },
    {
      id: 'sub_breeding',
      name: 'مواشي للتربية',
      slug: 'for-breeding',
      parentId: 'cat_sheep',
      description: 'إناث دفيع ومتابيع وقطيع إنتاج للتربية والتكاثر',
      keywords: ['رخال', 'دفيع', 'متابيع', 'حلوب', 'مضاريع', 'مقاريب', 'تربية', 'جفرتين'],
    },
    {
      id: 'sub_show',
      name: 'مواشي للعرض',
      slug: 'for-show',
      parentId: 'cat_breeding',
      description: 'فحول صنف وسلالات فاخرة للعرض والإنتاج المميز',
      keywords: ['فحل', 'صنف', 'فاخر', 'ناهي', 'أبرص', 'عرض', 'أصل وفصل', 'نسف'],
    },
  ];

  const breeds = [
    {
      id: 'brd_naimi',
      categoryId: 'cat_sheep',
      name: 'نعيمي',
      slug: 'naimi',
      origin: 'نجد والشمال',
      summary: 'السلالة الأكثر طلباً في المملكة للذبائح والمناسبات، تمتاز بجودة اللحم وتوازن الدهن وقدرتها العالية على التكيف.',
      avgWeightKg: '38 – 65 كجم',
      priceRangeSar: '1,450 – 2,400 ر.س',
      imageUrl: IMG.naimi,
      characteristics: ['رأس بني محمر وصوف أبيض كثيف', 'تتحمل أجواء الصحراء والبرد', 'نسبة تصافي لحم مرتفعة'],
    },
    {
      id: 'brd_najdi',
      categoryId: 'cat_sheep',
      name: 'نجدي',
      slug: 'najdi',
      origin: 'وسط المملكة (نجد)',
      summary: 'أيقونة المواشي النجدية الأصيلة، معروفة بقامتها الطويلة وشعرها الأسود اللامع وأنفها المقوّس وقيمتها العالية لدى المربين.',
      avgWeightKg: '42 – 72 كجم',
      priceRangeSar: '1,650 – 3,500 ر.س',
      imageUrl: IMG.najdi,
      characteristics: ['لون أسود حالك مع بياض في الوجه والأطراف', 'مناسبة جداً للتربية والإنتاج الفاخر', 'خصوبة عالية ومقاومة للجفاف'],
    },
    {
      id: 'brd_harri',
      categoryId: 'cat_sheep',
      name: 'حري',
      slug: 'harri',
      origin: 'الحجاز والساحل الغربي',
      summary: 'سلالة حجازية عريقة تشتهر بلحمها الطري ونموها السريع، وتحظى بإقبال كبير في مكة وجدة والطائف.',
      avgWeightKg: '32 – 52 كجم',
      priceRangeSar: '1,250 – 1,950 ر.س',
      imageUrl: IMG.harri,
      characteristics: ['لون أبيض ناصع وصوف ناعم متوسط', 'لحم خفيف الدهون ومذاق مميز', 'معدلات توأم عالية'],
    },
    {
      id: 'brd_ardhi',
      categoryId: 'cat_goats',
      name: 'عارضي',
      slug: 'ardhi',
      origin: 'هضبة نجد والعارض',
      summary: 'الماعز السعودي الأصيل المفضّل للإنتاج والزينة، يمتاز بالأذنين الطويلتين والهيكل القوي والقدرة الممتازة على إدرار الحليب.',
      avgWeightKg: '35 – 60 كجم',
      priceRangeSar: '1,100 – 2,800 ر.س',
      imageUrl: IMG.ardhi,
      characteristics: ['شعر أسود لامع وأذنان طويلتان متدليتان', 'مقاوم للحرارة وقلة المرعى', 'مطلوب لفحول الصنف والتربية'],
    },
    {
      id: 'brd_sawakni',
      categoryId: 'cat_sheep',
      name: 'سواكني',
      slug: 'sawakni',
      origin: 'مربى محلياً',
      summary: 'خيار اقتصادي عملي للولائم والعقود الغذائية، يمتاز بوفرة اللحم وانخفاض الشحم خاصة عند تربيته وتغذيته محلياً.',
      avgWeightKg: '40 – 62 كجم',
      priceRangeSar: '950 – 1,450 ر.س',
      imageUrl: IMG.sawakni,
      characteristics: ['غطاء قصير بلون بني أو أحمر فاتح', 'وزن لحم صافٍ مرتفع', 'سعر اقتصادي للمناسبات الكبيرة'],
    },
  ];

  const regions = [
    { id: 'reg_riyadh', name: 'الرياض', parentId: null },
    { id: 'reg_makkah', name: 'مكة المكرمة', parentId: null },
    { id: 'reg_eastern', name: 'المنطقة الشرقية', parentId: null },
    { id: 'reg_qassim', name: 'القصيم', parentId: null },
    { id: 'reg_madinah', name: 'المدينة المنورة', parentId: null },
    { id: 'reg_asir', name: 'عسير', parentId: null },
    { id: 'reg_hail', name: 'حائل', parentId: null },
    { id: 'reg_tabuk', name: 'تبوك', parentId: null },
  ];

  const listings = [
    {
      id: 'lst_101',
      sellerId: 'usr_seller_1',
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_slaughter',
      breedId: 'brd_naimi',
      regionId: 'reg_riyadh',
      city: 'المزاحمية',
      title: 'جذعان نعيمي بلدي تربية مراح شرط الصحة والنظافة',
      slug: 'naimi-lambs-riyadh-101',
      description: 'عدد 12 رأس جذعان نعيمي بلدي تربية مراح خاص في المزاحمية، التغذية على الشعير والبرسيم الصافي، محصنة دموي ومعوي، أوزان طيبة وتصلح للذبائح والمناسبات.',
      priceAmount: 1850,
      expectedPrice: 1750,
      currency: 'SAR',
      sex: 'ذكر',
      ageMonths: 8,
      weightKg: 46,
      quantity: 12,
      isNegotiable: true,
      allowPriceOffers: true,
      vaccinated: true,
      status: 'Published',
      publishedAt: hoursAgo(2),
      createdAt: hoursAgo(3),
      updatedAt: hoursAgo(2),
      isFeatured: true,
      images: [
        { id: 'img_101_1', url: IMG.naimi, position: 1 },
        { id: 'img_101_2', url: IMG.hero, position: 2 },
      ],
    },
    {
      id: 'lst_102',
      sellerId: 'usr_seller_2',
      categoryId: 'cat_breeding',
      subCategoryId: 'sub_show',
      breedId: 'brd_najdi',
      regionId: 'reg_qassim',
      city: 'بريدة',
      title: 'فحل نجدي رباع فاخر سلالة أصيلة شرط النسف',
      slug: 'najdi-ram-qassim-102',
      description: 'فحل نجدي صنف رباع، جرم ناهي، رأس أبرص، شعرة حريرية، منتج وله إنتاج فاخر في المراح، خالٍ من جميع العيوب والأمراض ولله الحمد.',
      priceAmount: 3400,
      expectedPrice: 3150,
      currency: 'SAR',
      sex: 'ذكر',
      ageMonths: 24,
      weightKg: 70,
      quantity: 1,
      isNegotiable: true,
      allowPriceOffers: true,
      vaccinated: true,
      status: 'Published',
      publishedAt: hoursAgo(5),
      createdAt: hoursAgo(6),
      updatedAt: hoursAgo(5),
      isFeatured: true,
      images: [
        { id: 'img_102_1', url: IMG.najdi, position: 1 },
        { id: 'img_102_2', url: IMG.naimi, position: 2 },
      ],
    },
    {
      id: 'lst_103',
      sellerId: 'usr_seller_3',
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_slaughter',
      breedId: 'brd_harri',
      regionId: 'reg_makkah',
      city: 'الطائف',
      title: 'بهم حري أعمار 6 إلى 7 أشهر من حلال الطائف',
      slug: 'harri-lambs-taif-103',
      description: 'بهم حري سمان وشحم طيب، رعي طبيعي مع علف مركز، البيع جملة أو تفريد حسب الرغبة مع إمكانية التوصيل داخل مكة وجدة والطائف.',
      priceAmount: 1480,
      currency: 'SAR',
      sex: 'ذكر',
      ageMonths: 7,
      weightKg: 38,
      quantity: 20,
      isNegotiable: false,
      vaccinated: true,
      status: 'Published',
      publishedAt: hoursAgo(9),
      createdAt: hoursAgo(10),
      updatedAt: hoursAgo(9),
      isFeatured: true,
      images: [
        { id: 'img_103_1', url: IMG.harri, position: 1 },
      ],
    },
    {
      id: 'lst_104',
      sellerId: 'usr_seller_2',
      categoryId: 'cat_goats',
      subCategoryId: 'sub_breeding',
      breedId: 'brd_ardhi',
      regionId: 'reg_riyadh',
      city: 'الخرج',
      title: 'تيس عارضي ثني أصل وفصل مع جفرتين دفيع',
      slug: 'ardhi-goat-kharj-104',
      description: 'مجموعة عوارض صنف: تيس ثني جرم طيب وأذن طويلة وجفرتين مضاريع على فحل المراح، سليمة ومحصنة كاملة.',
      priceAmount: 2650,
      currency: 'SAR',
      sex: 'قطيع مختلط',
      ageMonths: 14,
      weightKg: 48,
      quantity: 3,
      isNegotiable: true,
      vaccinated: true,
      status: 'Published',
      publishedAt: hoursAgo(14),
      createdAt: hoursAgo(15),
      updatedAt: hoursAgo(14),
      isFeatured: false,
      images: [
        { id: 'img_104_1', url: IMG.ardhi, position: 1 },
      ],
    },
    {
      id: 'lst_105',
      sellerId: 'usr_seller_3',
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_slaughter',
      breedId: 'brd_sawakni',
      regionId: 'reg_eastern',
      city: 'الدمام',
      title: 'سواكني مربى في المملكة 5 أشهر نظيف جداً',
      slug: 'sawakni-dammam-105',
      description: 'سواكني تربية محلية لمدة 5 أشهر على البرسيم والشعير، لحم أحمر صافي وخالٍ من الزفر، مناسب للعزائم والمطابخ.',
      priceAmount: 1180,
      currency: 'SAR',
      sex: 'ذكر',
      ageMonths: 11,
      weightKg: 50,
      quantity: 15,
      isNegotiable: false,
      vaccinated: true,
      status: 'Published',
      publishedAt: hoursAgo(20),
      createdAt: hoursAgo(22),
      updatedAt: hoursAgo(20),
      isFeatured: false,
      images: [
        { id: 'img_105_1', url: IMG.sawakni, position: 1 },
      ],
    },
    {
      id: 'lst_106',
      sellerId: 'usr_seller_1',
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_breeding',
      breedId: 'brd_naimi',
      regionId: 'reg_hail',
      city: 'حائل',
      title: 'رخال نعيميات صنف دفيع مقاريب عدد 8 رؤوس',
      slug: 'naimi-ewes-hail-106',
      description: 'رخال نعيميات جذعات وثنيات مقاريب على فحل من حلال الشمال، أصحاح وأحوال ممتازة والبيع سمح للصامل.',
      priceAmount: 2150,
      currency: 'SAR',
      sex: 'أنثى',
      ageMonths: 15,
      weightKg: 54,
      quantity: 8,
      isNegotiable: true,
      vaccinated: true,
      status: 'Published',
      publishedAt: hoursAgo(26),
      createdAt: hoursAgo(28),
      updatedAt: hoursAgo(26),
      isFeatured: false,
      images: [
        { id: 'img_106_1', url: IMG.naimi, position: 1 },
      ],
    },
    {
      id: 'lst_107',
      sellerId: 'usr_seller_1',
      categoryId: 'cat_sheep',
      subCategoryId: 'sub_slaughter',
      breedId: 'brd_najdi',
      regionId: 'reg_riyadh',
      city: 'رماح',
      title: 'طليان نجدية جذعان تربية برية — بانتظار المراجعة',
      slug: 'najdi-pending-107',
      description: 'طليان نجدية من إنتاج مراح رماح، مرعى طبيعي مع شعير بلدي، أعمار 7 أشهر ونظيفة تماماً.',
      priceAmount: 1950,
      currency: 'SAR',
      sex: 'ذكر',
      ageMonths: 7,
      weightKg: 43,
      quantity: 6,
      isNegotiable: true,
      vaccinated: true,
      status: 'Pending',
      publishedAt: hoursAgo(1),
      createdAt: hoursAgo(1),
      updatedAt: hoursAgo(1),
      isFeatured: false,
      images: [
        { id: 'img_107_1', url: IMG.najdi, position: 1 },
      ],
    },
    {
      id: 'lst_108',
      sellerId: 'usr_seller_3',
      categoryId: 'cat_goats',
      subCategoryId: 'sub_breeding',
      breedId: 'brd_ardhi',
      regionId: 'reg_makkah',
      city: 'جدة',
      title: 'معزا عوارض حلوب متابيع — بانتظار الاعتماد',
      slug: 'ardhi-pending-108',
      description: 'عنزين عوارض معها 3 جفار، حليب وافر وصحة ممتازة ومحصنة ضد الطاعون والدموي.',
      priceAmount: 2300,
      currency: 'SAR',
      sex: 'أنثى',
      ageMonths: 22,
      weightKg: 45,
      quantity: 2,
      isNegotiable: true,
      vaccinated: true,
      status: 'Pending',
      publishedAt: hoursAgo(0.5),
      createdAt: hoursAgo(0.5),
      updatedAt: hoursAgo(0.5),
      isFeatured: false,
      images: [
        { id: 'img_108_1', url: IMG.ardhi, position: 1 },
      ],
    },
  ];

  const favorites: Record<string, string[]> = {
    usr_buyer_1: ['lst_101', 'lst_102'],
    usr_seller_1: ['lst_102'],
    usr_admin_1: ['lst_101'],
  };

  const conversations = [
    {
      id: 'conv_1',
      listingId: 'lst_101',
      buyerId: 'usr_buyer_1',
      sellerId: 'usr_seller_1',
      updatedAt: hoursAgo(1),
      messages: [
        {
          id: 'msg_1',
          conversationId: 'conv_1',
          senderId: 'usr_buyer_1',
          body: 'السلام عليكم، هل الجذعان النعيمي ما زالت متوفرة؟ وكم تحسب لي 4 رؤوس؟',
          createdAt: hoursAgo(1.5),
        },
        {
          id: 'msg_2',
          conversationId: 'conv_1',
          senderId: 'usr_seller_1',
          body: 'وعليكم السلام ورحمة الله، حياك الله يا أبو عبدالله، نعم متوفرة وللأربعة رؤوس نحسبها لك بـ 1,800 ريال للرأس مع التحصين.',
          createdAt: hoursAgo(1),
        },
      ],
    },
  ];

  const priceOffers = [
    {
      id: 'off_1',
      listingId: 'lst_101',
      buyerId: 'usr_buyer_1',
      buyerName: 'خالد السبيعي',
      sellerId: 'usr_seller_1',
      offeredPrice: 1750,
      quantity: 4,
      note: 'شامل التوصيل داخل الرياض والدفع عند الاستلام.',
      status: 'pending',
      createdAt: hoursAgo(1.2),
      updatedAt: hoursAgo(1.2),
    },
    {
      id: 'off_2',
      listingId: 'lst_102',
      buyerId: 'usr_buyer_1',
      buyerName: 'خالد السبيعي',
      sellerId: 'usr_seller_2',
      offeredPrice: 3100,
      quantity: 1,
      note: 'صامل في الشراء بعد المعاينة في بريدة.',
      status: 'pending',
      createdAt: hoursAgo(3),
      updatedAt: hoursAgo(3),
    },
  ];

  const reports = [
    {
      id: 'rep_1',
      reporterId: 'usr_buyer_1',
      listingId: 'lst_105',
      reason: 'استفسار عن السعر والتفاصيل',
      details: 'يرجى التأكد من توضيح عمر التغذية المحلية في الوصف بشكل أدق.',
      status: 'open',
      createdAt: hoursAgo(4),
    },
  ];

  const indicativePrices = [
    {
      id: 'prc_1',
      breedId: 'brd_naimi',
      breedName: 'نعيمي بلدي',
      categoryName: 'الأغنام',
      ageGroup: 'هرفي / جذع (6-9 أشهر)',
      minPrice: 1550,
      maxPrice: 2050,
      avgPrice: 1800,
      trend: 'up',
      regionNote: 'الرياض والقصيم والشرقية',
      updatedAt: hoursAgo(6),
    },
    {
      id: 'prc_2',
      breedId: 'brd_najdi',
      breedName: 'نجدي أصيل',
      categoryName: 'الأغنام',
      ageGroup: 'جذع (7-10 أشهر)',
      minPrice: 1700,
      maxPrice: 2350,
      avgPrice: 1980,
      trend: 'stable',
      regionNote: 'الرياض وحائل والقصيم',
      updatedAt: hoursAgo(6),
    },
    {
      id: 'prc_3',
      breedId: 'brd_harri',
      breedName: 'حري حجازي',
      categoryName: 'الأغنام',
      ageGroup: 'بهم وسط (5-8 أشهر)',
      minPrice: 1300,
      maxPrice: 1750,
      avgPrice: 1520,
      trend: 'stable',
      regionNote: 'مكة وجدة والطائف',
      updatedAt: hoursAgo(6),
    },
    {
      id: 'prc_4',
      breedId: 'brd_ardhi',
      breedName: 'ماعز عارضي',
      categoryName: 'الماعز',
      ageGroup: 'جذع / ثني',
      minPrice: 1150,
      maxPrice: 2400,
      avgPrice: 1650,
      trend: 'up',
      regionNote: 'الرياض والقصيم',
      updatedAt: hoursAgo(6),
    },
    {
      id: 'prc_5',
      breedId: 'brd_sawakni',
      breedName: 'سواكني مربى محلياً',
      categoryName: 'الأغنام',
      ageGroup: 'جذع كبير (9-12 شهراً)',
      minPrice: 1050,
      maxPrice: 1400,
      avgPrice: 1220,
      trend: 'down',
      regionNote: 'جميع مناطق المملكة',
      updatedAt: hoursAgo(6),
    },
  ];

  const articles = [
    {
      id: 'art_1',
      title: 'كيف تفحص الأضحية أو الذبيحة قبل الشراء؟ 7 علامات أساسية للصحة',
      category: 'إرشادات المشتري',
      readTimeMinutes: 4,
      publishedAt: hoursAgo(72),
      excerpt: 'دليل عملي لفحص العينين والصوف والأسنان والنشاط الحركي للتأكد من خلو الماشية من العيوب الشرعية والصحية.',
      content:
        'عند معاينة الماشية سواء في الحظيرة أو عند الاستلام، ابدأ بفحص النشاط العام للحيوان واستجابته للمحيط. تأكد من لمعان العينين وخلوهما من الإفرازات، وافحص الصوف أو الشعر للتأكد من تماسكه وعدم وجود مناطق صلع أو جرب. كما يُنصح بفحص الأسنان لمعرفة العمر التقريبي (جذع، ثني، رباع)، والتأكد من امتلاء الظهر والخواصر دلالةً على جودة التغذية.',
      imageUrl: IMG.naimi,
    },
    {
      id: 'art_2',
      title: 'برنامج التحصين البيطري السنوي للمربين في البيئة السعودية',
      category: 'رعاية المراح',
      readTimeMinutes: 5,
      publishedAt: hoursAgo(120),
      excerpt: 'جدول زمني متكامل للقاحات الدموي والمعوي والطاعون والجدري لتقليل النفوق ورفع كفاءة الإنتاج.',
      content:
        'تُعد الوقاية البيطرية حجر الأساس في نجاح أي مشروع تربية مواشٍ. يُنصح بالالتزام بجرعات التسمم الدموي والمعوي كل 6 أشهر، وتطعيم الجدري والحمى القلاعية حسب التوجيهات البيطرية الرسمية، مع عزل الحالات المشتراة حديثاً لمدة 14 يوماً قبل دمجها في القطيع الرئيسي.',
      imageUrl: IMG.hero,
    },
    {
      id: 'art_3',
      title: 'الفرق بين النعيمي والنجدي والحري: أيهما يناسب احتياجك؟',
      category: 'دليل السلالات',
      readTimeMinutes: 4,
      publishedAt: hoursAgo(180),
      excerpt: 'مقارنة شاملة في الوزن والمذاق وتحمّل المناخ والعائد الاقتصادي للمربين والمستهلكين.',
      content:
        'تتميز المملكة بتنوع سلالات الأغنام لتناسب أذواق المستهلكين وبيئات التربية المختلفة. يتصدر النعيمي مبيعات الولائم في الوسطى والشرقية لتوازن شحمه، بينما يحتفظ النجدي بمكانة تراثية واقتصادية رفيعة لدى المربين المحترفين، في حين يُعد الحري الخيار الأول في المنطقة الغربية بفضل طراوة لحمه وسرعة نموه.',
      imageUrl: IMG.najdi,
    },
  ];

  const faqs = [
    {
      id: 'faq_1',
      question: 'كيف تتم مراجعة الإعلانات في سوق الغنم 2.0؟',
      answer: 'يمر كل إعلان جديد بحالة «بانتظار المراجعة» حيث يتأكد فريق الإشراف من وضوح الصور واكتمال المواصفات (السلالة، العمر، الوزن، السعر بالريال) قبل اعتماده للنشر، وذلك لحماية المشترين والمربين.',
    },
    {
      id: 'faq_2',
      question: 'هل الأسعار الاسترشادية ملزمة للبائعين؟',
      answer: 'لا، الأسعار الاسترشادية هي متوسطات استرشادية تُحدّث أسبوعياً بناءً على حركة السوق والمناطق، وتساعد البائع والمشتري على التقييم العادل دون إلزام بسعر محدد.',
    },
    {
      id: 'faq_3',
      question: 'كيف أحصل على توثيق حساب المربي؟',
      answer: 'يمكن للمربين المنتظمين طلب التوثيق بعد نشر 3 إعلانات مكتملة وتوثيق رقم الجوال وتحديد موقع المراح، ليظهر شعار المربي الموثوق في ملفهم الشخصي وإعلاناتهم.',
    },
    {
      id: 'faq_4',
      question: 'ماذا أفعل إذا لاحظت إعلاناً غير مطابق أو مخالفاً؟',
      answer: 'يمكنك استخدام زر «إبلاغ عن مخالفة» داخل صفحة تفاصيل الإعلان، وسيصل البلاغ فوراً إلى لوحة المشرفين لاتخاذ الإجراء المناسب وحماية المستخدمين.',
    },
  ];

  const auditLogs = [
    {
      id: 'aud_1',
      actorId: 'usr_admin_1',
      actorName: 'إدارة المنصة',
      action: 'اعتماد إعلان',
      targetType: 'listing',
      targetId: 'lst_101',
      note: 'تم التحقق من الصور والمواصفات البيطرية.',
      createdAt: hoursAgo(2),
    },
  ];

  const notifications = [
    {
      id: 'ntf_1',
      userId: 'usr_buyer_1',
      type: 'new_message',
      title: 'رسالة جديدة من فهد القحطاني',
      body: 'وعليكم السلام ورحمة الله، حياك الله يا أبو عبدالله، نعم متوفرة وللأربعة رؤوس نحسبها لك بـ 1,800 ريال...',
      listingId: 'lst_101',
      conversationId: 'conv_1',
      read: false,
      createdAt: hoursAgo(1),
    },
  ];

  const sellerReviews = [
    {
      id: 'rev_1',
      sellerId: 'usr_seller_1',
      reviewerId: 'usr_buyer_1',
      reviewerName: 'خالد السبيعي',
      rating: 5,
      comment: 'تعامل راقٍ ومصداقية في الوزن والعمر والتحصين، الحلال وصل بحالة ممتازة.',
      createdAt: hoursAgo(48),
      updatedAt: hoursAgo(48),
    },
    {
      id: 'rev_2',
      sellerId: 'usr_seller_1',
      reviewerId: 'usr_seller_3',
      reviewerName: 'سالم الحربي',
      rating: 5,
      comment: 'مراح نظيف وأمانة في البيع والشراء وسرعة في التوصيل.',
      createdAt: hoursAgo(120),
      updatedAt: hoursAgo(120),
    },
    {
      id: 'rev_3',
      sellerId: 'usr_seller_2',
      reviewerId: 'usr_buyer_1',
      reviewerName: 'خالد السبيعي',
      rating: 4,
      comment: 'سلالات نجدية طيبة وأصل معروف، والتجاوب سريع.',
      createdAt: hoursAgo(96),
      updatedAt: hoursAgo(96),
    },
    {
      id: 'rev_4',
      sellerId: 'usr_seller_2',
      reviewerId: 'usr_seller_1',
      reviewerName: 'فهد القحطاني',
      rating: 5,
      comment: 'فحول صنف ومستوى عالٍ من العناية البيطرية.',
      createdAt: hoursAgo(168),
      updatedAt: hoursAgo(168),
    },
    {
      id: 'rev_5',
      sellerId: 'usr_seller_3',
      reviewerId: 'usr_buyer_1',
      reviewerName: 'خالد السبيعي',
      rating: 5,
      comment: 'الحري البلدي مطابق للمواصفات والوزن تماماً، أنصح بالتعامل معه.',
      createdAt: hoursAgo(72),
      updatedAt: hoursAgo(72),
    },
  ];

  return {
    users,
    sellers,
    categories,
    breeds,
    regions,
    listings,
    favorites,
    conversations,
    priceOffers,
    notifications,
    sellerReviews,
    reports,
    indicativePrices,
    articles,
    faqs,
    auditLogs,
    credentials: [],
    sessions: [],
  };
}

function inferSubCategoryId(
  listing: { title?: string; description?: string; sex?: string; ageMonths?: number; categoryId?: string },
  categories: any[]
): string | null {
  const subCategories = categories.filter((c) => c.parentId !== null);
  if (subCategories.length === 0) return null;

  const text = `${listing.title || ''} ${listing.description || ''}`.toLowerCase();
  let bestId: string | null = null;
  let bestScore = 0;

  for (const sub of subCategories) {
    const kws: string[] = Array.isArray(sub.keywords) ? sub.keywords : [];
    let score = 0;
    for (const kw of kws) {
      if (kw && text.includes(kw.toLowerCase())) {
        score += 2;
      }
    }
    if (sub.parentId && sub.parentId === listing.categoryId) {
      score += 0.5;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = sub.id;
    }
  }

  if (bestScore >= 2 && bestId) return bestId;

  if (listing.categoryId === 'cat_breeding') {
    const showCat = subCategories.find((c) => c.id === 'sub_show');
    if (showCat) return showCat.id;
  }
  if (listing.sex === 'أنثى' || listing.sex === 'قطيع مختلط') {
    const breedCat = subCategories.find((c) => c.id === 'sub_breeding');
    if (breedCat) return breedCat.id;
  }
  const slaughterCat = subCategories.find((c) => c.id === 'sub_slaughter');
  return slaughterCat?.id || subCategories[0]?.id || null;
}

function hydrateStore(parsed: StoreData): StoreData {
  const seed = createSeedData();
  const hasSubCategories = parsed.categories?.some((c) => c.parentId !== null);
  if (!hasSubCategories) {
    const existingIds = new Set((parsed.categories || []).map((c) => c.id));
    for (const cat of seed.categories) {
      if (!existingIds.has(cat.id)) {
        parsed.categories.push(cat);
      }
    }
  }
  if (!Array.isArray(parsed.priceOffers)) {
    parsed.priceOffers = seed.priceOffers;
  }
  if (!Array.isArray(parsed.notifications)) {
    parsed.notifications = seed.notifications;
  }
  if (!Array.isArray(parsed.sellerReviews)) {
    parsed.sellerReviews = seed.sellerReviews;
  }
  if (Array.isArray(parsed.sellers)) {
    parsed.sellers = parsed.sellers.map((s) => {
      const reviews = (parsed.sellerReviews || []).filter((r) => r.sellerId === s.userId);
      if (reviews.length > 0) {
        const sum = reviews.reduce((acc, r) => acc + Number(r.rating || 0), 0);
        return {
          ...s,
          rating: Math.round((sum / reviews.length) * 10) / 10,
          ratingCount: reviews.length,
        };
      }
      return { ...s, ratingCount: s.ratingCount ?? 0 };
    });
  }
  if (Array.isArray(parsed.listings)) {
    parsed.listings = parsed.listings.map((l) => ({
      ...l,
      subCategoryId: l.subCategoryId || inferSubCategoryId(l, parsed.categories),
      expectedPrice:
        l.expectedPrice !== undefined
          ? l.expectedPrice
          : l.isNegotiable
          ? Math.round(l.priceAmount * 0.92 / 10) * 10
          : null,
      allowPriceOffers:
        l.allowPriceOffers !== undefined ? Boolean(l.allowPriceOffers) : Boolean(l.isNegotiable),
    }));
  }
  migrateAuthFields(parsed);
  return parsed;
}

function loadStore(paths: StorePaths): StoreData {
  try {
    if (!fs.existsSync(paths.dataDir)) {
      fs.mkdirSync(paths.dataDir, { recursive: true });
    }
    if (!fs.existsSync(paths.storePath)) {
      const seed = createSeedData();
      writeStoreFile(paths, seed);
      return seed;
    }
    const raw = fs.readFileSync(paths.storePath, 'utf-8');
    const parsed = JSON.parse(raw);
    // First run of the auth migration: keep an untouched copy of the existing data before rewriting it.
    if (!Array.isArray(parsed.credentials)) {
      const backupDir = path.join(paths.dataDir, 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.writeFileSync(path.join(backupDir, `store.pre-auth-${stamp}.json`), raw, { encoding: 'utf-8', mode: 0o600 });
    }
    const hydrated = hydrateStore(parsed);
    writeStoreFile(paths, hydrated);
    return hydrated;
  } catch (err) {
    // Never fall back to an in-memory seed over real data: refuse to start instead of risking data loss.
    console.error('Failed to load store:', err);
    throw err;
  }
}

/** Atomic write (temp file + rename), owner-only permissions: the file now holds password hashes. */
function writeStoreFile(paths: StorePaths, data: StoreData) {
  const tmp = `${paths.storePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmp, paths.storePath);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // best effort cleanup of the temp file
    }
    throw err;
  }
}

function saveStoreTo(paths: StorePaths, data: StoreData) {
  try {
    if (!fs.existsSync(paths.dataDir)) {
      fs.mkdirSync(paths.dataDir, { recursive: true });
    }
    writeStoreFile(paths, data);
  } catch (err) {
    console.error('Failed to persist store:', err);
  }
}

export interface StartOptions {
  env?: Record<string, string | undefined>;
  config?: Partial<AppConfig>;
  /** Tests disable the Vite/static layer and only exercise the API. */
  serveFrontend?: boolean;
}

/**
 * Starts one isolated server instance. Each instance owns its data directory exclusively:
 * the directory is locked for the lifetime of the instance, so a second instance or the
 * `manage-users` CLI pointed at the same directory refuses to run instead of overwriting data.
 */
export async function startServer(opts: StartOptions = {}) {
  const config = loadConfig(opts.env || process.env, opts.config);
  const paths = makeStorePaths(resolveDataDir(config.dataDir));
  const lock = acquireStoreLock(paths.dataDir, 'server');
  try {
    const server = await runServer(opts, config, paths);
    const releaseOnExit = () => lock.release();
    process.once('exit', releaseOnExit);
    const closeServer = server.close;
    return {
      ...server,
      dataDir: paths.dataDir,
      close: async () => {
        process.off('exit', releaseOnExit);
        try {
          await closeServer();
        } finally {
          lock.release();
        }
      },
    };
  } catch (err) {
    lock.release();
    throw err;
  }
}

async function runServer(opts: StartOptions, config: AppConfig, paths: StorePaths) {
  /** Instance-local persistence: every saveStore(store) call below writes to THIS instance's file only. */
  const saveStore = (data: StoreData) => saveStoreTo(paths, data);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  let store = loadStore(paths);
  const persist = () => saveStore(store);

  const httpServer = http.createServer(app);
  let realtime: ReturnType<typeof createRealtime> | null = null;

  const sessions = new SessionManager({
    getSessions: () => store.sessions,
    setSessions: (list) => {
      store.sessions = list;
    },
    persist,
    idleMs: config.sessionIdleMs,
    absoluteMs: config.sessionAbsoluteMs,
    maxPerUser: config.maxSessionsPerUser,
    // Ending a session (logout, expiry, revocation) also ends its live WebSocket connections.
    onRevoked: (ids) => realtime?.closeSessions(ids),
  });

  const authDeps = { config, sessions, getStore: () => store };
  const { attachAuth, mutationGuard, requireAuth, requireAdmin, securityHeaders, noStoreApi } =
    createAuthMiddleware(authDeps);

  app.use(securityHeaders);
  app.use('/api', noStoreApi);
  // Small body limit for the unauthenticated auth endpoints; the global limit applies elsewhere.
  app.use('/api/v1/auth', express.json({ limit: '10kb' }));
  app.use(express.json({ limit: '10mb' }));
  app.use('/src/assets/images', express.static(path.resolve(__dirname, 'src/assets/images')));

  // Every API request: resolve identity from the session cookie, then enforce Origin + CSRF on mutations.
  app.use('/api/v1', attachAuth, mutationGuard);
  app.use('/api/v1/auth', createAuthRouter({ ...authDeps, saveStore: persist }));
  // All admin APIs: one gate in front of every /admin route.
  app.use('/api/v1/admin', requireAdmin);

  realtime = createRealtime({
    httpServer,
    config,
    sessions,
    findUser: (id) => store.users.find((u) => u.id === id),
    getNotificationsFor: (id) => (store.notifications || []).filter((n) => n.userId === id),
  });
  const emitToUser = realtime.emitToUser;

  const pushNotification = (input: {
    userId: string;
    type: 'offer_accepted' | 'offer_rejected' | 'new_message';
    title: string;
    body: string;
    listingId?: string;
    conversationId?: string;
  }) => {
    const item = {
      id: `ntf_${crypto.randomUUID().slice(0, 8)}`,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      listingId: input.listingId,
      conversationId: input.conversationId,
      read: false,
      createdAt: new Date().toISOString(),
    };
    store.notifications = store.notifications || [];
    store.notifications.unshift(item);
    emitToUser(input.userId, { type: 'notification:new', notification: item });
    return item;
  };

  // Development only: demo accounts get random one-time passwords (printed once), never a shared default.
  if (config.demoAccounts) {
    for (const u of store.users) {
      if (!DEMO_USER_IDS.has(u.id) || store.credentials.some((c) => c.userId === u.id)) continue;
      const password = crypto.randomBytes(12).toString('base64url');
      store.credentials.push({ userId: u.id, passwordHash: await hashPassword(password), updatedAt: new Date().toISOString() });
      console.log(`[demo-account] ${u.phone} (${u.role}) one-time password: ${password}`);
    }
    persist();
  }
  if (config.isProd && !store.users.some((u) => u.role === 'admin' && !u.isDemo && store.credentials.some((c) => c.userId === u.id))) {
    console.warn('[security] No admin account with credentials exists. Create one with: npm run user:create-admin');
  }

  const sweeper = setInterval(() => sessions.sweep(), 10 * 60_000);
  sweeper.unref();

  // Bootstrap endpoint: public data for everyone, private data only for the signed-in user.
  app.get('/api/v1/bootstrap', (req, res) => {
    const me = req.auth?.user ?? null;
    const signedIn = Boolean(me);
    const favoriteIds = me ? store.favorites[me.id] || [] : [];

    res.json({
      sellers: store.sellers.map((s) => toPublicSeller(s, signedIn)),
      categories: store.categories,
      breeds: store.breeds,
      regions: store.regions,
      indicativePrices: store.indicativePrices,
      articles: store.articles,
      faqs: store.faqs,
      currentUser: toSelfUser(me),
      csrfToken: req.auth?.csrfToken ?? null,
      favoriteIds,
      conversations: visibleConversations(me, store.conversations),
      priceOffers: visibleOffers(me, store.priceOffers || []),
      notifications: me ? (store.notifications || []).filter((n) => n.userId === me.id) : [],
      sellerReviews: store.sellerReviews || [],
      reports: isAdmin(me) ? store.reports : [],
      auditLogs: isAdmin(me) ? store.auditLogs : [],
    });
  });

  // Seller Star Ratings & Reviews Endpoint
  app.post('/api/v1/sellers/:sellerId/reviews', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    const { sellerId } = req.params;
    const seller = store.sellers.find((s) => s.userId === sellerId);
    if (!seller) {
      return res.status(404).json({ error: 'ملف المربي غير موجود' });
    }
    if (currentUser.id === sellerId) {
      return res.status(400).json({ error: 'لا يمكنك تقييم مراحك أو حسابك الشخصي' });
    }

    const parsedRating = Math.round(Number(req.body?.rating));
    if (!Number.isFinite(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      return res.status(400).json({ error: 'يرجى اختيار تقييم من 1 إلى 5 نجوم' });
    }
    const comment = String(req.body?.comment || '').trim();
    const nowIso = new Date().toISOString();

    store.sellerReviews = store.sellerReviews || [];
    const existingIdx = store.sellerReviews.findIndex(
      (r) => r.sellerId === sellerId && r.reviewerId === currentUser.id
    );

    let savedReview;
    if (existingIdx !== -1) {
      savedReview = {
        ...store.sellerReviews[existingIdx],
        reviewerName: currentUser.name,
        rating: parsedRating,
        comment,
        updatedAt: nowIso,
      };
      store.sellerReviews[existingIdx] = savedReview;
    } else {
      savedReview = {
        id: `rev_${crypto.randomUUID().slice(0, 6)}`,
        sellerId,
        reviewerId: currentUser.id,
        reviewerName: currentUser.name,
        rating: parsedRating,
        comment,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      store.sellerReviews.unshift(savedReview);
    }

    const sellerReviewsList = store.sellerReviews.filter((r) => r.sellerId === sellerId);
    const sum = sellerReviewsList.reduce((acc, r) => acc + Number(r.rating || 0), 0);
    seller.ratingCount = sellerReviewsList.length;
    seller.rating =
      sellerReviewsList.length > 0 ? Math.round((sum / sellerReviewsList.length) * 10) / 10 : 0;

    saveStore(store);
    res.status(existingIdx !== -1 ? 200 : 201).json({
      review: savedReview,
      seller,
      reviews: sellerReviewsList,
    });
  });

  // Notifications Read Endpoints
  app.post('/api/v1/notifications/:id/read', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    const target = (store.notifications || []).find(
      (n) => n.id === req.params.id && n.userId === currentUser.id
    );
    if (target) {
      target.read = true;
      saveStore(store);
      emitToUser(currentUser.id, {
        type: 'notifications:updated',
        notifications: (store.notifications || []).filter((n) => n.userId === currentUser.id),
      });
    }
    res.json({ ok: true });
  });

  app.post('/api/v1/notifications/read-all', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    store.notifications = (store.notifications || []).map((n) =>
      n.userId === currentUser.id ? { ...n, read: true } : n
    );
    saveStore(store);
    emitToUser(currentUser.id, {
      type: 'notifications:updated',
      notifications: (store.notifications || []).filter((n) => n.userId === currentUser.id),
    });
    res.json({ ok: true });
  });

  // GET /api/v1/listings with rich filtering
  app.get('/api/v1/listings', (req, res) => {
    const currentUser = req.auth?.user ?? null;
    const {
      q,
      categoryId,
      subCategoryId,
      breedId,
      regionId,
      minPrice,
      maxPrice,
      sex,
      minAge,
      maxAge,
      negotiable,
      status,
      sellerId,
      sort,
    } = req.query as Record<string, string | undefined>;

    let items = [...store.listings];

    // Permission check for non-published statuses
    if (status && status !== 'Published') {
      if (isAdmin(currentUser)) {
        items = items.filter((l) => l.status === status);
      } else if (currentUser && sellerId && sellerId === currentUser.id) {
        items = items.filter((l) => l.sellerId === currentUser.id && l.status === status);
      } else {
        items = items.filter((l) => l.status === 'Published');
      }
    } else if (sellerId) {
      if ((currentUser && sellerId === currentUser.id) || isAdmin(currentUser)) {
        items = items.filter((l) => l.sellerId === sellerId);
      } else {
        items = items.filter((l) => l.sellerId === sellerId && l.status === 'Published');
      }
    } else if (!status) {
      // Default public view shows Published only (unless admin asks all)
      items = items.filter((l) => l.status === 'Published');
    } else {
      items = items.filter((l) => l.status === 'Published');
    }

    if (q && q.trim()) {
      const term = q.trim().toLowerCase();
      items = items.filter(
        (l) =>
          l.title.toLowerCase().includes(term) ||
          l.description.toLowerCase().includes(term) ||
          l.city.toLowerCase().includes(term)
      );
    }
    if (categoryId && categoryId !== 'all') {
      items = items.filter((l) => l.categoryId === categoryId);
    }
    if (subCategoryId && subCategoryId !== 'all') {
      items = items.filter((l) => l.subCategoryId === subCategoryId);
    }
    if (breedId && breedId !== 'all') {
      items = items.filter((l) => l.breedId === breedId);
    }
    if (regionId && regionId !== 'all') {
      items = items.filter((l) => l.regionId === regionId);
    }
    if (minPrice) {
      const minP = Number(minPrice);
      if (!Number.isNaN(minP)) items = items.filter((l) => l.priceAmount >= minP);
    }
    if (maxPrice) {
      const maxP = Number(maxPrice);
      if (!Number.isNaN(maxP)) items = items.filter((l) => l.priceAmount <= maxP);
    }
    if (sex && sex !== 'all') {
      items = items.filter((l) => l.sex === sex);
    }
    if (minAge) {
      const minA = Number(minAge);
      if (!Number.isNaN(minA)) items = items.filter((l) => l.ageMonths >= minA);
    }
    if (maxAge) {
      const maxA = Number(maxAge);
      if (!Number.isNaN(maxA)) items = items.filter((l) => l.ageMonths <= maxA);
    }
    if (negotiable === 'true') {
      items = items.filter((l) => l.isNegotiable);
    }

    if (sort === 'price_asc') {
      items.sort((a, b) => a.priceAmount - b.priceAmount);
    } else if (sort === 'price_desc') {
      items.sort((a, b) => b.priceAmount - a.priceAmount);
    } else {
      items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    }

    res.json({ listings: items });
  });

  // GET /api/v1/listings/:id
  app.get('/api/v1/listings/:id', (req, res) => {
    const item = store.listings.find((l) => l.id === req.params.id);
    // Unpublished listings are invisible (404, not 403) to everyone except their owner and admins.
    if (!item || !canViewListing(req.auth?.user ?? null, item)) {
      return res.status(404).json({ error: 'الإعلان غير موجود' });
    }
    res.json({ listing: item });
  });

  // POST /api/v1/listings (Create listing -> Pending moderation)
  app.post('/api/v1/listings', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    const {
      categoryId,
      subCategoryId,
      breedId,
      regionId,
      city,
      title,
      description,
      priceAmount,
      expectedPrice,
      sex,
      ageMonths,
      weightKg,
      quantity,
      isNegotiable,
      allowPriceOffers,
      vaccinated,
      imageUrls,
    } = req.body;

    if (!title || !priceAmount || !breedId || !regionId) {
      return res.status(400).json({ error: 'يرجى إكمال الحقول الأساسية للإعلان' });
    }

    // Ensure seller profile exists if user posts a listing
    if (!store.sellers.some((s) => s.userId === currentUser.id)) {
      store.sellers.push({
        userId: currentUser.id,
        displayName: `مراح ${currentUser.name}`,
        bio: 'مربٍ وبائع مواشٍ مسجل في منصة سوق الغنم.',
        regionId,
        city: city || 'الرياض',
        phone: currentUser.phone,
        whatsapp: `966${currentUser.phone.replace(/^0/, '')}`,
        verifiedAt: null,
        yearsExperience: 2,
        specialty: 'أغنام وماعز',
        rating: 4.8,
        totalSales: 1,
      });
    }

    const breed = store.breeds.find((b) => b.id === breedId);
    const fallbackUrl = breed?.imageUrl || IMG.naimi;
    const imgs =
      Array.isArray(imageUrls) && imageUrls.length > 0
        ? imageUrls.map((url: string, idx: number) => ({
            id: `img_${crypto.randomUUID().slice(0, 6)}`,
            url,
            position: idx + 1,
          }))
        : [{ id: `img_${crypto.randomUUID().slice(0, 6)}`, url: fallbackUrl, position: 1 }];

    const resolvedCategoryId = categoryId || breed?.categoryId || 'cat_sheep';
    const resolvedSubCategoryId =
      subCategoryId && subCategoryId !== 'auto'
        ? subCategoryId
        : inferSubCategoryId(
            {
              title: String(title),
              description: String(description || ''),
              sex: sex || 'ذكر',
              ageMonths: Number(ageMonths) || 8,
              categoryId: resolvedCategoryId,
            },
            store.categories
          );

    const parsedExpected =
      expectedPrice !== undefined && expectedPrice !== null && expectedPrice !== '' && Number(expectedPrice) > 0
        ? Number(expectedPrice)
        : null;
    const allowOffers =
      allowPriceOffers !== undefined ? Boolean(allowPriceOffers) : Boolean(isNegotiable);

    const nowIso = new Date().toISOString();
    const newListing = {
      id: `lst_${crypto.randomUUID().slice(0, 6)}`,
      sellerId: currentUser.id,
      categoryId: resolvedCategoryId,
      subCategoryId: resolvedSubCategoryId,
      breedId,
      regionId,
      city: city || 'الرياض',
      title: String(title).trim(),
      slug: `listing-${Date.now()}`,
      description: String(description || '').trim(),
      priceAmount: Number(priceAmount),
      expectedPrice: parsedExpected,
      currency: 'SAR',
      sex: sex || 'ذكر',
      ageMonths: Number(ageMonths) || 8,
      weightKg: Number(weightKg) || 42,
      quantity: Number(quantity) || 1,
      isNegotiable: Boolean(isNegotiable) || allowOffers,
      allowPriceOffers: allowOffers,
      vaccinated: Boolean(vaccinated),
      // Admins publish directly; standard users go to Pending review as specified in the blueprint
      status: isAdmin(currentUser) ? 'Published' : 'Pending',
      publishedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
      isFeatured: false,
      images: imgs,
    };

    store.listings.unshift(newListing);
    saveStore(store);
    res.status(201).json({ listing: newListing });
  });

  // PATCH /api/v1/listings/:id (Ownership enforced, cannot bypass Rejected status)
  app.patch('/api/v1/listings/:id', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    const idx = store.listings.findIndex((l) => l.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'الإعلان غير موجود' });

    const existing = store.listings[idx];
    if (!canEditListing(currentUser, existing)) {
      return res.status(403).json({ error: 'غير مصرح لك بتعديل هذا الإعلان' });
    }

    const {
      title,
      description,
      priceAmount,
      expectedPrice,
      ageMonths,
      weightKg,
      quantity,
      isNegotiable,
      allowPriceOffers,
      status,
      subCategoryId,
    } = req.body;

    // Security rule from blueprint: a Rejected listing cannot be self-published from UI
    let nextStatus = existing.status;
    if (status === 'Sold' || status === 'Draft') {
      nextStatus = status;
    } else if (existing.status === 'Rejected' && status === 'Published' && !isAdmin(currentUser)) {
      return res.status(403).json({ error: 'لا يمكن إعادة نشر إعلان مرفوض دون موافقة المشرف' });
    }

    const updated = {
      ...existing,
      title: title !== undefined ? String(title).trim() : existing.title,
      description: description !== undefined ? String(description).trim() : existing.description,
      priceAmount: priceAmount !== undefined ? Number(priceAmount) : existing.priceAmount,
      expectedPrice:
        expectedPrice !== undefined
          ? expectedPrice === null || expectedPrice === ''
            ? null
            : Number(expectedPrice)
          : existing.expectedPrice,
      ageMonths: ageMonths !== undefined ? Number(ageMonths) : existing.ageMonths,
      weightKg: weightKg !== undefined ? Number(weightKg) : existing.weightKg,
      quantity: quantity !== undefined ? Number(quantity) : existing.quantity,
      isNegotiable: isNegotiable !== undefined ? Boolean(isNegotiable) : existing.isNegotiable,
      allowPriceOffers:
        allowPriceOffers !== undefined ? Boolean(allowPriceOffers) : existing.allowPriceOffers,
      subCategoryId: subCategoryId !== undefined ? subCategoryId : existing.subCategoryId,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    };

    store.listings[idx] = updated;
    saveStore(store);
    res.json({ listing: updated });
  });

  // POST /api/v1/favorites/toggle
  app.post('/api/v1/favorites/toggle', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    const { listingId } = req.body;
    if (!listingId || typeof listingId !== 'string') return res.status(400).json({ error: 'معرف الإعلان مطلوب' });

    const currentFavs = store.favorites[currentUser.id] || [];
    const exists = currentFavs.includes(listingId);
    const nextFavs = exists ? currentFavs.filter((id) => id !== listingId) : [...currentFavs, listingId];
    store.favorites[currentUser.id] = nextFavs;
    saveStore(store);
    res.json({ favoriteIds: nextFavs, isFavorite: !exists });
  });

  // Conversations & Messaging
  app.post('/api/v1/conversations', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    const { listingId, initialMessage } = req.body;
    const listing = store.listings.find((l) => l.id === listingId);
    if (!listing || !canViewListing(currentUser, listing)) {
      return res.status(404).json({ error: 'الإعلان غير موجود' });
    }
    if (listing.sellerId === currentUser.id) {
      return res.status(400).json({ error: 'لا يمكنك بدء محادثة على إعلانك الخاص' });
    }

    let conv = store.conversations.find(
      (c) => c.listingId === listingId && c.buyerId === currentUser.id
    );

    if (!conv) {
      conv = {
        id: `conv_${crypto.randomUUID().slice(0, 6)}`,
        listingId,
        buyerId: currentUser.id,
        sellerId: listing.sellerId,
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      store.conversations.unshift(conv);
    }

    if (initialMessage && String(initialMessage).trim()) {
      const cleanBody = String(initialMessage).trim();
      conv.messages.push({
        id: `msg_${crypto.randomUUID().slice(0, 6)}`,
        conversationId: conv.id,
        senderId: currentUser.id,
        body: cleanBody,
        createdAt: new Date().toISOString(),
      });
      conv.updatedAt = new Date().toISOString();

      const recipientId = currentUser.id === conv.buyerId ? conv.sellerId : conv.buyerId;
      if (recipientId && recipientId !== currentUser.id) {
        pushNotification({
          userId: recipientId,
          type: 'new_message',
          title: `رسالة جديدة من ${currentUser.name}`,
          body: cleanBody.slice(0, 90),
          listingId: conv.listingId,
          conversationId: conv.id,
        });
        emitToUser(recipientId, { type: 'conversation:updated', conversation: conv });
      }
    }

    saveStore(store);
    res.json({ conversation: conv });
  });

  app.post('/api/v1/conversations/:id/messages', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    const conv = store.conversations.find((c) => c.id === req.params.id);
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة' });
    // Conversations are private to their two participants (admins included).
    if (!canAccessConversation(currentUser, conv)) {
      return res.status(403).json({ error: 'غير مصرح لك بالوصول لهذه المحادثة' });
    }
    const { body } = req.body;
    if (!body || !String(body).trim()) return res.status(400).json({ error: 'نص الرسالة مطلوب' });

    const message = {
      id: `msg_${crypto.randomUUID().slice(0, 6)}`,
      conversationId: conv.id,
      senderId: currentUser.id,
      body: String(body).trim(),
      createdAt: new Date().toISOString(),
    };
    conv.messages.push(message);
    conv.updatedAt = message.createdAt;

    const recipientId = currentUser.id === conv.buyerId ? conv.sellerId : conv.buyerId;
    if (recipientId && recipientId !== currentUser.id) {
      pushNotification({
        userId: recipientId,
        type: 'new_message',
        title: `رسالة جديدة من ${currentUser.name}`,
        body: message.body.slice(0, 90),
        listingId: conv.listingId,
        conversationId: conv.id,
      });
      emitToUser(recipientId, { type: 'conversation:updated', conversation: conv });
    }

    saveStore(store);
    res.status(201).json({ message, conversation: conv });
  });

  // Price Offers / Negotiation Endpoints
  app.post('/api/v1/listings/:id/offers', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    const listing = store.listings.find((l) => l.id === req.params.id);
    if (!listing || !canViewListing(currentUser, listing)) {
      return res.status(404).json({ error: 'الإعلان غير موجود' });
    }

    if (listing.sellerId === currentUser.id) {
      return res.status(400).json({ error: 'لا يمكنك تقديم عرض سعر على إعلانك الخاص' });
    }

    const offersAllowed =
      listing.allowPriceOffers !== undefined ? listing.allowPriceOffers : listing.isNegotiable;
    if (!offersAllowed) {
      return res.status(400).json({ error: 'هذا الإعلان بسعر نهائي ولا يقبل عروض الأسعار' });
    }

    const offeredPrice = Number(req.body?.offeredPrice);
    const quantity = Math.max(1, Number(req.body?.quantity) || 1);
    const note = String(req.body?.note || '').trim();

    if (!offeredPrice || Number.isNaN(offeredPrice) || offeredPrice <= 0) {
      return res.status(400).json({ error: 'يرجى إدخال سعر عرض صحيح بالريال السعودي' });
    }

    const nowIso = new Date().toISOString();
    const offer = {
      id: `off_${crypto.randomUUID().slice(0, 6)}`,
      listingId: listing.id,
      buyerId: currentUser.id,
      buyerName: currentUser.name,
      sellerId: listing.sellerId,
      offeredPrice,
      quantity: Math.min(quantity, listing.quantity || quantity),
      note,
      status: 'pending',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    store.priceOffers = store.priceOffers || [];
    store.priceOffers.unshift(offer);

    // Notify seller inside direct conversations as well
    let conv = store.conversations.find(
      (c) => c.listingId === listing.id && c.buyerId === currentUser.id
    );
    if (!conv) {
      conv = {
        id: `conv_${crypto.randomUUID().slice(0, 6)}`,
        listingId: listing.id,
        buyerId: currentUser.id,
        sellerId: listing.sellerId,
        updatedAt: nowIso,
        messages: [],
      };
      store.conversations.unshift(conv);
    }
    const offerMsgBody = `تقديم عرض سعر جديد: ${offeredPrice.toLocaleString('en-US')} ر.س للرأس (الكمية: ${offer.quantity})${note ? ` — ${note}` : ''}`;
    conv.messages.push({
      id: `msg_${crypto.randomUUID().slice(0, 6)}`,
      conversationId: conv.id,
      senderId: currentUser.id,
      body: offerMsgBody,
      createdAt: nowIso,
    });
    conv.updatedAt = nowIso;

    if (listing.sellerId !== currentUser.id) {
      pushNotification({
        userId: listing.sellerId,
        type: 'new_message',
        title: `عرض سعر ورسالة جديدة من ${currentUser.name}`,
        body: offerMsgBody,
        listingId: listing.id,
        conversationId: conv.id,
      });
      emitToUser(listing.sellerId, { type: 'conversation:updated', conversation: conv });
    }

    saveStore(store);
    res.status(201).json({ offer });
  });

  app.post('/api/v1/offers/:id/respond', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    const offer = (store.priceOffers || []).find((o) => o.id === req.params.id);
    if (!offer) return res.status(404).json({ error: 'عرض السعر غير موجود' });

    if (!canRespondToOffer(currentUser, offer)) {
      return res.status(403).json({ error: 'صلاحية البائع مطلوبة للرد على عرض السعر' });
    }

    const nextStatus = req.body?.status === 'accepted' ? 'accepted' : 'rejected';
    offer.status = nextStatus;
    offer.updatedAt = new Date().toISOString();

    const listing = store.listings.find((l) => l.id === offer.listingId);
    const listingTitle = listing?.title || 'الإعلان';
    if (nextStatus === 'accepted') {
      pushNotification({
        userId: offer.buyerId,
        type: 'offer_accepted',
        title: 'تم قبول عرض السعر الخاص بك',
        body: `وافق المربي على عرضك بقيمة ${Number(offer.offeredPrice).toLocaleString('en-US')} ر.س على إعلان «${listingTitle}».`,
        listingId: offer.listingId,
      });
    } else {
      pushNotification({
        userId: offer.buyerId,
        type: 'offer_rejected',
        title: 'تحديث على عرض السعر',
        body: `تم الاعتذار عن عرضك على إعلان «${listingTitle}». يمكنك تقديم عرض جديد أو التواصل مع المربي.`,
        listingId: offer.listingId,
      });
    }
    emitToUser(offer.buyerId, { type: 'offer:updated', offer });

    if (isAdmin(currentUser)) {
      store.auditLogs.unshift({
        id: `aud_${crypto.randomUUID().slice(0, 6)}`,
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: nextStatus === 'accepted' ? 'قبول عرض سعر' : 'رفض عرض سعر',
        targetType: 'offer',
        targetId: offer.id,
        note: `${offer.offeredPrice} ر.س`,
        createdAt: offer.updatedAt,
      });
    }

    saveStore(store);
    res.json({ offer });
  });

  // Reports
  app.post('/api/v1/reports', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    const { listingId, reason, details } = req.body;
    if (!listingId || !reason) return res.status(400).json({ error: 'سبب البلاغ مطلوب' });
    if (!store.listings.some((l) => l.id === listingId)) {
      return res.status(404).json({ error: 'الإعلان غير موجود' });
    }

    const report = {
      id: `rep_${crypto.randomUUID().slice(0, 6)}`,
      reporterId: currentUser.id,
      listingId,
      reason: String(reason),
      details: String(details || ''),
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    store.reports.unshift(report);
    saveStore(store);
    res.status(201).json({ report });
  });

  // Admin Moderation Endpoints
  app.post('/api/v1/admin/listings/:id/approve', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    const listing = store.listings.find((l) => l.id === req.params.id);
    if (!listing) return res.status(404).json({ error: 'الإعلان غير موجود' });

    listing.status = 'Published';
    listing.rejectionReason = undefined;
    listing.publishedAt = new Date().toISOString();
    listing.updatedAt = new Date().toISOString();

    store.auditLogs.unshift({
      id: `aud_${crypto.randomUUID().slice(0, 6)}`,
      actorId: currentUser.id,
      actorName: currentUser.name,
      action: 'اعتماد ونشر إعلان',
      targetType: 'listing',
      targetId: listing.id,
      note: listing.title,
      createdAt: new Date().toISOString(),
    });

    saveStore(store);
    res.json({ listing });
  });

  app.post('/api/v1/admin/listings/:id/reject', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    const listing = store.listings.find((l) => l.id === req.params.id);
    if (!listing) return res.status(404).json({ error: 'الإعلان غير موجود' });

    const { reason } = req.body;
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: 'يرجى توضيح سبب الرفض' });
    }

    listing.status = 'Rejected';
    listing.rejectionReason = String(reason).trim();
    listing.updatedAt = new Date().toISOString();

    store.auditLogs.unshift({
      id: `aud_${crypto.randomUUID().slice(0, 6)}`,
      actorId: currentUser.id,
      actorName: currentUser.name,
      action: 'رفض إعلان',
      targetType: 'listing',
      targetId: listing.id,
      note: listing.rejectionReason,
      createdAt: new Date().toISOString(),
    });

    saveStore(store);
    res.json({ listing });
  });

  app.post('/api/v1/admin/reports/:id/resolve', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    const report = store.reports.find((r) => r.id === req.params.id);
    if (!report) return res.status(404).json({ error: 'البلاغ غير موجود' });

    report.status = req.body.status === 'dismissed' ? 'dismissed' : 'resolved';
    store.auditLogs.unshift({
      id: `aud_${crypto.randomUUID().slice(0, 6)}`,
      actorId: currentUser.id,
      actorName: currentUser.name,
      action: report.status === 'resolved' ? 'معالجة بلاغ' : 'إغلاق بلاغ',
      targetType: 'report',
      targetId: report.id,
      note: report.reason,
      createdAt: new Date().toISOString(),
    });
    saveStore(store);
    res.json({ report });
  });

  app.post('/api/v1/admin/breeds', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    const { name, categoryId, origin, summary, avgWeightKg, priceRangeSar } = req.body;
    if (!name || !categoryId) {
      return res.status(400).json({ error: 'اسم السلالة والتصنيف مطلوبان' });
    }
    const newBreed = {
      id: `brd_${crypto.randomUUID().slice(0, 6)}`,
      categoryId,
      name: String(name).trim(),
      slug: `breed-${Date.now()}`,
      origin: origin || 'المملكة العربية السعودية',
      summary: summary || 'سلالة مضافة عبر إدارة المنصة.',
      avgWeightKg: avgWeightKg || '35 – 55 كجم',
      priceRangeSar: priceRangeSar || '1,200 – 2,000 ر.س',
      imageUrl: IMG.naimi,
      characteristics: ['سلالة معتمدة في المنصة'],
    };
    store.breeds.push(newBreed);
    store.auditLogs.unshift({
      id: `aud_${crypto.randomUUID().slice(0, 6)}`,
      actorId: currentUser.id,
      actorName: currentUser.name,
      action: 'إضافة سلالة جديدة',
      targetType: 'breed',
      targetId: newBreed.id,
      note: newBreed.name,
      createdAt: new Date().toISOString(),
    });
    saveStore(store);
    res.status(201).json({ breed: newBreed });
  });

  // Smart Sub-Categories Admin Endpoints
  app.post('/api/v1/admin/categories', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    const { name, parentId, description, keywords } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'اسم الفئة الفرعية مطلوب' });
    }
    const parsedKeywords = Array.isArray(keywords)
      ? keywords.map((k: string) => String(k).trim()).filter(Boolean)
      : typeof keywords === 'string'
      ? keywords
          .split(/[،,]/)
          .map((k) => k.trim())
          .filter(Boolean)
      : [];

    const newCat = {
      id: `sub_${crypto.randomUUID().slice(0, 6)}`,
      name: String(name).trim(),
      slug: `sub-${Date.now()}`,
      parentId: parentId || 'cat_sheep',
      description: String(description || '').trim(),
      keywords: parsedKeywords,
    };

    store.categories.push(newCat);
    store.auditLogs.unshift({
      id: `aud_${crypto.randomUUID().slice(0, 6)}`,
      actorId: currentUser.id,
      actorName: currentUser.name,
      action: 'إنشاء فئة فرعية ذكية',
      targetType: 'category',
      targetId: newCat.id,
      note: newCat.name,
      createdAt: new Date().toISOString(),
    });
    saveStore(store);
    res.status(201).json({ category: newCat });
  });

  app.patch('/api/v1/admin/categories/:id', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    const idx = store.categories.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'الفئة غير موجودة' });

    const existing = store.categories[idx];
    const { name, parentId, description, keywords } = req.body;
    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ error: 'اسم الفئة الفرعية مطلوب' });
    }
    const parsedKeywords = Array.isArray(keywords)
      ? keywords.map((k: string) => String(k).trim()).filter(Boolean)
      : typeof keywords === 'string'
      ? keywords
          .split(/[،,]/)
          .map((k) => k.trim())
          .filter(Boolean)
      : existing.keywords || [];

    const updated = {
      ...existing,
      name: name !== undefined ? String(name).trim() : existing.name,
      parentId: parentId !== undefined ? parentId : existing.parentId,
      description: description !== undefined ? String(description).trim() : existing.description,
      keywords: parsedKeywords,
    };
    store.categories[idx] = updated;
    store.auditLogs.unshift({
      id: `aud_${crypto.randomUUID().slice(0, 6)}`,
      actorId: currentUser.id,
      actorName: currentUser.name,
      action: 'تعديل فئة فرعية',
      targetType: 'category',
      targetId: updated.id,
      note: updated.name,
      createdAt: new Date().toISOString(),
    });
    saveStore(store);
    res.json({ category: updated });
  });

  app.delete('/api/v1/admin/categories/:id', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    const target = store.categories.find((c) => c.id === req.params.id);
    if (!target) return res.status(404).json({ error: 'الفئة غير موجودة' });
    if (target.parentId === null) {
      return res.status(400).json({ error: 'لا يمكن حذف التصنيف الرئيسي' });
    }

    store.categories = store.categories.filter((c) => c.id !== req.params.id);
    store.listings = store.listings.map((l) =>
      l.subCategoryId === req.params.id
        ? { ...l, subCategoryId: inferSubCategoryId(l, store.categories) }
        : l
    );
    store.auditLogs.unshift({
      id: `aud_${crypto.randomUUID().slice(0, 6)}`,
      actorId: currentUser.id,
      actorName: currentUser.name,
      action: 'حذف فئة فرعية',
      targetType: 'category',
      targetId: target.id,
      note: target.name,
      createdAt: new Date().toISOString(),
    });
    saveStore(store);
    res.json({ ok: true });
  });

  app.post('/api/v1/admin/listings/auto-categorize', requireAuth, (req, res) => {
    const currentUser = req.auth!.user;
    const { listingId, subCategoryId } = req.body || {};
    let updatedCount = 0;

    if (listingId) {
      const listing = store.listings.find((l) => l.id === listingId);
      if (!listing) return res.status(404).json({ error: 'الإعلان غير موجود' });
      const nextSubId =
        subCategoryId === undefined
          ? inferSubCategoryId(listing, store.categories)
          : subCategoryId || null;
      listing.subCategoryId = nextSubId;
      listing.updatedAt = new Date().toISOString();
      updatedCount = 1;
    } else {
      store.listings = store.listings.map((l) => {
        const nextSub = inferSubCategoryId(l, store.categories);
        if (nextSub && nextSub !== l.subCategoryId) {
          updatedCount += 1;
          return { ...l, subCategoryId: nextSub, updatedAt: new Date().toISOString() };
        }
        return l;
      });
    }

    store.auditLogs.unshift({
      id: `aud_${crypto.randomUUID().slice(0, 6)}`,
      actorId: currentUser.id,
      actorName: currentUser.name,
      action: 'تشغيل التصنيف الذكي للإعلانات',
      targetType: 'listing',
      targetId: listingId || 'all',
      note: `تم تحديث تصنيف ${updatedCount} إعلان`,
      createdAt: new Date().toISOString(),
    });
    saveStore(store);
    res.json({ updatedCount });
  });

  // JSON error handler for the API (malformed JSON, oversized bodies, unexpected failures): no stack traces leak.
  app.use('/api', (err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err);
    const status = err?.type === 'entity.too.large' ? 413 : err?.status >= 400 && err?.status < 500 ? err.status : 500;
    if (status === 500) console.error('API error:', err);
    res.status(status).json({
      error: status === 413 ? 'حجم الطلب كبير جداً' : status === 500 ? 'حدث خطأ غير متوقع في الخادم' : 'طلب غير صالح',
    });
  });

  // Static / Vite setup
  if (opts.serveFrontend !== false) {
    if (config.isProd) {
      const distPath = path.resolve(__dirname, 'dist');
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    }
  }

  await new Promise<void>((resolve) => httpServer.listen(config.port, '0.0.0.0', () => resolve()));
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  console.log(`Souq Al-Ghanam server listening on http://localhost:${port}`);

  return {
    app,
    httpServer,
    port,
    config,
    getStore: () => store,
    close: async () => {
      clearInterval(sweeper);
      realtime?.close();
      httpServer.closeAllConnections?.();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

// Start automatically only when executed directly (`tsx server.ts`), not when imported by tests.
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  // .env is read only here (never on import), and real environment variables always take precedence.
  loadEnvForEntryPoint();
  startServer()
    .then((srv) => {
      // Release the data-directory lock and close sockets cleanly on Ctrl+C / platform stop.
      let closing = false;
      const shutdown = (signal: string) => {
        if (closing) return;
        closing = true;
        console.log(`Received ${signal}, shutting down.`);
        srv.close().finally(() => process.exit(0));
      };
      process.once('SIGINT', () => shutdown('SIGINT'));
      process.once('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch((err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}
