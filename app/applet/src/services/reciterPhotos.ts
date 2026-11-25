/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ReciterPhotoInfo {
  photoUrl: string;
  bioAr: string;
  bioEn: string;
  countryAr: string;
  countryEn: string;
}

const KNOWN_RECITER_PHOTOS: Record<string, string> = {
  'مشاري راشد العفاسي': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Mishary_Rashid_Al-Afasy_2013_%28cropped%29.jpg/440px-Mishary_Rashid_Al-Afasy_2013_%28cropped%29.jpg',
  'محمود خليل الحصري': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Al-Husary.jpg/440px-Al-Husary.jpg',
  'محمد صديق المنشاوي': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Mohamed_Siddiq_el-Minshawi.jpg/440px-Mohamed_Siddiq_el-Minshawi.jpg',
  'عبد الباسط عبد الصمد': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Abdul_Basit_%27Abd_us-Samad.jpg/440px-Abdul_Basit_%27Abd_us-Samad.jpg',
  'عبدالرحمن السديس': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Abdurrahman_Al-Sudais_2016.jpg/440px-Abdurrahman_Al-Sudais_2016.jpg',
  'سعود الشريم': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Saud_Al-Shuraim.jpg/440px-Saud_Al-Shuraim.jpg',
  'ماهر المعيقلي': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Maher_Al_Muaiqly.jpg/440px-Maher_Al_Muaiqly.jpg',
  'ياسر الدوسري': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Yasser_Al-Dosari.jpg/440px-Yasser_Al-Dosari.jpg',
  'أحمد العجمي': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Ahmed_Al-Ajmi.jpg/440px-Ahmed_Al-Ajmi.jpg',
  'سعد الغامدي': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Saad_Al-Ghamdi.jpg/440px-Saad_Al-Ghamdi.jpg',
  'أبو بكر الشاطري': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Abu_Bakr_al-Shatri.jpg/440px-Abu_Bakr_al-Shatri.jpg',
  'ناصر القطامي': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Nasser_Al-Qatami.jpg/440px-Nasser_Al-Qatami.jpg',
  'عبدالله الجهني': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Abdullah_Awad_Al_Juhany.jpg/440px-Abdullah_Awad_Al_Juhany.jpg',
  'بندر بليلة': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Bandar_Baleela.jpg/440px-Bandar_Baleela.jpg',
};

export function getReciterPhotoAndInfo(reciterName: string, lang: 'ar' | 'en'): ReciterPhotoInfo {
  const cleanName = (reciterName || '').trim();
  let photoUrl = '';
  for (const [key, url] of Object.entries(KNOWN_RECITER_PHOTOS)) {
    if (cleanName.includes(key) || key.includes(cleanName)) {
      photoUrl = url;
      break;
    }
  }

  // Fallback to stylized SVG avatar if no Wikimedia photo matched
  if (!photoUrl) {
    const initials = cleanName.split(' ').slice(0, 2).map(w => w.charAt(0)).join('');
    photoUrl = `https://api.iconify.design/lucide:user-round.svg?color=%23c9a44c`;
  }

  return {
    photoUrl,
    bioAr: lang === 'ar'
      ? `قارئ من أشهر قراء القرآن الكريم، اشتهر بحسن التلاوة والخشوع وإتقان أحكام التجويد بروايات القرآن الكريم.`
      : `Renowned Quran reciter recognized for beautiful melodious recitation and mastery of Tajweed rules.`,
    bioEn: `Renowned Quran reciter recognized for beautiful melodious recitation and mastery of Tajweed rules.`,
    countryAr: cleanName.includes('السديس') || cleanName.includes('الشريم') || cleanName.includes('المعيقلي') || cleanName.includes('الجهني') || cleanName.includes('بليلة') || cleanName.includes('الدوسري') || cleanName.includes('الغامدي') ? 'المملكة العربية السعودية' : 'عالمي',
    countryEn: 'Islamic World',
  };
}
