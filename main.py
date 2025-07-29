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
import re
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
    try:
        resp = client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=500
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Error in summarize: {str(e)}")
        return f"Summary of resume section {i+1}: {chunk[:200]}..."

def safe_parse_llm_json(text: str):
    """Improved JSON parsing with better error handling and cleaning"""
    if not text or not text.strip():
        raise HTTPException(status_code=500, detail="Empty response from AI model")
    
    # Log the raw response for debugging
    logger.info(f"Raw LLM response: {text[:500]}...")
    
    # Remove code block wrapper if present
    cleaned_text = text.strip()
    if cleaned_text.startswith("```"):
        # Find the first occurrence of ``` and the last
        start_idx = cleaned_text.find("```")
        if start_idx != -1:
            # Skip the first ``` line
            newline_after_first = cleaned_text.find("\n", start_idx)
            if newline_after_first != -1:
                cleaned_text = cleaned_text[newline_after_first + 1:]
            
            # Remove trailing ```
            if cleaned_text.endswith("```"):
                cleaned_text = cleaned_text[:-3].strip()
    
    # Try to find JSON object within the text
    json_start = cleaned_text.find("{")
    json_end = cleaned_text.rfind("}") + 1
    
    if json_start != -1 and json_end > json_start:
        cleaned_text = cleaned_text[json_start:json_end]
    
    # Replace single quotes with double quotes (common LLM mistake)
    # But be careful not to replace quotes inside strings
    if "'" in cleaned_text and '"' not in cleaned_text:
        cleaned_text = cleaned_text.replace("'", '"')
    
    try:
        parsed_json = json.loads(cleaned_text)
        
        # Validate required fields
        required_fields = ["html_code", "css_code", "js_code"]
        for field in required_fields:
            if field not in parsed_json:
                parsed_json[field] = get_default_code(field)
        
        return parsed_json
        
    except json.JSONDecodeError as e:
        logger.error(f"JSON parsing failed: {str(e)}")
        logger.error(f"Cleaned text: {cleaned_text}")
        
        # Return default structure if parsing fails
        return get_fallback_portfolio()

def get_default_code(field_type: str) -> str:
    """Get default code for each file type"""
    defaults = {
        "html_code": '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Portfolio</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="container">
        <h1>Portfolio</h1>
        <p>Generated from resume</p>
    </div>
    <script src="script.js"></script>
</body>
</html>''',
        "css_code": '''* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: Arial, sans-serif;
    line-height: 1.6;
    color: #333;
    background-color: #f4f4f4;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    background: white;
    border-radius: 10px;
    box-shadow: 0 0 10px rgba(0,0,0,0.1);
}''',
        "js_code": '''console.log("Portfolio loaded successfully");

document.addEventListener("DOMContentLoaded", function() {
    console.log("DOM loaded");
});'''
    }
    return defaults.get(field_type, "// Default code")

def get_fallback_portfolio() -> dict:
    """Return a basic portfolio structure when AI fails"""
    return {
        "html_code": get_default_code("html_code"),
        "css_code": get_default_code("css_code"),
        "js_code": get_default_code("js_code")
    }

def generate_code_from_summary(client, summary):
    """Improved code generation with better prompts and error handling"""
    prompt = f"""
Create a professional portfolio website based on this resume summary. Return ONLY a valid JSON object with exactly this structure:

{{
  "html_code": "complete HTML code here",
  "css_code": "complete CSS code here", 
  "js_code": "complete JavaScript code here"
}}

Requirements:
- HTML must be complete with DOCTYPE, head, body
- Link CSS as: <link rel="stylesheet" href="style.css">
- Link JS as: <script src="script.js"></script>
- Use modern, professional styling
- Make it responsive
- Include sections for: About, Skills, Experience, Projects
- NO markdown, NO explanations, ONLY the JSON object

Resume Summary:
{summary}
"""

    max_retries = 3
    for attempt in range(max_retries):
        try:
            logger.info(f"Attempt {attempt + 1} to generate code")
            
            resp = client.chat.completions.create(
                model="llama3-8b-8192",
                messages=[
                    {"role": "system", "content": "You are a web developer. Return only valid JSON with no additional text."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,  # Lower temperature for more consistent output
                max_tokens=3000
            )

            response_text = resp.choices[0].message.content.strip()
            
            if not response_text:
                logger.warning(f"Empty response on attempt {attempt + 1}")
                continue
                
            return safe_parse_llm_json(response_text)
            
        except Exception as e:
            logger.error(f"Attempt {attempt + 1} failed: {str(e)}")
            if attempt == max_retries - 1:
                logger.error("All attempts failed, returning fallback portfolio")
                return get_fallback_portfolio()
            continue

@app.post("/upload-resume/")
async def upload_resume(file: UploadFile = File(...)):
    try:
        ext = os.path.splitext(file.filename)[-1].lower()
        if ext not in [".pdf", ".docx"]:
            raise HTTPException(status_code=400, detail="Only PDF and DOCX are allowed")

        # Save temp file
        os.makedirs("temp_files", exist_ok=True)
        path = f"temp_files/{file.filename}"
        
        try:
            with open(path, "wb") as f:
                content = await file.read()
                f.write(content)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

        # Extract text
        try:
            if ext == ".pdf":
                text = extract_text_from_pdf(path)
            else:
                text = extract_text_from_docx(path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to extract text: {str(e)}")
        finally:
            # Clean up temp file
            if os.path.exists(path):
                os.remove(path)

        if not text.strip():
            raise HTTPException(status_code=400, detail="No text extracted from resume")

        # Process with LLM
        try:
            client = OpenAI(
                base_url="https://api.groq.com/openai/v1",
                api_key=os.getenv("GROQ_API_KEY"),
            )
            
            if not os.getenv("GROQ_API_KEY"):
                raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured")

            chunks = chunk_text(text)
            logger.info(f"Processing {len(chunks)} chunks")
            
            summaries = []
            for i, chunk in enumerate(chunks):
                summary = summarize(client, chunk, i)
                summaries.append(summary)
            
            combined_summary = "\n\n".join(summaries)
            logger.info(f"Generated summary length: {len(combined_summary)}")

            result = generate_code_from_summary(client, combined_summary)
            return JSONResponse(content=result)
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"LLM processing error: {str(e)}")
            # Return fallback portfolio instead of failing
            result = get_fallback_portfolio()
            return JSONResponse(content=result)
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")

@app.get("/")
def root():
    return {"message": "Resume to Portfolio API is running."}

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "groq_key_configured": bool(os.getenv("GROQ_API_KEY"))
    }