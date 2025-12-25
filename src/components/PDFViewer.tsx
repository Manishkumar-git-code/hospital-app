'use client';

import { useState } from 'react';

interface PDFViewerProps {
  fileName: string;
  onClose: () => void;
  autoDeleteTime?: number; // in seconds
}

export default function PDFViewer({ fileName, onClose, autoDeleteTime = 330 }: PDFViewerProps) {
  const [timeLeft] = useState(autoDeleteTime);
  const [showWarning] = useState(timeLeft <= 60);

  // Handle right-click protection
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    return false;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onContextMenu={handleContextMenu}>
      <div className="bg-white rounded-lg shadow-2xl w-full h-full max-w-4xl max-h-screen overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gray-800 text-white px-6 py-4 flex justify-between items-center">
          <h2 className="font-bold">📄 {fileName}</h2>
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-white text-2xl"
          >
            ✕
          </button>
        </div>

        {/* Auto-Delete Warning */}
        {showWarning && (
          <div className="bg-yellow-100 border-b-2 border-yellow-400 px-6 py-3 text-yellow-800 text-sm font-semibold flex items-center gap-2">
            <span>⏱️ This document will auto-delete in {formatTime(timeLeft)}</span>
          </div>
        )}

        {/* PDF Content Area */}
        <div className="flex-1 bg-gray-100 p-6 flex items-center justify-center overflow-auto" onContextMenu={handleContextMenu}>
          <div className="text-center text-gray-600">
            <div className="text-6xl mb-4">📑</div>
            <p className="text-lg font-semibold mb-2">PDF Viewer</p>
            <p className="text-sm text-gray-500">
              Right-click is disabled for security.<br />
              PDF content would be rendered here in production.
            </p>
            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-blue-700">
                ⓘ Integration with react-pdf and backend PDF storage coming soon
              </p>
            </div>
          </div>
        </div>

        {/* Toolbar (Hidden/Disabled) */}
        <div className="bg-gray-200 px-6 py-3 border-t text-xs text-gray-600 flex justify-between items-center">
          <span>Download, Print, and toolbar are disabled for security</span>
          <button
            onClick={onClose}
            className="bg-gray-800 text-white px-4 py-1 rounded hover:bg-gray-900 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
