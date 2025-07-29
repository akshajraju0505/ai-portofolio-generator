import React, { useState, useEffect } from 'react';
import { Editor } from '@monaco-editor/react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
} from 'react-resizable-panels';

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

  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

  useEffect(() => {
    fetch(`${backendUrl}/health`)
      .then((res) => res.json())
      .then(setBackendHealth)
      .catch(() => setBackendHealth({ status: 'unreachable' }));
  }, []);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const ext = selected.name.toLowerCase().split('.').pop();
    if (validTypes.includes(selected.type) || ['pdf', 'docx'].includes(ext)) {
      setFile(selected);
      setError('');
      setSuccess(`Selected: ${selected.name}`);
      setHtmlCode('');
      setCssCode('');
      setJsCode('');
      setShowEditor(false);
    } else {
      setError('Only PDF and DOCX files are supported.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return setError('Please upload a resume first.');
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${backendUrl}/upload-resume/`, {
        method: 'POST',
        body: formData,
      });
      const text = await res.text();
      const data = JSON.parse(text);

      if (!res.ok) throw new Error(data.detail || 'Upload failed');

      setHtmlCode(data.html_code || '');
      setCssCode(data.css_code || '');
      setJsCode(data.js_code || '');
      setShowEditor(true);
      setSuccess('Portfolio generated!');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadZip = async () => {
    const zip = new JSZip();
    zip.file('index.html', htmlCode);
    zip.file('style.css', cssCode);
    zip.file('script.js', jsCode);
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `portfolio-${Date.now()}.zip`);
  };

  const handleDeploy = async () => {
    setDeploying(true);
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
      setSuccess('Deployment successful!');
    } catch (err) {
      setError(err.message);
    } finally {
      setDeploying(false);
    }
  };

  const getCurrentCode = () => (activeTab === 'html' ? htmlCode : activeTab === 'css' ? cssCode : jsCode);
  const setCurrentCode = (val) => {
    if (activeTab === 'html') setHtmlCode(val || '');
    else if (activeTab === 'css') setCssCode(val || '');
    else setJsCode(val || '');
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-screen-xl mx-auto bg-white p-6 rounded shadow-lg">
        <h1 className="text-3xl font-bold text-center mb-4">AI Resume to Portfolio Generator</h1>
        <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-4 items-center justify-between mb-6">
          <input type="file" accept=".pdf,.docx" onChange={handleFileChange} />
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          >
            {loading ? 'Processing...' : 'Generate Portfolio'}
          </button>
        </form>

        {error && <p className="text-red-600 mb-2">{error}</p>}
        {success && <p className="text-green-600 mb-2">{success}</p>}

        {showEditor && (
          <>
            {/* Tabs */}
            <div className="flex gap-2 mb-4">
              {['html', 'css', 'js'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded ${
                    activeTab === tab ? 'bg-blue-600 text-white' : 'bg-gray-200'
                  }`}
                >
                  {tab.toUpperCase()}
                </button>
              ))}
              <button
                onClick={handleDownloadZip}
                className="ml-auto bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
              >
                📥 Download ZIP
              </button>
            </div>

            {/* Resizable Panels */}
            <div className="h-[600px] border rounded-lg overflow-hidden">
              <PanelGroup direction="horizontal">
                <Panel defaultSize={60}>
                  <Editor
                    height="100%"
                    language={activeTab === 'html' ? 'html' : activeTab === 'css' ? 'css' : 'javascript'}
                    value={getCurrentCode()}
                    onChange={(value) => setCurrentCode(value || '')}
                    theme="vs-dark"
                    options={{
                      fontSize: 16,
                      minimap: { enabled: false },
                      automaticLayout: true,
                    }}
                  />
                </Panel>
                <PanelResizeHandle className="w-2 bg-gray-200 cursor-col-resize" />
                <Panel defaultSize={40}>
                  <iframe
                    title="Live Preview"
                    className="w-full h-full border-none"
                    sandbox="allow-scripts allow-same-origin"
                    srcDoc={`<html><head><style>${cssCode}</style></head><body>${htmlCode}<script>${jsCode}</script></body></html>`}
                  />
                </Panel>
              </PanelGroup>
            </div>

            {/* Deploy */}
            <div className="mt-6 text-center">
              <button
                className="bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700"
                onClick={handleDeploy}
                disabled={deploying}
              >
                {deploying ? '🚀 Deploying...' : '🚀 Deploy Portfolio'}
              </button>
              {deployedUrl && (
                <p className="mt-2 text-green-700">
                  ✅ Deployed at:{' '}
                  <a href={deployedUrl} target="_blank" rel="noopener noreferrer" className="underline text-blue-600">
                    {deployedUrl}
                  </a>
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
