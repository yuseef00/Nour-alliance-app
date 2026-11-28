import React from 'react';
import { Shield, Lock, HardDrive, MapPin, Radio, Mail, Calendar, ArrowRight } from 'lucide-react';
import { Language } from '../types/nour';
import { t } from '../i18n/translations';

interface PrivacyPolicyViewProps {
  lang: Language;
  onNavigateHome: () => void;
}

export const PrivacyPolicyView: React.FC<PrivacyPolicyViewProps> = ({ lang, onNavigateHome }) => {
  const copy = t(lang);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8 text-[#17211d] dark:text-[#ede7da]" dir="rtl">
      {/* Top Header & Back */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onNavigateHome}
          className="min-h-[40px] px-4 rounded-full border border-[#0f6b4f]/20 text-xs font-semibold flex items-center gap-2 hover:bg-[#0f6b4f]/10 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          <span>{lang === 'ar' ? 'العودة إلى الرئيسية' : 'Back to Home'}</span>
        </button>
        <span className="text-xs text-[#5c6862] dark:text-[#98a69f] flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" />
          <span>آخر تحديث: ٢٥ نوفمبر ٢٠٢٦</span>
        </span>
      </div>

      {/* Main Title Card */}
      <div className="crystal-card rounded-3xl border border-[#0f6b4f]/20 dark:border-[#c9a44c]/30 p-8 space-y-4 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-[#0f6b4f]/12 flex items-center justify-center text-[#0f6b4f] dark:text-[#c9a44c]">
          <Shield className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-bold text-[#0f6b4f] dark:text-[#c9a44c]">
          {lang === 'ar' ? 'سياسة الخصوصية — تطبيق نور' : 'Privacy Policy — Nour App'}
        </h1>
        <p className="text-sm text-[#5c6862] dark:text-[#98a69f] max-w-2xl mx-auto leading-relaxed">
          {lang === 'ar'
            ? 'نحن في تطبيق "نور" نولي أهمية قصوى لخصوصية مستخدمينا ونلتزم التزاماً تاماً بحماية بياناتهم الشخصية وسريتها. توضح هذه السياسة بشفافية كيفية جمع البيانات واستخدامها وحمايتها.'
            : 'At Nour app, we deeply value user privacy and are fully committed to protecting your personal data.'}
        </p>
      </div>

      {/* Policy Sections */}
      <div className="grid grid-cols-1 gap-6">
        {/* Section 1: Data Selling */}
        <div className="crystal-card rounded-2xl border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 space-y-3">
          <h2 className="text-lg font-bold flex items-center gap-2 text-[#0f6b4f] dark:text-[#c9a44c]">
            <Lock className="w-5 h-5" />
            <span>1. عدم بيع أو مشاركة البيانات الشخصية</span>
          </h2>
          <p className="text-sm leading-relaxed text-[#5c6862] dark:text-[#98a69f]">
            نؤكد بشكل قاطع أن تطبيق <strong>نور</strong> لا يقوم أبداً ببيع، أو تأجير، أو المتاجرة بالبيانات الشخصية لمستخدميه بأي شكل من الأشكال لأي جهة ثالثة لأغراض تجارية أو تسويقية. بياناتك هي ملك لك وحدك.
          </p>
        </div>

        {/* Section 2: Collected Data */}
        <div className="crystal-card rounded-2xl border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 space-y-3">
          <h2 className="text-lg font-bold flex items-center gap-2 text-[#0f6b4f] dark:text-[#c9a44c]">
            <Shield className="w-5 h-5" />
            <span>2. البيانات التي يتم جمعها</span>
          </h2>
          <p className="text-sm leading-relaxed text-[#5c6862] dark:text-[#98a69f]">
            يعمل التطبيق بشكل أساسي دون الحاجة لتسجيل حساب. في حال اختيارك إنشاء حساب سحابي (اختياري عبر Firebase Authentication)، فإننا نجمع فقط البريد الإلكتروني واسم العرض لمزامنة تقدمك (العلامات المرجعية، ورد الختمة، وحفظ الآيات) بين أجهزتك. كما يتم جمع إحصائيات زوار مجهولة المصدر (البلد والدولة واللغة) لتحسين جودة الخدمة.
          </p>
        </div>

        {/* Section 3: Local Storage */}
        <div className="crystal-card rounded-2xl border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 space-y-3">
          <h2 className="text-lg font-bold flex items-center gap-2 text-[#0f6b4f] dark:text-[#c9a44c]">
            <HardDrive className="w-5 h-5" />
            <span>3. استخدام التخزين المحلي في الجهاز</span>
          </h2>
          <p className="text-sm leading-relaxed text-[#5c6862] dark:text-[#98a69f]">
            يستسخدم تطبيق <strong>نور</strong> تقنيات التخزين المحلي (LocalStorage و IndexedDB) على جهازك الشخصي لحفظ:
          </p>
          <ul className="list-disc list-inside text-sm text-[#5c6862] dark:text-[#98a69f] space-y-1.5 pe-4">
            <li>صفحات المصحف الشريف للتمكن من قراءتها دون اتصال بالإنترنت (Offline Mode).</li>
            <li>الملفات الصوتية والتلاوات المحفوظة للاستماع دون إنترنت.</li>
            <li>إعدادات المظهر، اللغة، والعلامات المرجعية الخاصة بك.</li>
          </ul>
        </div>

        {/* Section 4: Location & Prayer Times */}
        <div className="crystal-card rounded-2xl border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 space-y-3">
          <h2 className="text-lg font-bold flex items-center gap-2 text-[#0f6b4f] dark:text-[#c9a44c]">
            <MapPin className="w-5 h-5" />
            <span>4. بيانات الموقع الجغرافي ومواقيت الصلاة</span>
          </h2>
          <p className="text-sm leading-relaxed text-[#5c6862] dark:text-[#98a69f]">
            يطلب التطبيق إذن الوصول إلى موقعك الجغرافي (GPS) حصرياً لحساب مواقيت الصلاة بدقة وتحديد اتجاه القبلة محلياً على جهازك. <strong>لا يتم تخزين أو إرسال إحداثيات موقعك الجغرافي الدقيق إلى أي خادم خارجي أبداً.</strong>
          </p>
        </div>

        {/* Section 5: Audio Sources */}
        <div className="crystal-card rounded-2xl border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 space-y-3">
          <h2 className="text-lg font-bold flex items-center gap-2 text-[#0f6b4f] dark:text-[#c9a44c]">
            <Radio className="w-5 h-5" />
            <span>5. الصوتيات والتلاوات ومصادرها</span>
          </h2>
          <p className="text-sm leading-relaxed text-[#5c6862] dark:text-[#98a69f]">
            يعتمد قسم الاستماع والتلاوات في التطبيق على واجهات برمجة التطبيقات الرسمية والموثوقة مثل شبكة إم بي ٣ قرآن (MP3Quran.net) ومنصة (Quran.com API) لجلب التلاوات القرآنية وإذاعات القراء المباشرة.
          </p>
        </div>

        {/* Section 6: Third Party */}
        <div className="crystal-card rounded-2xl border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 space-y-3">
          <h2 className="text-lg font-bold flex items-center gap-2 text-[#0f6b4f] dark:text-[#c9a44c]">
            <Lock className="w-5 h-5" />
            <span>6. خدمات الطرف الثالث والأمان السحابي</span>
          </h2>
          <p className="text-sm leading-relaxed text-[#5c6862] dark:text-[#98a69f]">
            يستعمل التطبيق خدمات سحابية آمنة ومشفرة (Firebase) لتصديق الحسابات السحابية عند التسجيل الاختياري ومزامنة تقدمك بين أجهزتك. تخضع هذه الخدمات لسياسات الخصوصية الخاصة بمزوديها، ولا يستخدم التطبيق أي ملفات تتبع لأغراض الإعلانات.
          </p>
        </div>

        {/* Section 7: Contact */}
        <div className="crystal-card rounded-2xl border border-[#0f6b4f]/15 dark:border-[#c9a44c]/20 p-6 space-y-3">
          <h2 className="text-lg font-bold flex items-center gap-2 text-[#0f6b4f] dark:text-[#c9a44c]">
            <Mail className="w-5 h-5" />
            <span>7. التواصل مع مطور التطبيق</span>
          </h2>
          <p className="text-sm leading-relaxed text-[#5c6862] dark:text-[#98a69f]">
            نرحب دائماً باستفساراتكم وملاحظاتكم حول سياسة الخصوصية أو أي اقتراحات لتطوير تطبيق نور. يمكنكم التواصل معنا عبر البريد الإلكتروني للدعم الفني:
          </p>
          <div className="pt-1">
            <a
              href="mailto:ywsfkrt300@gmail.com"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#0f6b4f] text-white text-xs font-bold hover:bg-[#0a4e39] transition-colors"
            >
              <Mail className="w-4 h-4" />
              <span>ywsfkrt300@gmail.com</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
