import React, { useState } from 'react';
import.meta.env.VITE_BACKEND_URL

function App() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setResponse('');
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!file) {
      setError('Please select a file first.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setLoading(true);
    setError('');
    setResponse('');

    try {
      const res = await fetch("https://resume-backend-n71l.onrender.com/upload-resume/", {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || 'Something went wrong');
      } else {
        setResponse(data.generated_content);
      }
    } catch (err) {
      setError('Failed to connect to backend.');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-xl">
        <h1 className="text-2xl font-bold mb-4 text-center">AI Resume to Portfolio Generator</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="file"
            accept=".pdf,.docx"
            onChange={handleFileChange}
            className="block w-full p-2 border rounded"
          />
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition"
          >
            {loading ? 'Uploading & Processing...' : 'Generate Portfolio'}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-2 bg-red-100 text-red-700 rounded">{error}</div>
        )}

        {response && (
          <div className="mt-6 p-4 bg-green-50 border border-green-300 rounded">
            <h2 className="text-lg font-semibold mb-2">Generated Portfolio Content:</h2>
            <pre className="whitespace-pre-wrap text-sm text-gray-800">{response}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
