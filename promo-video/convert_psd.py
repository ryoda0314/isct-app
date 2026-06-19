# パーツ分け立ち絵PSDから「感情ごと × 口閉じ/口開き」のPNGを書き出す。
# 使い方: python convert_psd.py            … 本番PNG + 確認用ストリップ生成
#         python convert_psd.py --sheet    … 確認用の表情ストリップだけ
import glob, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from psd_tools import PSDImage
from PIL import Image

ASSETS = os.path.join(os.path.dirname(__file__), 'public', 'assets')
EXPR_ORDER = ['normal', 'happy', 'excited', 'surprised', 'troubled', 'doya']

# eyes 指定:
#   ('child', '<名>')              … 目グループ直下の閉じ目系（にっこり/目閉じ 等）
#   ('set', '<白目>', '<黒目>')    … 目セット（白目）＋黒目位置
CHARS = {
    'zunda': {
        'detect': '枝豆',
        'expr': {
            'normal':    {'brow':'普通眉',  'eyes':('set','普通白目','カメラ目線'), 'close':'むふ', 'open':'お'},
            'happy':     {'brow':'普通眉',  'eyes':('child','にっこり'),            'close':'むふ', 'open':'おほお', 'face':'ほっぺ'},
            'excited':   {'brow':'上がり眉','eyes':('set','見開き白目','カメラ目線'),'close':'ほあ', 'open':'ほあー', 'face':'ほっぺ赤め'},
            'surprised': {'brow':'上がり眉','eyes':('set','見開き白目','普通目'),    'close':'△',   'open':'ほあー', 'show':['汗1']},
            'troubled':  {'brow':'困り眉1', 'eyes':('set','普通白目','目逸らし'),    'close':'△',   'open':'ゆ',    'show':['汗1']},
            'doya':      {'brow':'上がり眉','eyes':('child','細め目'),               'close':'むふ', 'open':'ゆ'},
        },
    },
    'metan': {
        'detect': 'ツインドリル',
        'expr': {
            'normal':    {'brow':'太眉ごきげん','eyes':('set','普通白目','カメラ目線'), 'close':'ほほえみ','open':'お',   'arm_l':'普通','arm_r':'普通'},
            'happy':     {'brow':'太眉ごきげん','eyes':('child','目閉じ'),             'close':'ほほえみ','open':'わあー','arm_l':'普通','arm_r':'普通','face':'赤面'},
            'excited':   {'brow':'太眉ごきげん','eyes':('set','見開き白目','カメラ目線'),'close':'にやり', 'open':'わあー','arm_r':'普通','arm_l':'普通','face':'赤面'},
            'surprised': {'brow':'太眉おこ',   'eyes':('set','見開き白目','普通目'),    'close':'△',     'open':'わあー','arm_l':'普通','arm_r':'普通','show':['汗']},
            'troubled':  {'brow':'太眉こまり', 'eyes':('set','普通白目','目そらし'),    'close':'む',     'open':'うえー','arm_l':'普通','arm_r':'普通','show':['汗']},
            'doya':      {'brow':'太眉ごきげん','eyes':('set','普通白目','目そらし'),    'close':'にやり', 'open':'にやり','arm_l':'普通','arm_r':'普通'},
        },
    },
}

def all_layers(root):
    out = []
    def rec(ls):
        for l in ls:
            out.append(l)
            if l.is_group(): rec(l)
    rec(root); return out

def groups_named(root, name):
    return [l for l in all_layers(root) if l.is_group() and name in l.name]

def find_group(root, name):
    g = groups_named(root, name)
    return g[0] if g else None

def exclusive(group, target):
    """group直下で target だけ表示。"""
    if group is None: return None
    pick = None
    for l in group:
        if l.name.strip('*! ') == target: pick = l; break
    if pick is None:
        for l in group:
            if target in l.name: pick = l; break
    for l in group:
        l.visible = False
    if pick: pick.visible = True
    return pick.name if pick else None

def set_eyes(eye_group, spec):
    if eye_group is None: return
    for l in eye_group:
        l.visible = False
    if spec[0] == 'child':
        exclusive(eye_group, spec[1])
    else:  # ('set', white, kurome)
        setg = find_group(eye_group, '目セット')
        if not setg: return
        setg.visible = True
        for l in setg:
            l.visible = False
        for l in setg:
            if spec[1] in l.name:
                l.visible = True
        kuro = find_group(setg, '黒目')
        if kuro:
            kuro.visible = True
            exclusive(kuro, spec[2])

def apply_expr(psd, e, mouth_state):
    exclusive(find_group(psd, '眉'), e['brow'])
    set_eyes(find_group(psd, '目'), e['eyes'])
    exclusive(find_group(psd, '口'), e['close'] if mouth_state == 'close' else e['open'])
    if 'face' in e:
        exclusive(find_group(psd, '顔色'), e['face'])
    if 'arm_r' in e:
        for g in groups_named(psd, '右腕'): exclusive(g, e['arm_r'])
    if 'arm_l' in e:
        for g in groups_named(psd, '左腕'): exclusive(g, e['arm_l'])
    # 記号(汗/涙など)
    for nm in e.get('show', []):
        for l in all_layers(psd):
            if not l.is_group() and l.name.strip('*! ') == nm:
                l.visible = True

def detect(psd, kw):
    return any(kw in l.name for l in all_layers(psd))

def render(psd):
    img = psd.composite(force=True)
    bb = img.getbbox()
    return img.crop(bb) if bb else img

def main():
    sheet_only = '--sheet' in sys.argv
    files = sorted(glob.glob(os.path.join(ASSETS, '*.psd')))
    for slug, cfg in CHARS.items():
        src_path = None
        for f in files:
            if detect(PSDImage.open(f), cfg['detect']): src_path = f; break
        if src_path is None:
            print('[skip] PSD not found for', slug); continue
        print(f'=== {slug} ===')
        faces = []
        for expr in EXPR_ORDER:
            e = cfg['expr'][expr]
            for state in ('close', 'open'):
                p2 = PSDImage.open(src_path)  # 毎回開き直して表示状態をリセット
                apply_expr(p2, e, state)
                img = render(p2)
                if not sheet_only:
                    out = os.path.join(ASSETS, f'{slug}_{expr}_{state}.png')
                    img.save(out)
                if state == 'close':
                    w, h = img.size
                    faces.append((expr, img.crop((0, 0, w, int(h * 0.34)))))
            print(f'  {expr}: ok')
        # 確認用ストリップ（顔アップを横並び）
        th = 360
        thumbs = [im.resize((int(im.width * th / im.height), th)) for _, im in faces]
        strip = Image.new('RGBA', (sum(t.width for t in thumbs), th), (240, 240, 240, 255))
        x = 0
        for t in thumbs:
            strip.paste(t, (x, 0), t); x += t.width
        strip.save(os.path.join(ASSETS, '..', '..', 'out', f'sheet_{slug}.png'))
        print(f'  順番: {EXPR_ORDER}')
    print('完了')

main()
