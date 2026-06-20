# home / timetable / map のスクショを3枚並べた「マルチデバイス」合成画像を作る。
import os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from PIL import Image, ImageDraw, ImageFilter

SC = os.path.join(os.path.dirname(__file__), 'public', 'screens')

def rounded(im, rad):
    im = im.convert('RGBA')
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.size[0]-1, im.size[1]-1], radius=rad, fill=255)
    im.putalpha(mask)
    return im

def phone(path, h):
    im = Image.open(path).convert('RGBA')
    w = int(im.width * h / im.height)
    im = im.resize((w, h), Image.LANCZOS)
    im = rounded(im, 46)
    # ベゼル
    pad = 16
    bez = Image.new('RGBA', (w + pad*2, h + pad*2), (0, 0, 0, 0))
    body = Image.new('RGBA', bez.size, (0, 0, 0, 0))
    ImageDraw.Draw(body).rounded_rectangle([0, 0, bez.size[0]-1, bez.size[1]-1], radius=62, fill=(20, 26, 33, 255))
    bez = Image.alpha_composite(bez, body)
    bez.alpha_composite(im, (pad, pad))
    return bez

def with_shadow(im, blur=30, alpha=120, off=(0, 18)):
    pad = blur*2 + max(abs(off[0]), abs(off[1]))
    canvas = Image.new('RGBA', (im.width + pad*2, im.height + pad*2), (0, 0, 0, 0))
    sh = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    a = im.split()[3].point(lambda p: alpha if p > 0 else 0)
    shape = Image.new('RGBA', im.size, (0, 0, 0, 0)); shape.putalpha(a)
    sh.alpha_composite(shape, (pad + off[0], pad + off[1]))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    sh.alpha_composite(im, (pad, pad))
    return sh

H = 1000
center = with_shadow(phone(os.path.join(SC, 'home.png'), H))
left   = with_shadow(phone(os.path.join(SC, 'timetable.png'), int(H*0.82)))
right  = with_shadow(phone(os.path.join(SC, 'map.png'), int(H*0.82)))

W = int(center.width * 2.15)
HT = center.height + 40
canvas = Image.new('RGBA', (W, HT), (0, 0, 0, 0))
cx = W // 2
canvas.alpha_composite(left,  (int(cx - center.width*0.92 - left.width*0.18), HT - left.height))
canvas.alpha_composite(right, (int(cx + center.width*0.92 - right.width*0.82), HT - right.height))
canvas.alpha_composite(center, (cx - center.width // 2, 0))

bb = canvas.getbbox()
canvas = canvas.crop(bb)
out = os.path.join(SC, 'multidevice.png')
canvas.save(out)
print('saved', out, canvas.size)
