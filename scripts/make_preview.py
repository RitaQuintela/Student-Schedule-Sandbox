"""Builds a hidden preview of the student pages, to look at a new design online before it goes live.

Usage (from the checkout that has the new design):
    python scripts/make_preview.py <folder of the checkout that is published (main)>

It writes <that folder>/preview/ with this checkout's student pages, stylesheet and scripts:
    preview/master/index.html, preview/undergraduate/index.html, preview/css, preview/js
The preview pages read the live data (../../master/data/…), logos and fonts of the published site,
so they always show what students have now, in the new design. They are not linked from anywhere
and ask search engines not to list them. The live pages are not touched.
"""
import pathlib
import shutil
import sys

src = pathlib.Path(__file__).resolve().parent.parent
out = pathlib.Path(sys.argv[1]).resolve() / "preview"

if out.exists():
    shutil.rmtree(out)
(out / "css").mkdir(parents=True)
(out / "js").mkdir()

# Stylesheet: the fonts stay in the published site's vendor/fonts
css = (src / "css/styles.css").read_text(encoding="utf-8")
(out / "css/styles.css").write_text(css.replace('url("../vendor/fonts/', 'url("../../vendor/fonts/'), encoding="utf-8", newline="\n")

for name in ("site.js", "theme.js", "parser.js", "exams.js", "student.js"):
    shutil.copyfile(src / "js" / name, out / "js" / name)

for site in ("master", "undergraduate"):
    html = (src / site / "index.html").read_text(encoding="utf-8")
    for old, new in (
        ('="../assets/', '="../../assets/'),
        ('src="data/', 'src="../../%s/data/' % site),
        ("<title>", "<title>Preview · "),
        ('<meta name="viewport"', '<meta name="robots" content="noindex">\n<meta name="viewport"'),
    ):
        assert old in html, old
        html = html.replace(old, new)
    (out / site).mkdir()
    (out / site / "index.html").write_text(html, encoding="utf-8", newline="\n")

print("Preview written to", out)
