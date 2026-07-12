// 漢字（かな） → <ruby>漢字<rt>かな</rt></ruby>. A run of kanji immediately
// followed by full-width parens becomes ruby; everything else is untouched.
export function furiganaToRuby(s) {
  return String(s).replace(
    /([一-鿿々〆ヶ]+)（([^（）]*)）/g,
    '<ruby>$1<rt>$2</rt></ruby>'
  );
}
