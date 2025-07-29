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

  useEffect(() => {
    checkBackendHealth();
  }, []);

  const checkBackendHealth = async () => {
    try {
      const res = await fetch(`${backendUrl}/health`);
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
    } catch {
      setBackendHealth({ status: 'unreachable' });
      setError('Cannot connect to backend service. Please check if the server is running.');
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) validateAndSetFile(selectedFile);
  };

  const validateAndSetFile = (selectedFile) => {
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const ext = '.' + selectedFile.name.split('.').pop().toLowerCase();
    if (allowedTypes.includes(selectedFile.type) || ['.pdf', '.docx'].includes(ext)) {
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
    if (droppedFile) validateAndSetFile(droppedFile);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return setError('Please select a file.');
    if (backendHealth?.status !== 'healthy') {
      return setError('Backend is not available. Please try again later.');
    }

    const formData = new FormData();
    formData.append('file', file);

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const res = await fetch(`${backendUrl}/upload-resume/`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const text = await res.text();
      const data = JSON.parse(text);

      if (!res.ok) throw new Error(data.detail || `Server error: ${res.status}`);

      if (!data.html_code && !data.css_code && !data.js_code) {
        throw new Error('No code was generated.');
      }

      setHtmlCode(data.html_code || '<!-- No HTML generated -->');
      setCssCode(data.css_code || '/* No CSS generated */');
      setJsCode(data.js_code || '// No JS generated */');
      setShowEditor(true);
      setSuccess('Portfolio generated successfully!');
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Request timed out.');
      } else {
        setError(err.message || 'Upload failed.');
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
        body: JSON.stringify({ html_code: htmlCode, css_code: cssCode, js_code: jsCode }),
      });

      const text = await res.text();
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.detail || 'Deployment failed.');
      setDeployedUrl(data.url);
      setSuccess('Site deployed successfully!');
    } catch (err) {
      setError(err.message || 'Deployment failed.');
    } finally {
      setDeploying(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!htmlCode || !cssCode) return setError('No code to download.');
    const zip = new JSZip();
    zip.file('index.html', htmlCode);
    zip.file('style.css', cssCode);
    zip.file('script.js', jsCode);
    zip.file('README.md', `Generated on ${new Date().toLocaleString()}`);
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `portfolio-${Date.now()}.zip`);
  };

  const getCurrentCode = () => (activeTab === 'html' ? htmlCode : activeTab === 'css' ? cssCode : jsCode);
  const setCurrentCode = (v) => {
    if (activeTab === 'html') setHtmlCode(v || '');
    else if (activeTab === 'css') setCssCode(v || '');
    else setJsCode(v || '');
  };
  const getLanguageForTab = (tab) =>
    tab === 'html' ? 'html' : tab === 'css' ? 'css' : 'javascript';

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center px-4 py-8">
      <div className="w-full max-w-screen-xl bg-white p-6 rounded-lg shadow-md">
        <h1 className="text-3xl font-bold mb-2 text-center text-gray-800">
          AI Resume to Portfolio Generator
        </h1>
        <p className="text-center text-gray-600 mb-6">
          Transform your resume into a professional portfolio website
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="file"
            accept=".pdf,.docx"
            onChange={handleFileChange}
            className="block w-full"
          />
          {file && (
            <p className="text-sm text-blue-700 mt-1">Selected: {file.name}</p>
          )}
          <button
            type="submit"
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            disabled={loading || !file}
          >
            {loading ? 'Processing...' : 'Generate Portfolio'}
          </button>
        </form>

        {error && <p className="mt-4 text-red-600">{error}</p>}
        {success && <p className="mt-4 text-green-600">{success}</p>}

        {/* Editor + Live Preview */}
        {showEditor && (
          <div className="mt-10">
            {/* Tabs */}
            <div className="flex gap-2 mb-4">
              {['html', 'css', 'js'].map((tab) => (
                <button
                  key={tab}
                  className={`py-2 px-4 rounded font-semibold text-sm ${
                    activeTab === tab
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                  }`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab.toUpperCase()}
                </button>
              ))}
              <button
                className="ml-auto bg-yellow-500 text-white py-2 px-4 rounded hover:bg-yellow-600"
                onClick={handleDownloadZip}
              >
                📥 Download ZIP
              </button>
            </div>

            {/* Grid Layout */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Editor */}
              <div className="border rounded-lg overflow-hidden h-[600px] shadow-md">
                <div className="bg-gray-800 text-white px-4 py-2 text-sm font-semibold">
                  {activeTab.toUpperCase()} Editor
                </div>
                <Editor
                  height="100%"
                  language={getLanguageForTab(activeTab)}
                  value={getCurrentCode()}
                  onChange={(value) => setCurrentCode(value || '')}
                  theme="vs-dark"
                  options={{
                    fontSize: 16,
                    wordWrap: 'on',
                    minimap: { enabled: false },
                    automaticLayout: true,
                    lineNumbers: 'on',
                  }}
                />
              </div>

              {/* Preview */}
              <div className="border rounded-lg overflow-hidden h-[600px] bg-white shadow-md">
                <div className="bg-gray-100 text-gray-700 px-4 py-2 text-sm font-semibold border-b">
                  Live Preview
                </div>
                <iframe
                  title="Live Preview"
                  srcDoc={`<html><head><style>${cssCode}</style></head><body>${htmlCode}<script>${jsCode}</script></body></html>`}
                  className="w-full h-full"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </div>

            {/* Deploy */}
            <div className="mt-8 text-center">
              <button
                className="bg-green-600 text-white py-3 px-8 rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                onClick={handleDeploy}
                disabled={deploying}
              >
                {deploying ? '🚀 Deploying...' : '🚀 Deploy Portfolio'}
              </button>
            </div>

            {deployedUrl && (
              <div className="mt-4 text-center text-green-700">
                ✅ Deployed at:{' '}
                <a
                  href={deployedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-blue-600"
                >
                  {deployedUrl}
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
