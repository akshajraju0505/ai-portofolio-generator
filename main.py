from fastapi import FastAPI, File, UploadFile, HTTPException
import os
import pdfplumber
import docx
import logging
from openai import OpenAI
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from deployer import deploy_html_code

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

load_dotenv()

class DeployRequest(BaseModel):
    html_code: str
    css_code: str
    js_code: str

@app.post("/deploy-site/")
async def deploy_site(data: DeployRequest):
    try:
        url = deploy_html_code(data.html_code, data.css_code, data.js_code)
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def chunk_text(text, max_chunk_size=2000):
    words = text.split()
    chunks, current = [], ""
    for word in words:
        if len(current) + len(word) + 1 > max_chunk_size:
            chunks.append(current)
            current = word
        else:
            current += " " + word if current else word
    if current:
        chunks.append(current)
    return chunks

def summarize_chunk(client, chunk, index):
    prompt = f"Summarize part {index+1} of a resume:\n\n{chunk}\n\nFocus on About, Skills, Work, and Projects."
    response = client.chat.completions.create(
        model="llama3-8b-8192",
        messages=[
            {"role": "system", "content": "You are a personal branding assistant."},
            {"role": "user", "content": prompt},
        ],
    )
    return response.choices[0].message.content.strip()

def generate_portfolio_content(resume_text: str) -> dict:
    if not resume_text.strip():
        return {"success": False, "error": "Empty resume", "error_type": "validation_error"}

    try:
        client = OpenAI(
            base_url="https://api.groq.com/openai/v1",
            api_key=os.getenv("GROQ_API_KEY"),
        )
        chunks = chunk_text(resume_text)
        summaries = [summarize_chunk(client, chunk, idx) for idx, chunk in enumerate(chunks)]
        combined_summary = "\n\n".join(summaries)

        final_prompt = f"""
You are a portfolio website generator AI.

Using the resume summary below, generate a professional portfolio with 3 separate files: index.html, style.css, and script.js.

Requirements:
- HTML must use semantic structure and link to external style.css and script.js
- CSS should use modern Tailwind-style or clean responsive styling
- JS (if needed) should include smooth scroll or navbar logic
- Include sections: About Me, Skills, Work Experience, Projects

Only return JSON in this format (no explanation):

{{
  "html_code": "<!DOCTYPE html>...</html>",
  "css_code": "body {{...}}",
  "js_code": "console.log('...')"
}}

Resume Summary:
{combined_summary}
        """

        response = client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[
                {"role": "system", "content": "You are a helpful portfolio generator bot."},
                {"role": "user", "content": final_prompt},
            ],
        )

        content = response.choices[0].message.content.strip()
        import json
        return json.loads(content)

    except Exception as e:
        return {"success": False, "error": str(e), "error_type": "groq_api_error"}

@app.get("/")
def read_root():
    return {"message": "Hello! Your backend is running."}

def extract_text_from_pdf(file_path: str) -> str:
    text = ""
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            text += page.extract_text() or ""
    return text

def extract_text_from_docx(file_path: str) -> str:
    text = ""
    doc = docx.Document(file_path)
    for para in doc.paragraphs:
        text += para.text + "\n"
    return text

@app.post("/upload-resume/")
async def upload_resume(file: UploadFile = File(...)):
    if not file.filename.endswith((".pdf", ".docx")):
        raise HTTPException(status_code=400, detail="Only PDF or DOCX allowed.")

    os.makedirs("temp_files", exist_ok=True)
    file_path = f"temp_files/{file.filename}"
    with open(file_path, "wb") as f:
        f.write(await file.read())

    if file.filename.endswith(".pdf"):
        resume_text = extract_text_from_pdf(file_path)
    else:
        resume_text = extract_text_from_docx(file_path)

    os.remove(file_path)
    portfolio = generate_portfolio_content(resume_text)

    if not isinstance(portfolio, dict) or "html_code" not in portfolio:
        raise HTTPException(status_code=500, detail=portfolio.get("error", "Failed to generate portfolio"))

    return portfolio
