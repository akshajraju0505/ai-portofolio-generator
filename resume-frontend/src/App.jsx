import React, { useState, useRef, useEffect } from 'react';
import { Editor } from '@monaco-editor/react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

function App() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [htmlCode, setHtmlCode] = useState('');
  const [cssCode, setCssCode] = useState('');
  const [jsCode, setJsCode] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployedUrl, setDeployedUrl] = useState('');
  const [activeTab, setActiveTab] = useState('html');
  const [backendHealth, setBackendHealth] = useState(null);
  const dropRef = useRef(null);

  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

  // Check backend health on component mount
  useEffect(() => {
    checkBackendHealth();
  }, []);

  const checkBackendHealth = async () => {
    try {
      const res = await fetch(`${backendUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (res.ok) {
        const data = await res.json();
        setBackendHealth(data);
        if (!data.groq_key_configured) {
          setError('Warning: GROQ API key not configured in backend');
        }
      } else {
        setBackendHealth({ status: 'unhealthy' });
        setError('Backend service is not responding properly');
      }
    } catch (err) {
      setBackendHealth({ status: 'unreachable' });
      setError('Cannot connect to backend service. Please check if the server is running.');
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  const validateAndSetFile = (selectedFile) => {
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const allowedExtensions = ['.pdf', '.docx'];
    
    const fileExtension = '.' + selectedFile.name.split('.').pop().toLowerCase();
    
    if (allowedTypes.includes(selectedFile.type) || allowedExtensions.includes(fileExtension)) {
      setFile(selectedFile);
      resetEditorStates();
      setSuccess(`File "${selectedFile.name}" selected successfully`);
    } else {
      setError('Only PDF and DOCX files are supported.');
      setFile(null);
    }
  };

  const resetEditorStates = () => {
    setError('');
    setSuccess('');
    setHtmlCode('');
    setCssCode('');
    setJsCode('');
    setShowEditor(false);
    setDeployedUrl('');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file.');
      return;
    }

    // Check backend health before submitting
    if (backendHealth?.status !== 'healthy') {
      setError('Backend service is not available. Please try again later.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

      const res = await fetch(`${backendUrl}/upload-resume/`, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      let responseText;
      try {
        responseText = await res.text();
      } catch (err) {
        throw new Error('Failed to read server response');
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        console.error('Response parsing error:', parseErr);
        console.error('Raw response:', responseText);
        throw new Error('Invalid response format from server. Please try again.');
      }

      if (!res.ok) {
        throw new Error(data.detail || `Server error: ${res.status}`);
      }

      // Validate response structure
      if (!data.html_code && !data.css_code && !data.js_code) {
        throw new Error('No code was generated. Please try again.');
      }

      setHtmlCode(data.html_code || '<!-- No HTML generated -->');
      setCssCode(data.css_code || '/* No CSS generated */');
      setJsCode(data.js_code || '// No JS generated');
      setShowEditor(true);
      setSuccess('Portfolio generated successfully! You can now edit the code and preview it.');

    } catch (err) {
      console.error('Upload error:', err);
      
      if (err.name === 'AbortError') {
        setError('Request timed out. Please try again with a smaller file.');
      } else if (err.message.includes('Failed to fetch')) {
        setError('Connection failed. Please check your internet connection and try again.');
      } else {
        setError(err.message || 'Upload failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeploy = async () => {
    if (!htmlCode.trim() || !cssCode.trim()) {
      setError('Cannot deploy: HTML and CSS code are required.');
      return;
    }

    setDeploying(true);
    setDeployedUrl('');
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${backendUrl}/deploy-site/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html_code: htmlCode,
          css_code: cssCode,
          js_code: jsCode,
        }),
      });

      const responseText = await res.text();
      let data;

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error('Invalid response from deployment service.');
      }

      if (!res.ok) {
        throw new Error(data.detail || 'Deployment failed.');
      }

      setDeployedUrl(data.url);
      setSuccess('Site deployed successfully!');
    } catch (err) {
      console.error('Deployment error:', err);
      setError(err.message || 'Failed to deploy. Please try again.');
    } finally {
      setDeploying(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!htmlCode.trim() || !cssCode.trim()) {
      setError('Cannot download: No code available to download.');
      return;
    }

    try {
      const zip = new JSZip();
      zip.file('index.html', htmlCode);
      zip.file('style.css', cssCode);
      zip.file('script.js', jsCode);
      
      // Add a README file
      const readme = `# Portfolio Website

This portfolio was generated from your resume using AI.

## Files included:
- index.html: Main HTML structure
- style.css: Styling and layout
- script.js: Interactive functionality

## To use:
1. Extract all files to a folder
2. Open index.html in a web browser
3. Or upload to any web hosting service

Generated on: ${new Date().toLocaleString()}
`;
      zip.file('README.md', readme);

      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `portfolio-${Date.now()}.zip`);
      setSuccess('Portfolio downloaded successfully!');
    } catch (err) {
      console.error('Download error:', err);
      setError('Failed to create download. Please try again.');
    }
  };

  const getCurrentCode = () => {
    return activeTab === 'html' ? htmlCode : activeTab === 'css' ? cssCode : jsCode;
  };

  const setCurrentCode = (value) => {
    if (activeTab === 'html') setHtmlCode(value || '');
    else if (activeTab === 'css') setCssCode(value || '');
    else setJsCode(value || '');
  };

  const getLanguageForTab = (tab) => {
    const languages = {
      html: 'html',
      css: 'css',
      js: 'javascript'
    };
    return languages[tab] || 'plaintext';
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-[1440px]">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold mb-2 text-gray-800">AI Resume to Portfolio Generator</h1>
          <p className="text-gray-600">Transform your resume into a professional portfolio website</p>
          
          {/* Backend Status Indicator */}
          <div className="mt-3">
            {backendHealth?.status === 'healthy' && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                ✓ Connected
              </span>
            )}
            {backendHealth?.status === 'unhealthy' && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                ⚠ Service Issues
              </span>
            )}
            {backendHealth?.status === 'unreachable' && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                ✗ Disconnected
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div
            ref={dropRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            className="w-full border-2 border-dashed border-gray-400 rounded-lg p-6 text-center text-gray-500 hover:border-blue-600 transition-colors duration-200"
          >
            <div className="space-y-1">
              <svg className="mx-auto h-8 w-8 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-base">Drag and drop your resume here</p>
              <p className="text-xs text-gray-400">or click below to select</p>
            </div>
            
            <input
              type="file"
              accept=".pdf,.docx"
              onChange={handleFileChange}
              className="block w-full mt-3 text-sm text-gray-500 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            
            {file && (
              <div className="mt-3 p-2 bg-blue-50 rounded text-blue-700 text-sm">
                Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || !file || backendHealth?.status !== 'healthy'}
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing Resume...
              </span>
            ) : 'Generate Portfolio'}
          </button>
        </form>

        {/* Success Message */}
        {success && (
          <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-lg border border-green-200">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {success}
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg border border-red-200">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          </div>
        )}

        {showEditor && (
          <>
            <div className="mt-8 flex flex-wrap gap-4 items-center">
              <div className="flex gap-2">
                {['html', 'css', 'js'].map((tab) => (
                  <button
                    key={tab}
                    className={`py-2 px-4 rounded-lg font-medium transition-colors duration-200 ${
                      activeTab === tab 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>
              
              <button
                className="ml-auto bg-yellow-500 text-white py-2 px-4 rounded-lg hover:bg-yellow-600 transition-colors duration-200 font-medium"
                onClick={handleDownloadZip}
              >
                📥 Download ZIP
              </button>
            </div>

            <div className="mt-6 space-y-6">
              {/* Code Editor - Full Width Rectangle */}
              <div className="border rounded-lg overflow-hidden h-[500px]">
                <div className="bg-gray-800 text-white px-4 py-2 text-sm font-medium">
                  {activeTab.toUpperCase()} Editor
                </div>
                <Editor
                  height="calc(100% - 40px)"
                  language={getLanguageForTab(activeTab)}
                  value={getCurrentCode()}
                  onChange={(value) => setCurrentCode(value || '')}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 16,
                    wordWrap: 'on',
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 16, bottom: 16 }
                  }}
                  loading={
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                        <p className="text-gray-600">Loading editor...</p>
                      </div>
                    </div>
                  }
                />
              </div>

              {/* Live Preview - Smaller Rectangle */}
              <div className="border rounded-lg overflow-hidden h-[400px] bg-white">
                <div className="bg-gray-100 text-gray-700 px-4 py-2 text-sm font-medium border-b">
                  Live Preview
                </div>
                <iframe
                  title="Live Preview"
                  srcDoc={`<html><head><style>${cssCode}</style></head><body>${htmlCode}<script>${jsCode}</script></body></html>`}
                  className="w-full h-[calc(100%-40px)] border-none"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </div>

            <div className="mt-8 text-center">
              <button
                className="bg-green-600 text-white py-3 px-8 rounded-lg hover:bg-green-700 transition-colors duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleDeploy}
                disabled={deploying}
              >
                {deploying ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Deploying...
                  </span>
                ) : '🚀 Deploy Portfolio'}
              </button>
            </div>

            {deployedUrl && (
              <div className="mt-6 p-4 bg-green-100 text-green-800 rounded-lg border border-green-200 text-center">
                <div className="flex items-center justify-center mb-2">
                  <svg className="h-6 w-6 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-semibold">Portfolio Successfully Deployed!</span>
                </div>
                <a
                  href={deployedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium underline"
                >
                  {deployedUrl}
                  <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;