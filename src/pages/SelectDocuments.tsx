import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, FileText, Check, Search } from 'lucide-react';
import Header from '../components/Header';
import type { Portfolio } from '../types/Portfolio';

interface VaultDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string;
  uploadedAt: string;
}

const SelectDocuments = () => {
  const navigate = useNavigate();
  const { portfolioId } = useParams<{ portfolioId: string }>();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [vaultDocuments, setVaultDocuments] = useState<VaultDocument[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);

  useEffect(() => {
    // Load portfolio from localStorage
    const portfolios = JSON.parse(localStorage.getItem('portfolios') || '[]');
    const foundPortfolio = portfolios.find((p: Portfolio) => p.id === portfolioId);
    
    if (foundPortfolio) {
      setPortfolio(foundPortfolio);
    } else {
      navigate('/portfolios');
    }

    // Load vault documents
    const documents = JSON.parse(localStorage.getItem('vaultFiles') || '[]');
    setVaultDocuments(documents);
  }, [portfolioId, navigate]);

  const handleDocumentToggle = (documentId: string) => {
    setSelectedDocuments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(documentId)) {
        newSet.delete(documentId);
      } else {
        newSet.add(documentId);
      }
      return newSet;
    });
  };

  const handleSelectAllInSection = () => {
    if (!portfolio) return;
    
    const section = portfolio.sections[currentSectionIndex];
    const sectionDocumentIds = new Set(section.documents);
    
    setSelectedDocuments(prev => {
      const newSet = new Set(prev);
      sectionDocumentIds.forEach(docId => newSet.add(docId));
      return newSet;
    });
  };

  const handleDeselectAllInSection = () => {
    if (!portfolio) return;
    
    const section = portfolio.sections[currentSectionIndex];
    const sectionDocumentIds = new Set(section.documents);
    
    setSelectedDocuments(prev => {
      const newSet = new Set(prev);
      sectionDocumentIds.forEach(docId => newSet.delete(docId));
      return newSet;
    });
  };

  const handleSaveDocuments = () => {
    if (!portfolio || selectedDocuments.size === 0) {
      alert('Please select at least one document');
      return;
    }

    // Update portfolio with selected documents
    const updatedSections = portfolio.sections.map((section, index) => {
      if (index === currentSectionIndex) {
        return {
          ...section,
          documents: Array.from(selectedDocuments)
        };
      }
      return section;
    });

    const updatedPortfolio = {
      ...portfolio,
      sections: updatedSections,
      updatedAt: new Date().toISOString()
    };

    // Save to localStorage
    const portfolios = JSON.parse(localStorage.getItem('portfolios') || '[]');
    const updatedPortfolios = portfolios.map((p: Portfolio) => 
      p.id === portfolioId ? updatedPortfolio : p
    );
    localStorage.setItem('portfolios', JSON.stringify(updatedPortfolios));

    setPortfolio(updatedPortfolio);
    alert('Documents saved successfully!');
    navigate(`/portfolio/${portfolioId}`);
  };

  const getFilteredDocuments = () => {
    if (!searchQuery) return vaultDocuments;
    
    return vaultDocuments.filter(doc =>
      doc.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const getDocumentIcon = (type: string) => {
    if (type.includes('pdf')) return '📄';
    if (type.includes('image')) return '🖼️';
    if (type.includes('video')) return '🎥';
    return '📄';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!portfolio) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-200"></div>
          <p className="mt-4 text-gray-600">Loading portfolio...</p>
        </div>
      </div>
    );
  }

  const currentSection = portfolio.sections[currentSectionIndex];
  const sectionDocumentIds = new Set(currentSection.documents);
  const selectedCountInSection = Array.from(selectedDocuments).filter(docId => sectionDocumentIds.has(docId)).length;
  const totalCountInSection = currentSection.documents.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showWelcome={false} />
      
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Select Documents</h1>
          <span className="text-sm text-gray-600">{portfolio.name}</span>
        </div>

        {/* Section Tabs */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-6">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {portfolio.sections.map((section, index) => (
              <button
                key={index}
                onClick={() => setCurrentSectionIndex(index)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  currentSectionIndex === index
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {section.title}
              </button>
            ))}
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search documents..."
            />
          </div>
        </div>

        {/* Section Actions */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">{currentSection.title}</h3>
            <div className="flex gap-2">
              <button
                onClick={handleSelectAllInSection}
                className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
              >
                Select All
              </button>
              <button
                onClick={handleDeselectAllInSection}
                className="px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
              >
                Deselect All
              </button>
            </div>
            <div className="text-sm text-gray-600">
              {selectedCountInSection} of {totalCountInSection} selected
            </div>
          </div>
        </div>

        {/* Documents List */}
        <div className="bg-white rounded-2xl shadow-sm">
          <div className="p-4">
            {getFilteredDocuments().length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-gray-400" />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 mb-2">No Documents Found</h4>
                <p className="text-gray-600">
                  {searchQuery ? 'No documents match your search' : 'No documents in your Vault'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {getFilteredDocuments().map((document) => (
                  <label
                    key={document.id}
                    className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDocuments.has(document.id)}
                      onChange={() => handleDocumentToggle(document.id)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                          <span className="text-lg">{getDocumentIcon(document.type)}</span>
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900">{document.name}</h4>
                          <p className="text-sm text-gray-600">
                            {document.type} • {formatFileSize(document.size)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Save Button */}
          <div className="p-4 border-t border-gray-200">
            <button
              onClick={handleSaveDocuments}
              disabled={selectedDocuments.size === 0}
              className="w-full px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Documents to Portfolio
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SelectDocuments;
