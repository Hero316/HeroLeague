#!/usr/bin/env python3
"""Erzeugt ein eigenes Symbol für die Team-/Chat-App (Hero-Türkis, Sprechblase).
Bewusst deutlich anders als das dunkle Haupt-Icon, damit man beide Apps auf dem
Startbildschirm sofort auseinanderhält. Läuft einmalig lokal; Ergebnis liegt als
PNG in public/assets/ und wird eingecheckt."""
from PIL import Image, ImageDraw, ImageFont

S = 1024  # hochauflösend rendern, danach herunterskalieren (scharfe Kanten)
TEAL = (34, 223, 201)      # #22DFC9  (brand-accent-light)
TEAL_D = (16, 189, 169)    # #10BDA9  (brand-accent)
BG_TOP = (12, 26, 23)
BG_BOT = (6, 15, 13)
WHITE = (245, 255, 253)


def rounded_tail_bubble(draw, box, radius, fill):
    """Sprechblase = abgerundetes Rechteck + kleiner Zipfel unten links."""
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(box, radius=radius, fill=fill)
    # Zipfel (Dreieck) unten links
    tx = x0 + int((x1 - x0) * 0.22)
    draw.polygon([(tx, y1 - 6), (tx + 120, y1 - 6), (tx + 30, y1 + 150)], fill=fill)


def make(size: int, maskable_pad: float = 0.0) -> Image.Image:
    img = Image.new("RGB", (S, S), BG_BOT)
    d = ImageDraw.Draw(img)
    # Vertikaler Hintergrund-Verlauf (dunkles Türkis-Anthrazit)
    for y in range(S):
        t = y / (S - 1)
        r = int(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t)
        g = int(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t)
        b = int(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t)
        d.line([(0, y), (S, y)], fill=(r, g, b))

    # Sichere Zone für maskable-Icons: Inhalt etwas kleiner/zentraler halten.
    inset = int(S * maskable_pad)
    cx = S // 2
    bw = int((S - 2 * inset) * 0.62)
    bh = int(bw * 0.66)
    bx0 = cx - bw // 2
    by0 = int(S * 0.26) + inset // 2
    box = (bx0, by0, bx0 + bw, by0 + bh)

    # Sprechblase mit leichtem Verlauf (oben heller): zwei Ebenen übereinander.
    rounded_tail_bubble(d, box, radius=int(bh * 0.34), fill=TEAL_D)
    top_box = (box[0], box[1], box[2], box[1] + int(bh * 0.6))
    d.rounded_rectangle(top_box, radius=int(bh * 0.34), fill=TEAL)

    # Drei Punkte (universelles Chat-Symbol) mittig in der Blase.
    dot_r = int(bh * 0.11)
    gap = int(bh * 0.34)
    dcy = box[1] + bh // 2
    for k in (-1, 0, 1):
        d.ellipse([cx + k * gap - dot_r, dcy - dot_r, cx + k * gap + dot_r, dcy + dot_r], fill=(8, 20, 18))

    # Wortmarke „TEAM" unter der Blase (echot das „LEAGUE" des Haupt-Icons).
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", int(S * 0.13))
        txt = "TEAM"
        tb = d.textbbox((0, 0), txt, font=font)
        tw = tb[2] - tb[0]
        ty = box[3] + int(S * 0.055)
        # Buchstabenabstand von Hand (spacing), damit es wertig wirkt.
        spacing = int(S * 0.012)
        total = tw + spacing * (len(txt) - 1)
        x = cx - total // 2
        for ch in txt:
            cb = d.textbbox((0, 0), ch, font=font)
            d.text((x - cb[0], ty), ch, font=font, fill=TEAL)
            x += (cb[2] - cb[0]) + spacing
    except Exception:
        pass

    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    make(512).save("public/assets/chat-icon-512.png")
    make(192).save("public/assets/chat-icon-192.png")
    # Maskable-Variante mit Sicherheitsrand (Android beschneidet zu Kreis/Squircle).
    make(512, maskable_pad=0.10).save("public/assets/chat-icon-512-maskable.png")
    # Apple-Touch-Icon: iOS rundet selbst, daher randlos, 180 px.
    make(180).save("public/assets/chat-apple-touch-icon.png")
    print("Chat-Icons erzeugt: 512, 192, 512-maskable, apple-touch 180")
