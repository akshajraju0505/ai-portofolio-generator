# main.py
from fastapi import FastAPI, File, UploadFile, HTTPException
import os
import pdfplumber
import docx
import logging
from openai import OpenAI
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import json

load_dotenv()
app = FastAPI()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Deploy Request ===
class DeployRequest(BaseModel):
    html_code: str
    css_code: str
    js_code: str

# === Dummy deployer function ===
def deploy_html_code(html, css, js):
    # Mocked deployment logic — replace with actual Netlify CLI logic
    folder = "deployed_site"
    os.makedirs(folder, exist_ok=True)
    with open(f"{folder}/index.html", "w") as f:
        f.write(html)
    with open(f"{folder}/style.css", "w") as f:
        f.write(css)
    with open(f"{folder}/script.js", "w") as f:
        f.write(js)
    return "https://example.netlify.app"

@app.post("/deploy-site/")
async def deploy_site(data: DeployRequest):
    try:
        url = deploy_html_code(data.html_code, data.css_code, data.js_code)
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# === Resume Text Extraction ===
def extract_text_from_pdf(path: str) -> str:
    with pdfplumber.open(path) as pdf:
        return "\n".join([page.extract_text() or "" for page in pdf.pages])

def extract_text_from_docx(path: str) -> str:
    doc = docx.Document(path)
    return "\n".join([p.text for p in doc.paragraphs])

def chunk_text(text, max_chunk_size=2000):
    words, chunks, current = text.split(), [], ""
    for word in words:
        if len(current) + len(word) + 1 > max_chunk_size:
            chunks.append(current)
            current = word
        else:
            current += " " + word if current else word
    if current:
        chunks.append(current)
    return chunks

def summarize(client, chunk, i):
    prompt = f"Summarize part {i+1} of a resume:\n\n{chunk}\n\nFocus on About, Skills, Work, and Projects."
    resp = client.chat.completions.create(
        model="llama3-8b-8192",
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": prompt},
        ],
    )
    return resp.choices[0].message.content.strip()

def generate_code_from_summary(client, summary):
    prompt = f"""
Generate a modern portfolio site based on this resume summary.
Return three strings:
- HTML file (reference style.css and script.js)
- CSS file (basic Tailwind or utility-based styling)
- JS file (simple interactive features)

Resume Summary:
{summary}

Respond with valid JSON object like:
{{
  "html_code": "<!DOCTYPE html>...</html>",
  "css_code": "body {{ ... }}",
  "js_code": "console.log('...')"
}}
    """
    resp = client.chat.completions.create(
        model="llama3-8b-8192",
        messages=[{"role": "user", "content": prompt}]
    )

    try:
        return json.loads(resp.choices[0].message.content.strip())
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Invalid JSON from model: {str(e)}")

@app.post("/upload-resume/")
async def upload_resume(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[-1].lower()
    if ext not in [".pdf", ".docx"]:
        raise HTTPException(status_code=400, detail="Only PDF and DOCX are allowed")

    os.makedirs("temp_files", exist_ok=True)
    path = f"temp_files/{file.filename}"
    with open(path, "wb") as f:
        f.write(await file.read())

    if ext == ".pdf":
        text = extract_text_from_pdf(path)
    else:
        text = extract_text_from_docx(path)

    os.remove(path)

    if not text.strip():
        raise HTTPException(status_code=400, detail="No text extracted from resume")

    client = OpenAI(
        base_url="https://api.groq.com/openai/v1",
        api_key=os.getenv("GROQ_API_KEY")
    )

    chunks = chunk_text(text)
    summary = "\n\n".join([summarize(client, c, i) for i, c in enumerate(chunks)])

    result = generate_code_from_summary(client, summary)
    return JSONResponse(content=result)
