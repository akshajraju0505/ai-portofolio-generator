from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import os
import pdfplumber
import docx
import shutil
import logging
import json
from dotenv import load_dotenv
from openai import OpenAI

# === Load environment ===
load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# === CORS for frontend ===
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Models ===
class DeployRequest(BaseModel):
    html_code: str
    css_code: str
    js_code: str

# === Dummy deploy function ===
def deploy_html_code(html: str, css: str, js: str) -> str:
    folder = "deployed_site"
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "index.html"), "w") as f:
        f.write(html)
    with open(os.path.join(folder, "style.css"), "w") as f:
        f.write(css)
    with open(os.path.join(folder, "script.js"), "w") as f:
        f.write(js)
    return "https://example.netlify.app"

@app.post("/deploy-site/")
async def deploy_site(data: DeployRequest):
    try:
        url = deploy_html_code(data.html_code, data.css_code, data.js_code)
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# === Resume Handling ===
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

import re

def safe_parse_llm_json(text: str):
    # Remove code block wrapper if present
    if text.strip().startswith("```"):
        text = re.sub(r"^```(json)?", "", text.strip(), flags=re.IGNORECASE).strip()
        text = re.sub(r"```$", "", text.strip())

    # Replace single quotes with double quotes if needed
    if "'" in text and '"' not in text:
        text = text.replace("'", '"')

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Invalid JSON from model: {str(e)}")

def generate_code_from_summary(client, summary):
    prompt = f"""
Using the resume summary below, generate 3 separate code files:

1. A valid `index.html` using semantic HTML with Tailwind CSS linked (via <link href="style.css">).
2. A simple `style.css` file for layout and colors.
3. A `script.js` file with minimal interactivity (if needed).

Respond ONLY with a JSON object like this:

{{
  "html_code": "<!DOCTYPE html>...",
  "css_code": "body {{ background: white; }}",
  "js_code": "console.log('...');"
}}

Resume Summary:
{summary}
"""
    resp = client.chat.completions.create(
        model="llama3-8b-8192",
        messages=[{"role": "user", "content": prompt}]
    )

    text = resp.choices[0].message.content.strip()
    return safe_parse_llm_json(text)


@app.post("/upload-resume/")
async def upload_resume(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[-1].lower()
    if ext not in [".pdf", ".docx"]:
        raise HTTPException(status_code=400, detail="Only PDF and DOCX are allowed")

    # Save temp file
    os.makedirs("temp_files", exist_ok=True)
    path = f"temp_files/{file.filename}"
    with open(path, "wb") as f:
        f.write(await file.read())

    # Extract text
    try:
        if ext == ".pdf":
            text = extract_text_from_pdf(path)
        else:
            text = extract_text_from_docx(path)
    finally:
        os.remove(path)

    if not text.strip():
        raise HTTPException(status_code=400, detail="No text extracted from resume")

    # Process with LLM
    client = OpenAI(
        base_url="https://api.groq.com/openai/v1",
        api_key=os.getenv("GROQ_API_KEY"),
    )

    chunks = chunk_text(text)
    summary = "\n\n".join([summarize(client, c, i) for i, c in enumerate(chunks)])

    result = generate_code_from_summary(client, summary)
    return JSONResponse(content=result)


@app.get("/")
def root():
    return {"message": "Resume to Portfolio API is running."}
