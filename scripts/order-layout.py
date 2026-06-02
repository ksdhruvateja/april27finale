import fitz
path = r"c:\Users\bossd\Downloads\april27finale (1)\april27finale\Order_5236.pdf"
page = fitz.open(path)[0]
print("size", page.rect)
items = []
for b in page.get_text("dict")["blocks"]:
    if b.get("type") != 0:
        continue
    for line in b.get("lines", []):
        t = "".join(s["text"] for s in line.get("spans", []))
        if not t.strip():
            continue
        bb = line["bbox"]
        sizes = [s.get("size", 0) for s in line.get("spans", [])]
        bold = any("Bold" in s.get("font", "") for s in line.get("spans", []))
        items.append((bb[1], bb[0], t.strip(), max(sizes) if sizes else 0, bold))
for y, x, t, sz, b in sorted(items):
    flag = " B" if b else ""
    print(f"y={y:6.1f} x={x:6.1f} sz={sz:4.1f}{flag} | {t}")
print("--- drawings ---")
for i, d in enumerate(page.get_drawings()):
    r = d.get("rect")
    if r:
        print(i, d.get("fill"), tuple(round(v, 1) for v in r))
