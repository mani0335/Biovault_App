import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, FileText, Check } from 'lucide-react';
import Header from '../components/Header';
import { PORTFOLIO_TEMPLATES, createTemplatePortfolio, getPortfolioTypeDisplayName, getProfileData } from '../types/Portfolio';
import type { Portfolio, CreatePortfolioInput } from '../types/Portfolio';

const CreatePortfolio = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [portfolioName, setPortfolioName] = useState('');
  const [selectedType, setSelectedType] = useState<Portfolio['type'] | null>(null);
  const [portfolio, setPortfolio] = useState<CreatePortfolioInput | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);

  const handleTypeSelect = (type: Portfolio['type']) => {
    setSelectedType(type);
    setCurrentStep(2);
  };

  const handleNameChange = (name: string) => {
    setPortfolioName(name);
  };

  const handleNextStep = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCreatePortfolio = () => {
    if (!selectedType || !portfolioName.trim()) {
      alert('Please select a portfolio type and enter a name');
      return;
    }

    // Create portfolio with template structure
    const templatePortfolio = createTemplatePortfolio(portfolioName, selectedType, selectedDocuments);
    const newPortfolio: Portfolio = {
      ...templatePortfolio,
      id: Date.now().toString(),
      createdAt: new Date().toISOString()
    };

    // Save to localStorage
    const existingPortfolios = JSON.parse(localStorage.getItem('portfolios') || '[]');
    const updatedPortfolios = [newPortfolio, ...existingPortfolios];
    localStorage.setItem('portfolios', JSON.stringify(updatedPortfolios));

    setPortfolio(newPortfolio);
    alert('Portfolio created successfully!');
    
    // Navigate to document selection
    navigate(`/portfolio/select-documents/${newPortfolio.id}`);
  };

  const portfolioTypes: Portfolio['type'][] = ['academic', 'placement', 'masters', 'personal'];

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
          <h1 className="text-xl font-bold text-gray-900">Create Portfolio</h1>
        </div>

        {/* Step 1: Portfolio Type Selection */}
        {currentStep === 1 && (
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Choose Portfolio Type</h2>
            <div className="grid grid-cols-1 gap-3">
              {portfolioTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => handleTypeSelect(type)}
                  className={`p-4 border-2 rounded-xl transition-all ${
                    selectedType === type
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <div className="text-left">
                    <h3 className="font-semibold mb-2">
                      {getPortfolioTypeDisplayName(type)}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {PORTFOLIO_TEMPLATES[type].sections.join(' + ')}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Portfolio Details */}
        {currentStep === 2 && selectedType && (
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Portfolio Details</h2>
            
            {/* Portfolio Name */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Portfolio Name</label>
              <input
                type="text"
                value={portfolioName}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter portfolio name"
              />
            </div>

            {/* Preview Sections */}
            <div className="mb-6">
              <h3 className="text-md font-semibold text-gray-900 mb-4">Portfolio Structure</h3>
              <div className="space-y-3">
                {PORTFOLIO_TEMPLATES[selectedType].sections.map((sectionTitle, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="w-4 h-4 text-green-500" />
                      <h4 className="font-medium text-gray-900">{sectionTitle}</h4>
                    </div>
                    <p className="text-sm text-gray-600">
                      Documents will be auto-assigned to this section
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-between">
              <button
                onClick={handlePreviousStep}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={handleNextStep}
                disabled={!portfolioName.trim()}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Create */}
        {currentStep === 3 && selectedType && portfolioName && (
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Review & Create</h2>
            
            {/* Portfolio Summary */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-700">Portfolio Name:</span>
                  <span className="text-sm font-semibold text-gray-900">{portfolioName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-700">Type:</span>
                  <span className="text-sm font-semibold text-gray-900">{getPortfolioTypeDisplayName(selectedType)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-700">Sections:</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {PORTFOLIO_TEMPLATES[selectedType].sections.length} sections
                  </span>
                </div>
              </div>
            </div>

            {/* Sections Preview */}
            <div className="mb-6">
              <h3 className="text-md font-semibold text-gray-900 mb-4">Portfolio Structure</h3>
              <div className="space-y-2">
                {PORTFOLIO_TEMPLATES[selectedType].sections.map((sectionTitle, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" />
                      <h4 className="font-medium text-gray-900">{sectionTitle}</h4>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between">
              <button
                onClick={handlePreviousStep}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={handleCreatePortfolio}
                disabled={!portfolioName.trim()}
                className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Portfolio
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreatePortfolio;
