import React from 'react';

interface DocumentItemProps {
  title: string;
  value?: string;
  onSelect: () => void;
  uploaded?: boolean;
}

const DocumentItem: React.FC<DocumentItemProps> = ({ title, value, onSelect, uploaded = false }) => {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <span className="text-sm text-gray-700">{title}</span>
      <div className="flex items-center gap-2">
        {uploaded ? (
          <span className="text-green-600 text-sm">Uploaded ✅</span>
        ) : (
          <span className="text-gray-400 text-sm">Not Uploaded</span>
        )}
        <button
          onClick={onSelect}
          className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
        >
          Select from Vault
        </button>
      </div>
    </div>
  );
};

export default DocumentItem;
