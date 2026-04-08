import fitz
import os

pdf_path = "1737534029051_PROJECTION OF SOLIDS00 (1).pdf"
out_dir = "pdf_images"
os.makedirs(out_dir, exist_ok=True)

try:
    doc = fitz.open(pdf_path)
    for i in range(min(5, len(doc))):
        page = doc.load_page(i)
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        pix.save(f"{out_dir}/page_{i+1}.png")
    print("Done")
except Exception as e:
    print(f"Error: {e}")
