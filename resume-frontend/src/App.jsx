import React, { useState, useRef } from 'react';
import { Editor } from '@monaco-editor/react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

function App() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [htmlCode, setHtmlCode] = useState('');
  const [cssCode, setCssCode] = useState('');
  const [jsCode, setJsCode] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployedUrl, setDeployedUrl] = useState('');
  const [activeTab, setActiveTab] = useState('html');
  const dropRef = useRef(null);

  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      resetState();
    }
  };

  const resetState = () => {
    setError('');
    setHtmlCode('');
    setCssCode('');
    setJsCode('');
    setShowEditor(false);
    setDeployedUrl('');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.type === 'application/pdf' || droppedFile.name.endsWith('.docx'))) {
      setFile(droppedFile);
      resetState();
    } else {
      setError('Only PDF or DOCX files are supported.');
    }
  };

  const handleDragOver = (e) => e.preventDefault();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return setError('Please select a file.');

    const formData = new FormData();
    formData.append('file', file);

    setLoading(true);
    resetState();

    try {
      const res = await fetch(`${backendUrl}/upload-resume/`, {
        method: 'POST',
        body: formData,
      });

      const text = await res.text(); // safer than .json() in case of error
      const data = JSON.parse(text);

      if (!res.ok) {
        throw new Error(data.detail || 'Something went wrong');
      }

      setHtmlCode(data.html_code || '<!-- No HTML generated -->');
      setCssCode(data.css_code || '/* No CSS generated */');
      setJsCode(data.js_code || '// No JS generated');
      setShowEditor(true);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to connect to backend.');
    }

    setLoading(false);
  };

  const handleDeploy = async () => {
    setDeploying(true);
    setDeployedUrl('');
    setError('');

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

      const text = await res.text();
      const data = JSON.parse(text);

      if (!res.ok) {
        throw new Error(data.detail || 'Deployment failed');
      }

      setDeployedUrl(data.url);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to deploy.');
    }

    setDeploying(false);
  };

  const handleDownloadZip = async () => {
    const zip = new JSZip();
    zip.file('index.html', htmlCode);
    zip.file('style.css', cssCode);
    zip.file('script.js', jsCode);

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'portfolio.zip');
  };

  const getCurrentCode = () => {
    return activeTab === 'html' ? htmlCode : activeTab === 'css' ? cssCode : jsCode;
  };

  const setCurrentCode = (value) => {
    if (activeTab === 'html') setHtmlCode(value);
    else if (activeTab === 'css') setCssCode(value);
    else setJsCode(value);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-[1440px]">
        <h1 className="text-2xl font-bold mb-4 text-center">AI Resume to Portfolio Generator</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div
            ref={dropRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="w-full border-2 border-dashed border-gray-400 rounded p-6 text-center text-gray-500 hover:border-blue-600"
          >
            <p>Drag and drop your resume here or click below</p>
            <input
              type="file"
              accept=".pdf,.docx"
              onChange={handleFileChange}
              className="block w-full mt-2"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition"
            disabled={loading}
          >
            {loading ? 'Uploading & Processing...' : 'Generate Portfolio'}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-2 bg-red-100 text-red-700 rounded">{error}</div>
        )}

        {showEditor && (
          <>
            <div className="mt-6 flex gap-4">
              {['html', 'css', 'js'].map((tab) => (
                <button
                  key={tab}
                  className={`py-1 px-3 rounded ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab.toUpperCase()}
                </button>
              ))}
              <button
                className="ml-auto bg-yellow-500 text-white py-1 px-3 rounded hover:bg-yellow-600"
                onClick={handleDownloadZip}
              >
                Download as ZIP
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="border rounded overflow-hidden h-[600px]">
                <Editor
                  height="100%"
                  defaultLanguage={activeTab}
                  value={getCurrentCode()}
                  onChange={(value) => setCurrentCode(value || '')}
                  theme="vs-dark"
                  loading={<div className="text-center p-4">Loading editor...</div>}
                />
              </div>
              <div className="border rounded overflow-hidden h-[600px] bg-white">
                <iframe
                  title="Live Preview"
                  srcDoc={`<html><head><style>${cssCode}</style></head><body>${htmlCode}<script>${jsCode}</script></body></html>`}
                  className="w-full h-full border-none"
                />
              </div>
            </div>

            <div className="mt-6 text-center">
              <button
                className="bg-green-600 text-white py-2 px-6 rounded hover:bg-green-700 transition"
                onClick={handleDeploy}
                disabled={deploying}
              >
                {deploying ? 'Deploying...' : 'Approve and Deploy'}
              </button>
            </div>

            {deployedUrl && (
              <div className="mt-4 p-3 bg-green-100 text-green-800 rounded text-center">
                ✅ Site deployed at:{' '}
                <a
                  href={deployedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  {deployedUrl}
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
