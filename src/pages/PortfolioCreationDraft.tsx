import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, FileText, Briefcase, GraduationCap, Award, BookOpen, Code } from 'lucide-react';
import { loadVaultDocuments, buildPortfolio, type VaultDocument, type Portfolio } from '../utils/portfolioBuilder';

const PortfolioCreationDraft: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const state = location.state as { 
      portfolioType?: string, 
      selectedTemplate?: string, 
      selectedDocs?: string[] 
    };

    if (state?.portfolioType && state?.selectedTemplate && state?.selectedDocs) {
      // Get selected documents from vault
      const allVaultDocs = loadVaultDocuments();
      const selectedVaultDocs = allVaultDocs.filter(doc => 
        state.selectedDocs!.includes(doc.id)
      );

      // Build portfolio using selected type, template, and documents
      const builtPortfolio = buildPortfolio(selectedVaultDocs, state.selectedTemplate);
      
      // Add portfolio type-specific sections
      const enhancedPortfolio = {
        ...builtPortfolio,
        sections: getPortfolioSectionsByType(state.portfolioType, selectedVaultDocs)
      };

      setPortfolio(enhancedPortfolio);
    } else {
      // If missing data, go back to document selection
      navigate('/add-documents-from-vault');
    }
  }, [location.state, navigate]);

  const getPortfolioSectionsByType = (portfolioType: string, documents: VaultDocument[]) => {
    switch (portfolioType) {
      case 'personal':
        return {
          profile: {
            name: 'Your Name',
            role: 'Individual'
          },
          resume: documents.filter(d => d.category === 'resume'),
          academic: documents.filter(d => d.category === 'academic'),
          projects: documents.filter(d => d.category === 'project'),
          certifications: documents.filter(d => d.category === 'certification')
        };
      
      case 'academic':
        return {
          profile: {
            name: 'Your Name',
            role: 'Student'
          },
          resume: documents.filter(d => d.category === 'resume'),
          academic: documents.filter(d => d.category === 'academic'),
          projects: documents.filter(d => d.category === 'project'),
          certifications: documents.filter(d => d.category === 'certification')
        };
      
      case 'professional':
        return {
          profile: {
            name: 'Your Name',
            role: 'Professional'
          },
          resume: documents.filter(d => d.category === 'resume'),
          academic: documents.filter(d => d.category === 'academic'),
          projects: documents.filter(d => d.category === 'project'),
          certifications: documents.filter(d => d.category === 'certification')
        };
      
      case 'masters':
        return {
          profile: {
            name: 'Your Name',
            role: 'Graduate Student'
          },
          resume: documents.filter(d => d.category === 'resume'),
          academic: documents.filter(d => d.category === 'academic'),
          projects: documents.filter(d => d.category === 'project'),
          certifications: documents.filter(d => d.category === 'certification'),
          // Masters-specific sections
          sop: documents.filter(d => d.name.toLowerCase().includes('sop')),
          lor: documents.filter(d => d.name.toLowerCase().includes('lor')),
          financial: documents.filter(d => d.name.toLowerCase().includes('bank') || d.name.toLowerCase().includes('fees'))
        };
      
      default:
        return {
          profile: {
            name: 'Your Name',
            role: 'Professional'
          },
          resume: documents.filter(d => d.category === 'resume'),
          academic: documents.filter(d => d.category === 'academic'),
          projects: documents.filter(d => d.category === 'project'),
          certifications: documents.filter(d => d.category === 'certification')
        };
    }
  };

  const getSectionIcon = (sectionName: string) => {
    switch (sectionName.toLowerCase()) {
      case 'resume':
        return FileText;
      case 'academic':
        return GraduationCap;
      case 'projects':
        return Code;
      case 'certifications':
        return Award;
      case 'sop':
        return BookOpen;
      case 'lor':
        return BookOpen;
      case 'financial':
        return Briefcase;
      default:
        return FileText;
    }
  };

  const getSectionColor = (sectionName: string) => {
    switch (sectionName.toLowerCase()) {
      case 'resume':
        return 'bg-blue-500';
      case 'academic':
        return 'bg-purple-500';
      case 'projects':
        return 'bg-orange-500';
      case 'certifications':
        return 'bg-green-500';
      case 'sop':
        return 'bg-teal-500';
      case 'lor':
        return 'bg-teal-500';
      case 'financial':
        return 'bg-gray-500';
      default:
        return 'bg-gray-500';
    }
  };

  const handleContinue = () => {
    if (portfolio) {
      navigate('/portfolio-preview', { state: { portfolio } });
    }
  };

  const handleBack = () => {
    navigate('/choose-template');
  };

  const handleEditProfile = () => {
    setIsEditing(!isEditing);
  };

  const handleSaveProfile = (field: 'name' | 'role', value: string) => {
    if (portfolio) {
      setPortfolio({
        ...portfolio,
        profile: {
          ...portfolio.profile,
          [field]: value
        }
      });
    }
  };

  if (!portfolio) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-600">Loading portfolio...</p>
        </div>
      </div>
    );
  }

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
            <h1 className="text-lg font-semibold text-gray-900">Portfolio Draft</h1>
            <div className="w-9"></div>
          </div>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center space-x-2">
            <div className={`w-8 h-8 rounded-full ${isEditing ? 'bg-orange-500' : 'bg-green-500'}`}></div>
            <div className={`w-8 h-8 rounded-full ${isEditing ? 'bg-orange-500' : 'bg-green-500'}`}></div>
            <div className={`w-8 h-8 rounded-full ${isEditing ? 'bg-orange-500' : 'bg-green-500'}`}></div>
            <div className={`w-8 h-8 rounded-full ${isEditing ? 'bg-orange-500' : 'bg-green-500'}`}></div>
          </div>
        </div>
        <p className="text-center text-sm text-gray-600 mb-8">Step 4 of 4 - Portfolio Creation</p>
      </div>

      {/* Portfolio Preview */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
        {/* Profile Section */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-start gap-4">
            <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
              <FileText className="w-10 h-10 text-gray-400" />
            </div>
            <div className="flex-1">
              {isEditing ? (
                <input
                  type="text"
                  value={portfolio.profile.name}
                  onChange={(e) => handleSaveProfile('name', e.target.value)}
                  className="text-2xl font-bold text-gray-900 bg-transparent border-b-2 border-gray-300 focus:outline-none focus:border-blue-500"
                  placeholder="Your Name"
                />
              ) : (
                <h3 
                  onClick={handleEditProfile}
                  className="text-2xl font-bold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors"
                >
                  {portfolio.profile.name}
                </h3>
              )}
              <p className="text-gray-600">
                {isEditing ? (
                  <input
                    type="text"
                    value={portfolio.profile.role}
                    onChange={(e) => handleSaveProfile('role', e.target.value)}
                    className="text-lg bg-transparent border-b-2 border-gray-300 focus:outline-none focus:border-blue-500"
                    placeholder="Your Professional Title"
                  />
                ) : (
                  <p 
                    onClick={handleEditProfile}
                    className="text-lg text-gray-600 cursor-pointer hover:text-blue-600 transition-colors"
                  >
                    {portfolio.profile.role}
                  </p>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Portfolio Sections */}
        <div className="p-6 space-y-6">
          {Object.entries(portfolio.sections).map(([sectionName, sectionDocs]) => {
            const SectionIcon = getSectionIcon(sectionName);
            const sectionColor = getSectionColor(sectionName);
            const docs = sectionDocs as VaultDocument[];
            
            if (docs.length === 0) return null;
            
            return (
              <div key={sectionName} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 ${sectionColor} rounded-lg flex items-center justify-center`}>
                    <SectionIcon className="w-4 h-4 text-white" />
                  </div>
                  <h4 className="font-semibold text-gray-900 capitalize">{sectionName}</h4>
                  <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                    {docs.length}
                  </span>
                </div>
                
                {/* Documents in Section */}
                <div className="space-y-2">
                  {docs.map((doc, index) => {
                    const FileIcon = sectionName.toLowerCase() === 'resume' ? FileText : 
                                   sectionName.toLowerCase() === 'academic' ? GraduationCap :
                                   sectionName.toLowerCase() === 'projects' ? Code :
                                   sectionName.toLowerCase() === 'certifications' ? Award :
                                   FileText;
                    
                    return (
                      <div key={doc.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <p className="text-sm font-medium text-gray-900 truncate flex-1">
                            {doc.name}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-6 pb-6 space-y-3">
        <button
          onClick={handleContinue}
          className="w-full py-4 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors"
        >
          Continue to Preview
        </button>
        
        <div className="flex gap-3">
          <button
            onClick={handleBack}
            className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Back
          </button>
          
          <button
            onClick={() => {
              if (portfolio) {
                // Save portfolio to localStorage
                const existing = JSON.parse(localStorage.getItem("portfolios") || "[]");
                localStorage.setItem(
                  "portfolios",
                  JSON.stringify([portfolio, ...existing])
                );
                alert("Portfolio saved as draft!");
              }
            }}
            className="flex-1 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
          >
            Save Draft
          </button>
        </div>
      </div>
    </div>
  );
};

export default PortfolioCreationDraft;
