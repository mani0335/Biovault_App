import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, GraduationCap, Briefcase, BookOpen, ChevronRight } from 'lucide-react';

const SelectPortfolioType: React.FC = () => {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<'personal' | 'academic' | 'professional' | 'masters' | null>(null);

  const portfolioTypes = [
    {
      value: 'personal' as const,
      title: 'Personal Portfolio',
      description: 'Secure storage for passport, Aadhaar, ID cards,\nlicenses, and personal proofs',
      icon: User,
      color: 'bg-blue-500'
    },
    {
      value: 'academic' as const,
      title: 'Academic Portfolio',
      description: 'Degree certificates, marksheets, transcripts,\nexam scores, academic records',
      icon: GraduationCap,
      color: 'bg-green-500'
    },
    {
      value: 'professional' as const,
      title: 'Professional Portfolio',
      description: 'Resume, projects, internships, certifications,\nwork proofs, achievements',
      icon: Briefcase,
      color: 'bg-purple-500'
    },
    {
      value: 'masters' as const,
      title: 'Masters Portfolio',
      description: 'SOP, LOR, GRE/IELTS/TOEFL, transcripts,\nfinancial documents',
      icon: BookOpen,
      color: 'bg-orange-500'
    }
  ];

  const handleContinue = () => {
    if (selectedType) {
      navigate('/create-portfolio', { state: { selectedType } });
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

      {/* Content */}
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose Portfolio Type</h2>
          <p className="text-gray-600">Select the purpose that best matches what you want to share</p>
        </div>

        {/* Type Options */}
        <div className="space-y-4 mb-24">
          {portfolioTypes.map((type) => {
            const Icon = type.icon;
            return (
              <button
                key={type.value}
                onClick={() => setSelectedType(type.value)}
                className={`w-full p-6 rounded-2xl border-2 transition-all ${
                  selectedType === type.value
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl ${type.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">{type.title}</h3>
                    <p className="text-gray-600 text-sm whitespace-pre-line">{type.description}</p>
                  </div>
                  <ChevronRight className={`w-5 h-5 transition-colors ${
                    selectedType === type.value ? 'text-blue-500' : 'text-gray-400'
                  }`} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Bottom Action Area */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4">
          <div className="max-w-md mx-auto">
            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="flex-1 py-3 px-6 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleContinue}
                disabled={!selectedType}
                className={`flex-1 py-3 px-6 rounded-xl font-medium transition-colors ${
                  selectedType
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SelectPortfolioType;
