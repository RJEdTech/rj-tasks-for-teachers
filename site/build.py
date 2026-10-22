"""Builds the RJ Tasks for Teachers homepage into docs/ (served by GitHub Pages).

  npm run build && python3 site/build.py

Packages build/ as docs/downloads/rj-tasks-for-teachers-<version>.zip, writes
SHA256SUMS.txt, and fills index.html and privacy.html from the templates.
"""
import hashlib, json, os, re, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from illustrations import ILL_DOWNLOAD, ILL_EXTRACT, ILL_ADDRESS, ILL_DEVMODE, ILL_LOAD, ILL_PIN  # noqa: E402

VERSION = json.load(open(os.path.join(ROOT, "package.json")))["version"]
UPDATED = "October 22, 2026"
ZIP = f"rj-tasks-for-teachers-{VERSION}.zip"
FOLDER = f"rj-tasks-for-teachers-{VERSION}"
FORM_URL = ("https://forms.cloud.microsoft/Pages/ResponsePage.aspx?"
            "id=4SwuQZc-CEClZjjFdYLisQzihhIB-7hPp9L3AOSeJONUMFQ0SlRPSTgwQkJCWDM4SkEzNzFPRFZDUi4u")
DOCS = os.path.join(ROOT, "docs")
DL = os.path.join(DOCS, "downloads")
BUILD = os.path.join(ROOT, "build")

manifest = json.load(open(os.path.join(BUILD, "manifest.json")))
assert manifest["version"] == VERSION, "build/ is stale: run npm run build"

os.makedirs(DL, exist_ok=True)
for f in os.listdir(DL):
    if f.endswith(".zip") and f != ZIP:
        os.remove(os.path.join(DL, f))
zpath = os.path.join(DL, ZIP)
with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
    for name in sorted(os.listdir(BUILD)):
        if name.startswith("."):
            continue
        info = zipfile.ZipInfo(name, date_time=(2026, 10, 22, 0, 0, 0))  # reproducible zip
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        z.writestr(info, open(os.path.join(BUILD, name), "rb").read())
SHA256 = hashlib.sha256(open(zpath, "rb").read()).hexdigest()
open(os.path.join(DL, "SHA256SUMS.txt"), "w").write(f"{SHA256}  {ZIP}\n")
size_kb = round(os.path.getsize(zpath) / 1024)


def teacherize(svg):
    svg = re.sub(r"RJ Tasks for Students  \d+\.\d+\.\d+", f"RJ Tasks for Teachers  {VERSION}", svg)
    svg = svg.replace("RJ Tasks for Students", "RJ Tasks for Teachers")
    svg = svg.replace("rjedtech.github.io/rj-tasks-site", "rjedtech.github.io/rj-tasks-for-teachers")
    return re.sub(r"rj-tasks-(for-students-)?\d+\.\d+\.\d+", FOLDER, svg)


fills = {
    "{{ILL_DOWNLOAD}}": ILL_DOWNLOAD, "{{ILL_EXTRACT}}": ILL_EXTRACT, "{{ILL_ADDRESS}}": ILL_ADDRESS,
    "{{ILL_DEVMODE}}": ILL_DEVMODE, "{{ILL_LOAD}}": ILL_LOAD, "{{ILL_PIN}}": ILL_PIN,
}
fills = {k: teacherize(v) for k, v in fills.items()}
fills.update({"{{VERSION}}": VERSION, "{{UPDATED}}": UPDATED, "{{ZIP}}": ZIP, "{{FOLDER}}": FOLDER,
              "{{ZIPKB}}": str(size_kb), "{{SHA256}}": SHA256, "{{FORM_URL}}": FORM_URL.replace("&", "&amp;")})

for src, dst in (("template.html", "index.html"), ("privacy.html", "privacy.html")):
    html = open(os.path.join(HERE, src)).read()
    for k, v in fills.items():
        html = html.replace(k, v)
    assert "{{" not in html, f"unfilled placeholder in {src}"
    open(os.path.join(DOCS, dst), "w").write(html)
    print(dst, len(html), "bytes")
print(ZIP, size_kb, "KB", SHA256)
