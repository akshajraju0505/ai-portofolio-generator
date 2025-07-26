from fastapi import FastAPI, File, UploadFile, HTTPException
import os
import pdfplumber
import docx
import logging
from openai import OpenAI
import requests
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

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

def generate_protfolio_content(resume_text: str) -> dict:
    if not resume_text or not resume_text.strip():
        return {
            "success": False,
            "error": "Empty or invalid resume text provided",
            "error_type": "validation_error"
        }

    if len(resume_text.strip()) < 50:
        return {
            "success": False,
            "error": "Resume text too short (minimum 50 characters required)",
            "error_type": "validation_error"
        }

    prompt = f"""
    You are a personal branding assistant. Based on this resume text, generate:
    1. A short "About Me" paragraph (2 to 3 sentences)
    2. A bullet list of Skills
    3. A Work Experience summary
    4. 1 to 2 sample Project Descriptions

    Resume Text:
    {resume_text[:3000]}
    """

    try:
        client = OpenAI(
            base_url="https://api.groq.com/openai/v1",
            api_key=os.getenv("GROQ_API_KEY"),
        )

        response = client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[
                {"role": "system", "content": "You are a personal branding assistant."},
                {"role": "user", "content": prompt},
            ],
        )

        generated_text = response.choices[0].message.content

        return {
            "success": True,
            "content": generated_text  # ✅ fixed this line
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "error_type": "groq_api_error"
        }


@app.get("/")
def read_root():
    return {"message": "Hello! Your backend is working"}


def extract_text_from_pdf(file_path:str) -> str:
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
        raise HTTPException(status_code=400, detail="Only PDF or DOCX files are allowed")

    os.makedirs("temp_files", exist_ok=True)

    file_location = f"temp_files/{file.filename}"
    with open(file_location, "wb") as f:
        f.write(await file.read())

    if file.filename.endswith(".pdf"):
        extracted_text = extract_text_from_pdf(file_location)
    else:
        extracted_text = extract_text_from_docx(file_location)

    portfolio = generate_protfolio_content(extracted_text)

    if not portfolio["success"]:
        raise HTTPException(status_code=400, detail=portfolio["error"])

    return {
        "filename": file.filename,
        "message": "Resume uploaded successfully and processed with LLaMA",
        "generated_content": portfolio["content"]
    }