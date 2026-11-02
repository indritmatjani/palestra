"""Genera le icone dell'app (manubrio bianco su sfondo blu iOS)."""
from PIL import Image, ImageDraw

def icon(size, pad=0.0):
    s = 4  # supersampling per bordi lisci
    W = size * s
    img = Image.new('RGB', (W, W), (10, 132, 255))
    d = ImageDraw.Draw(img)
    # sfumatura verticale leggera
    for y in range(W):
        t = y / W
        d.line([(0, y), (W, y)], fill=(int(10 + 20 * t), int(132 - 50 * t), int(255 - 40 * t)))
    k = W * (1 - 2 * pad) / 1024
    o = W * pad
    def R(x0, y0, x1, y1, r):
        d.rounded_rectangle([o + x0 * k, o + y0 * k, o + x1 * k, o + y1 * k], radius=r * k, fill='white')
    R(250, 480, 774, 544, 20)    # barra
    R(300, 330, 390, 694, 36)    # dischi grandi
    R(634, 330, 724, 694, 36)
    R(200, 400, 280, 624, 30)    # dischi piccoli
    R(744, 400, 824, 624, 30)
    return img.resize((size, size), Image.LANCZOS)

icon(192).save('icons/icon-192.png')
icon(512).save('icons/icon-512.png')
icon(512, pad=0.1).save('icons/icon-maskable-512.png')
icon(180).save('icons/apple-touch-icon.png')
print('icone create')
