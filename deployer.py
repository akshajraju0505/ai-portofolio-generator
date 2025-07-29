import os
import uuid
import subprocess

DEPLOY_BASE_DIR = "uploads"

def deploy_html_code(html_code, css_code, js_code) -> str:
    site_id = str(uuid.uuid4())[:8]
    site_dir = os.path.join(DEPLOY_BASE_DIR, site_id)
    os.makedirs(site_dir, exist_ok=True)

    with open(os.path.join(site_dir, "index.html"), "w") as f:
        f.write(html_code)

    with open(os.path.join(site_dir, "style.css"), "w") as f:
        f.write(css_code)

    with open(os.path.join(site_dir, "script.js"), "w") as f:
        f.write(js_code)

    result = subprocess.run(
        ["netlify", "deploy", "--dir", site_dir, "--prod", "--message", "AI Site Deployment"],
        capture_output=True, text=True, check=True
    )

    for line in result.stdout.splitlines():
        if "Website URL:" in line:
            return line.split("Website URL:")[-1].strip()

    raise Exception("Deployment succeeded but no URL found.")
