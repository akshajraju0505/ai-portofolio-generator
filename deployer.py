import os
import uuid
import subprocess

DEPLOY_BASE_DIR = "uploads"

def deploy_html_code(html_code: str) -> str:
    # Create unique directory
    site_id = str(uuid.uuid4())[:8]
    site_dir = os.path.join(DEPLOY_BASE_DIR, site_id)
    os.makedirs(site_dir, exist_ok=True)

    # Write HTML to index.html
    html_path = os.path.join(site_dir, "index.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_code)

    # Deploy using Netlify CLI
    result = subprocess.run(
        ["netlify", "deploy", "--dir", site_dir, "--prod", "--message", "Deployed by AI"],
        capture_output=True, text=True, check=True
    )

    # Extract deployed URL from output
    for line in result.stdout.splitlines():
        if "Website URL:" in line:
            return line.split("Website URL:")[-1].strip()

    raise Exception("Deployment succeeded but no URL found.")
