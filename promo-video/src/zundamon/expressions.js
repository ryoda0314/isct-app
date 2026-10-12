// ずんだもんの表情（立ち絵素材2.3 のパーツの組み合わせ）。台本（script.json）の expr から引く。
// eyes: ['白目', '黒目'] の組か、まとまった目（'にっこり' など）。mouth は黙っているときの口（話している間は母音で替える）。
// face は顔色（重ねるもの）、marks は汗・涙。armL / armR は腕。eda は枝豆（頭の豆）。
// big: 話すときの口を大きめにする（はしゃいでいる）。hop: 行の頭で跳ねる。wave: 右手を振る
export const EXPR = {
  normal: { eyes: ['普通白目', 'カメラ目線'], brow: '普通眉', mouth: 'むふ', face: ['ほっぺ'], armL: '基本', armR: '基本' },
  point: { eyes: ['普通白目', 'カメラ目線'], brow: '上がり眉', mouth: 'むふ', face: ['ほっぺ'], armL: '腰', armR: '指差し' },
  happy: { eyes: 'にっこり', brow: '上がり眉', mouth: 'むふ', face: ['ほっぺ赤め'], armL: '腰', armR: '基本', big: true },
  joy: { eyes: 'にっこり2', brow: '上がり眉', mouth: 'ほあー', face: ['ほっぺ赤め'], armL: '手を挙げる', armR: '手を挙げる', big: true, hop: true },
  // 紹介する（向かって右の手を挙げる。タイトルの文字に重ならない側）
  present: { eyes: ['見開き白目', 'カメラ目線'], brow: '上がり眉', mouth: 'ほあ', face: ['ほっぺ赤め'], armL: '手を挙げる', armR: '基本', big: true, hop: true },
  excited: { eyes: ['見開き白目', 'カメラ目線'], brow: '上がり眉', mouth: 'ほあ', face: ['ほっぺ赤め'], armL: '基本', armR: '手を挙げる', big: true, hop: true },
  doya: { eyes: '細め目', brow: '上がり眉', mouth: 'むふ', face: ['ほっぺ'], armL: '腰', armR: '腰' },
  surprise: { eyes: ['見開き白目', 'カメラ目線'], brow: '上がり眉', mouth: 'お', face: ['ほっぺ'], armL: '基本', armR: '手を挙げる', hop: true },
  panic: { eyes: 'ぐるぐる', brow: '困り眉2', mouth: 'んへー', face: ['青ざめ'], marks: ['汗1', '汗2', '汗3'], eda: '枝豆萎え', armL: '苦しむ', armR: '苦しむ' },
  cry: { eyes: '><', brow: '困り眉1', mouth: 'むー', face: ['ほっぺ', 'かげり'], marks: ['涙'], eda: '枝豆萎え', armL: '口元', armR: '苦しむ' },
  think: { eyes: ['普通白目', '目逸らし'], brow: '困り眉1', mouth: 'むー', face: ['ほっぺ'], armL: '考える', armR: '基本' },
  whisper: { eyes: '細め目', brow: '困り眉1', mouth: 'ゆ', face: ['ほっぺ'], marks: ['汗1'], armL: 'ひそひそ', armR: '基本', small: true },
  jito: { eyes: 'ジト目', brow: '普通眉', mouth: 'むー', face: ['ほっぺ'], armL: '腰', armR: '基本' },
  confused: { eyes: ['普通白目', '目逸らし2'], brow: '困り眉2', mouth: '△', face: ['ほっぺ'], marks: ['汗1'], armL: '考える', armR: '基本' },
  wave: { eyes: 'にっこり', brow: '上がり眉', mouth: 'むふ', face: ['ほっぺ赤め'], armL: '手を挙げる', armR: '腰', big: true, wave: true },
};

// 母音 → 口（話している間）。big は大きめ、small は小さめ
export const mouthFor = (vowel, cons, phase, { big = false, small = false } = {}) => {
  // 唇を閉じる子音（ま行・ば行・ぱ行）の頭は口を閉じる
  if (/^(m|b|p)/.test(cons || '') && phase < 0.35) return 'んー';
  switch (vowel) {
    case 'a': return small ? 'ほー' : big ? 'ほあー' : 'ほあ';
    case 'i': return small ? 'むふ' : 'んへー';
    case 'u': return small ? 'ゆ' : 'お';
    case 'e': return small ? 'ほー' : big ? 'んあー' : 'ほあ';
    case 'o': return small ? 'お' : big ? 'おほお' : 'ほー';
    case 'N': return 'んー';
    case 'cl': return 'むふ';
    default: return null; // pau・無声（大文字の母音）は黙っているときの口
  }
};
