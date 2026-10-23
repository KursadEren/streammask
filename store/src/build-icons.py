#!/usr/bin/env python3
"""StreamMask ikonu: tek geometriden hem SVG hem PNG üretir.

Neden tek betik: SVG ile PNG'lerin elle ayrı tutulması er geç birbirinden kayar.
Buradaki ölçüler tek doğru; betik hem store/src/*.svg dosyalarını hem de
icons/*.png dosyalarını yazar.

Neden kendi rasterleştiricimiz var: Chrome uzantı ikonları PNG olmak zorunda, ama
bu makinede çalışan bir SVG rasterleştirici yok (cairo kütüphanesi eksik,
QuickLook ikonu tuvalin köşesine basıyor, file:// sayfasında betik çalışmıyor).
Çizim birkaç basit şekilden ibaret olduğu için işaretli mesafe fonksiyonlarıyla
doğrudan çiziyoruz: 4x4 süper örnekleme, sıfır bağımlılık, her boyut vektörden
yeniden hesaplanır (büyük PNG küçültülmez).

Kullanım:  python3 store/src/build-icons.py
"""
import math
import os
import struct
import sys
import zlib

SS = 4                                  # kenar başına süper örnekleme

# ---------------------------------------------------------------- geometri
# 128 birimlik tasarım alanı, merkez (0,0)
ARMS = 6                                # altı kollu yıldız = asterisk
ARM_LEN = 35.0                          # merkezden uç merkezine
R_IN = 11.2                             # kol merkezde bu kalınlıkta
R_OUT = 8.6                             # uçta hafifçe inceliyor; daha fazlası kar tanesine benziyor
CORNER = 29.0                           # yuvarlatılmış kare köşesi
CORNER_SMALL = 26.0

# Küçük boyutlarda incelme ve degrade kayboluyor, bant yapıyor: ayrı çizim
SMALL = dict(corner=CORNER_SMALL, arm=31.0, r_in=11.0, r_out=11.0,
             flat=(0x5B, 0x4B, 0xF0), sheen=0.0, glow=0.0, mark_shade=0.0)
BIG = dict(corner=CORNER, arm=ARM_LEN, r_in=R_IN, r_out=R_OUT,
           flat=None, sheen=0.16, glow=0.22, mark_shade=0.10)

STOPS = [(0.00, (0x8A, 0x7CFF - 0x7C00, 0xFF)),  # yer tutucu, aşağıda düzeltilir
         ]
STOPS = [(0.00, (0x8A, 0x7B, 0xFF)),
         (0.52, (0x63, 0x55, 0xF2)),
         (1.00, (0x42, 0x2D, 0xD2))]
GRAD = ((0.08, 0.0), (0.72, 1.0))       # birim kare içinde degrade yönü
GLOW_AT = (0.30, 0.20)                  # sol üstten yumuşak ışık


def arm_angles():
    return [math.radians(90 + i * (360.0 / ARMS)) for i in range(ARMS)]


# ---------------------------------------------------------------- SDF'ler
def sd_rounded_rect(x, y, half, r):
    qx, qy = abs(x) - (half - r), abs(y) - (half - r)
    return math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - r


def sd_round_cone(px, py, ax, ay, bx, by, r1, r2):
    """İki farklı yarıçaplı uç arasındaki konik kapsül (Inigo Quilez, 2B)."""
    bax, bay = bx - ax, by - ay
    l2 = bax * bax + bay * bay
    if l2 == 0.0:
        return math.hypot(px - ax, py - ay) - r1
    rr = r1 - r2
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    pax, pay = px - ax, py - ay
    y = pax * bax + pay * bay
    z = y - l2
    dx = pax * l2 - bax * y
    dy = pay * l2 - bay * y
    x2 = dx * dx + dy * dy
    y2 = y * y * l2
    z2 = z * z * l2
    k = (1.0 if rr > 0 else -1.0 if rr < 0 else 0.0) * rr * rr * x2
    if (1.0 if z > 0 else -1.0 if z < 0 else 0.0) * a2 * z2 > k:
        return math.sqrt(x2 + z2) * il2 - r2
    if (1.0 if y > 0 else -1.0 if y < 0 else 0.0) * a2 * y2 < k:
        return math.sqrt(x2 + y2) * il2 - r1
    return (math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1


def mark_sdf(x, y, p):
    """Yıldıza uzaklık: altı konik kol, merkezde birleşiyor."""
    best = 1e9
    for a in arm_angles():
        tx, ty = math.cos(a) * p['arm'], -math.sin(a) * p['arm']
        d = sd_round_cone(x, y, 0.0, 0.0, tx, ty, p['r_in'], p['r_out'])
        if d < best:
            best = d
    return best


# ---------------------------------------------------------------- renk
def lerp(c0, c1, k):
    return tuple(c0[i] + (c1[i] - c0[i]) * k for i in range(3))


def grad_color(ux, uy):
    (ax, ay), (bx, by) = GRAD
    vx, vy = bx - ax, by - ay
    t = ((ux - ax) * vx + (uy - ay) * vy) / (vx * vx + vy * vy)
    t = max(0.0, min(1.0, t))
    for i in range(len(STOPS) - 1):
        t0, c0 = STOPS[i]
        t1, c1 = STOPS[i + 1]
        if t <= t1 or i == len(STOPS) - 2:
            k = 0.0 if t1 == t0 else max(0.0, min(1.0, (t - t0) / (t1 - t0)))
            return lerp(c0, c1, k)
    return STOPS[-1][1]


def bg_color(ux, uy, p):
    if p['flat'] is not None:
        return p['flat']
    c = grad_color(ux, uy)
    if p['glow'] > 0:                      # sol üstten yumuşak ışık
        d = math.hypot(ux - GLOW_AT[0], uy - GLOW_AT[1])
        k = max(0.0, 1.0 - d / 0.78) ** 2 * p['glow']
        c = lerp(c, (255, 255, 255), k)
    if p['sheen'] > 0 and uy < 0.42:       # üst kenarda ince parlama
        c = lerp(c, (255, 255, 255), p['sheen'] * (1.0 - uy / 0.42) ** 1.6)
    return c


def mark_color(uy, p):
    """Düz beyaz yerine aşağı doğru hafif soğuyan beyaz: yüzey düz görünmesin."""
    if p['mark_shade'] <= 0:
        return (255, 255, 255)
    return lerp((255, 255, 255), (0xE4, 0xDE, 0xFF), min(1.0, max(0.0, uy)) * p['mark_shade'])


# ---------------------------------------------------------------- raster
def render(size, p):
    scale = size / 128.0
    half = 64.0 * scale
    corner = p['corner'] * scale
    q = dict(p, arm=p['arm'] * scale, r_in=p['r_in'] * scale, r_out=p['r_out'] * scale)
    step, off, n = 1.0 / SS, 1.0 / (2 * SS), SS * SS

    px = bytearray()
    for row in range(size):
        px.append(0)                                   # satır filtresi yok
        for col in range(size):
            racc = gacc = bacc = cov = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    x = col + off + sx * step - size / 2.0
                    y = row + off + sy * step - size / 2.0
                    if sd_rounded_rect(x, y, half, corner) > 0:
                        continue
                    ux = (x + size / 2.0) / size
                    uy = (y + size / 2.0) / size
                    if mark_sdf(x, y, q) <= 0:
                        c = mark_color(uy, p)
                    else:
                        c = bg_color(ux, uy, p)
                    racc += c[0]; gacc += c[1]; bacc += c[2]; cov += 1.0
            if cov == 0:
                px.extend((0, 0, 0, 0))
            else:
                px.extend((int(racc / cov + 0.5), int(gacc / cov + 0.5),
                           int(bacc / cov + 0.5), int(255.0 * cov / n + 0.5)))
    return bytes(px)


def write_png(path, size, raw):
    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    open(path, 'wb').write(png)


# ---------------------------------------------------------------- SVG
def cone_path(ax, ay, bx, by, r1, r2):
    """İki yarıçap arasındaki konik kapsülün dış hattı: teğetler + uç yayları."""
    d = math.hypot(bx - ax, by - ay)
    alpha = math.atan2(by - ay, bx - ax)
    ratio = max(-1.0, min(1.0, (r1 - r2) / d))
    beta = math.acos(ratio)
    p1a = (ax + r1 * math.cos(alpha + beta), ay + r1 * math.sin(alpha + beta))
    p2a = (bx + r2 * math.cos(alpha + beta), by + r2 * math.sin(alpha + beta))
    p1b = (ax + r1 * math.cos(alpha - beta), ay + r1 * math.sin(alpha - beta))
    p2b = (bx + r2 * math.cos(alpha - beta), by + r2 * math.sin(alpha - beta))
    f = lambda v: ('%.3f' % v).rstrip('0').rstrip('.')
    return ('M %s %s L %s %s A %s %s 0 0 0 %s %s L %s %s A %s %s 0 0 0 %s %s Z' % (
        f(p1a[0]), f(p1a[1]), f(p2a[0]), f(p2a[1]),
        f(r2), f(r2), f(p2b[0]), f(p2b[1]),
        f(p1b[0]), f(p1b[1]), f(r1), f(r1), f(p1a[0]), f(p1a[1])))


def mark_paths(p, cx=64.0, cy=64.0):
    out = []
    for a in arm_angles():
        tx, ty = cx + math.cos(a) * p['arm'], cy - math.sin(a) * p['arm']
        out.append(cone_path(cx, cy, tx, ty, p['r_in'], p['r_out']))
    return out


def svg_big():
    paths = '\n    '.join('<path d="%s"/>' % d for d in mark_paths(BIG))
    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" role="img" aria-label="StreamMask">
  <!-- ÜRETİLMİŞ DOSYA — store/src/build-icons.py ile yeniden basılır, elle düzenlemeyin.
       48 piksel ve üstü için: degrade, sol üstten ışık, kolları inceltilmiş yıldız. -->
  <defs>
    <linearGradient id="bg" x1="0.08" y1="0" x2="0.72" y2="1">
      <stop offset="0" stop-color="#8A7BFF"/>
      <stop offset="0.52" stop-color="#6355F2"/>
      <stop offset="1" stop-color="#422DD2"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.30" cy="0.20" r="0.78">
      <stop offset="0" stop-color="#fff" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="mark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#EFEBFF"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="29" fill="url(#bg)"/>
  <rect width="128" height="128" rx="29" fill="url(#glow)"/>
  <g fill="url(#mark)">
    %s
  </g>
</svg>
''' % paths


def svg_small():
    paths = '\n    '.join('<path d="%s"/>' % d for d in mark_paths(SMALL))
    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" role="img" aria-label="StreamMask">
  <!-- ÜRETİLMİŞ DOSYA — store/src/build-icons.py ile yeniden basılır.
       16 ve 32 piksel için: düz renk (degrade bu boyutta bantlanır), kollar
       inceltilmeden sabit kalınlıkta, yoksa uçlar kaybolur. -->
  <rect width="128" height="128" rx="26" fill="#5B4BF0"/>
  <g fill="#ffffff">
    %s
  </g>
</svg>
''' % paths


def svg_mark():
    p = dict(BIG)
    paths = '\n    '.join('<path d="%s"/>' % d for d in mark_paths(p, 44.0, 44.0))
    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" width="88" height="88" role="img" aria-label="StreamMask">
  <!-- ÜRETİLMİŞ DOSYA — zeminsiz işaret: site başlığı, promo görselleri.
       currentColor kullanır, böylece bulunduğu yerin rengini alır. -->
  <g fill="currentColor">
    %s
  </g>
</svg>
''' % paths


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.normpath(os.path.join(here, '..', '..'))
    out_png = sys.argv[1] if len(sys.argv) > 1 else None

    for name, text in (('icon.svg', svg_big()), ('icon-small.svg', svg_small()),
                       ('mark.svg', svg_mark())):
        open(os.path.join(here, name), 'w', encoding='utf-8').write(text)
        print('store/src/' + name)

    targets = [out_png] if out_png else [os.path.join(root, 'icons'),
                                         os.path.join(root, 'store', 'out')]
    for size, params in ((16, SMALL), (32, SMALL), (48, BIG), (128, BIG)):
        raw = render(size, params)
        for d in targets:
            os.makedirs(d, exist_ok=True)
            path = os.path.join(d, 'icon%d.png' % size)
            write_png(path, size, raw)
        print('icon%d.png (%d bayt)' % (size, os.path.getsize(
            os.path.join(targets[0], 'icon%d.png' % size))))


if __name__ == '__main__':
    main()
