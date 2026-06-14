import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, GraduationCap, Briefcase, Award, Star } from 'lucide-react';

interface PortfolioType {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  recommended?: string;
  color: string;
}

const ChoosePortfolioType: React.FC = () => {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<string>('');

  const portfolioTypes: PortfolioType[] = [
    {
      id: 'personal',
      name: 'Personal',
      description: 'Showcase your personal achievements and documents',
      icon: User,
      color: 'bg-blue-500',
      recommended: 'Most popular'
    },
    {
      id: 'academic',
      name: 'Academic',
      description: 'Display educational qualifications and achievements',
      icon: GraduationCap,
      color: 'bg-purple-500'
    },
    {
      id: 'professional',
      name: 'Professional',
      description: 'Highlight work experience and skills',
      icon: Briefcase,
      color: 'bg-green-500'
    },
    {
      id: 'masters',
      name: 'Masters',
      description: 'Advanced academic and research portfolio',
      icon: Award,
      color: 'bg-orange-500',
      recommended: 'For advanced applications'
    }
  ];

  const handleTypeSelect = (typeId: string) => {
    setSelectedType(typeId);
  };

  const handleContinue = () => {
    if (selectedType) {
      navigate('/choose-template', { state: { portfolioType: selectedType } });
    }
  };

  const handleBack = () => {
    navigate('/portfolio');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-md mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={handleBack}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">Choose Portfolio Type</h1>
            <div className="w-9"></div>
          </div>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center space-x-2">
            <div className={`w-8 h-8 rounded-full ${selectedType ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
            <div className={`w-8 h-8 rounded-full ${selectedType ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
            <div className={`w-8 h-8 rounded-full ${selectedType ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
            <div className={`w-8 h-8 rounded-full ${selectedType ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
          </div>
        </div>
        <p className="text-center text-sm text-gray-600 mb-8">Step 1 of 4</p>

        {/* Portfolio Type Cards */}
        <div className="space-y-4">
          {portfolioTypes.map((type) => {
            const Icon = type.icon;
            const isSelected = selectedType === type.id;
            
            return (
              <button
                key={type.id}
                onClick={() => handleTypeSelect(type.id)}
                className={`w-full p-6 rounded-2xl border-2 transition-all text-left ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 shadow-lg'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`w-16 h-16 ${type.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-lg font-bold text-gray-900">{type.name}</h3>
                      {type.recommended && (
                        <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full font-medium">
                          {type.recommended}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-600 text-sm leading-relaxed">{type.description}</p>
                  </div>

                  {/* Selection Indicator */}
                  {isSelected && (
                    <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Continue Button */}
        <button
          onClick={handleContinue}
          disabled={!selectedType}
          className={`w-full py-4 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 ${
            selectedType
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Continue
          {selectedType && <span className="ml-2">→</span>}
        </button>
      </div>
    </div>
  );
};

export default ChoosePortfolioType;
