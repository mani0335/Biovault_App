import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, FileText, Image, Video, User, BookOpen, Award, Code, CheckCircle } from 'lucide-react';
import type { UploadedFile } from '../types';
import { mapDocumentsToPortfolio, getTemplateById } from '../utils/portfolioMapper';

const PortfolioBuilder: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [structuredPortfolio, setStructuredPortfolio] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const state = location.state as { selectedTemplate?: string, selectedDocs?: string[] };
    if (state?.selectedTemplate && state?.selectedDocs) {
      setSelectedTemplate(state.selectedTemplate);
      setSelectedDocs(state.selectedDocs);
    } else {
      // If no data, go back to document selection
      navigate('/add-documents');
      return;
    }

    // Load files from localStorage
    try {
      const saved = localStorage.getItem('vaultFiles');
      const allFiles = saved ? JSON.parse(saved) : [];
      setFiles(allFiles);

      // Get selected files
      const selectedFiles = allFiles.filter((file: UploadedFile) =>
        (state.selectedDocs || []).includes(file.id),
      );

      // Build portfolio structure
      const sections = mapDocumentsToPortfolio(selectedFiles);
      const portfolio = {
        id: Date.now(),
        template: state.selectedTemplate,
        profile: {
          name: "Ashwitha",
          role: "Full Stack Developer",
          location: "India"
        },
        sections,
        createdAt: new Date().toISOString()
      };
      setStructuredPortfolio(portfolio);
      setIsLoading(false);
    } catch (error) {
      console.error('Error building portfolio:', error);
      setIsLoading(false);
    }
  }, [location.state, navigate]);

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image':
        return Image;
      case 'video':
        return Video;
      default:
        return FileText;
    }
  };

  const getFileColor = (type: string) => {
    switch (type) {
      case 'image':
        return 'bg-green-500';
      case 'video':
        return 'bg-purple-500';
      default:
        return 'bg-red-500';
    }
  };

  const getSectionIcon = (sectionName: string) => {
    switch (sectionName.toLowerCase()) {
      case 'resume':
        return FileText;
      case 'education':
        return BookOpen;
      case 'certifications':
        return Award;
      case 'projects':
        return Code;
      default:
        return FileText;
    }
  };

  const getSectionColor = (sectionName: string) => {
    switch (sectionName.toLowerCase()) {
      case 'resume':
        return 'bg-blue-500';
      case 'education':
        return 'bg-purple-500';
      case 'certifications':
        return 'bg-green-500';
      case 'projects':
        return 'bg-orange-500';
      default:
        return 'bg-gray-500';
    }
  };

  const handleGeneratePortfolio = () => {
    if (structuredPortfolio) {
      // Save to localStorage
      const existing = JSON.parse(localStorage.getItem("portfolios") || "[]");
      localStorage.setItem(
        "portfolios",
        JSON.stringify([structuredPortfolio, ...existing])
      );

      navigate('/portfolio-preview', { 
        state: { 
          portfolio: structuredPortfolio 
        } 
      });
    }
  };

  const handleBack = () => {
    navigate('/add-documents');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Building your portfolio...</p>
        </div>
      </div>
    );
  }

  const template = getTemplateById(selectedTemplate);

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
            <h1 className="text-lg font-semibold text-gray-900">Portfolio Builder</h1>
            <div className="w-9"></div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Template Info */}
        {template && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Template</p>
                <p className="font-medium text-gray-900">{template.name}</p>
              </div>
            </div>
          </div>
        )}

        {/* Auto-Mapping Success */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <p className="text-sm font-medium text-green-900">Auto-mapping complete!</p>
          </div>
          <p className="text-xs text-green-700">
            Documents have been automatically organized into sections
          </p>
        </div>

        {/* Portfolio Structure Preview */}
        {structuredPortfolio && (
          <div className="space-y-6 mb-8">
            {/* Profile Section */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
                    <User className="w-8 h-8 text-gray-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {structuredPortfolio.profile.name}
                    </h3>
                    <p className="text-gray-600">
                      {structuredPortfolio.profile.role}
                    </p>
                  </div>
                </div>
              </div>

              {/* Sections */}
              <div className="p-6 space-y-6">
                {Object.entries(structuredPortfolio.sections).map(([sectionName, sectionFiles]) => {
                  const SectionIcon = getSectionIcon(sectionName);
                  const sectionColor = getSectionColor(sectionName);
                  const files = sectionFiles as UploadedFile[];
                  
                  return (
                    <div key={sectionName} className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className={`w-8 h-8 ${sectionColor} rounded-lg flex items-center justify-center`}>
                          <SectionIcon className="w-4 h-4 text-white" />
                        </div>
                        <h4 className="font-semibold text-gray-900 capitalize">{sectionName}</h4>
                        <span className="text-sm text-gray-500">({files.length})</span>
                      </div>
                      
                      {files.length > 0 ? (
                        <div className="space-y-2">
                          {files.map((file) => {
                            const Icon = getFileIcon(file.type);
                            const fileColor = getFileColor(file.type);
                            
                            return (
                              <div key={file.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                <div className="flex items-center gap-2">
                                  <div className={`w-8 h-8 ${fileColor} rounded-lg flex items-center justify-center flex-shrink-0`}>
                                    <Icon className="w-4 h-4 text-white" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                      {file.name}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {(file.size / 1024 / 1024).toFixed(1)} MB
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 text-center">
                          <p className="text-sm text-gray-500">No documents in this section</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Generate Portfolio Button */}
        <button
          onClick={handleGeneratePortfolio}
          className="w-full py-4 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
        >
          <CheckCircle className="w-5 h-5" />
          Generate Portfolio
        </button>
      </div>
    </div>
  );
};

export default PortfolioBuilder;
