import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Briefcase, FileText, Sparkles, Eye, User, BookOpen, Award, Code } from 'lucide-react';
import { templates } from '../utils/portfolioMapper';

const ChooseTemplate: React.FC = () => {
  const navigate = useNavigate();
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [showPreview, setShowPreview] = useState<boolean>(false);

  const handleTemplateClick = (templateId: string) => {
    setSelectedTemplate(templateId);
    setShowPreview(true);
  };

  const handleUseTemplate = () => {
    if (selectedTemplate) {
      navigate('/add-documents', { state: { selectedTemplate } });
    }
  };

  const handleBack = () => {
    if (showPreview) {
      setShowPreview(false);
      setSelectedTemplate('');
    } else {
      navigate('/portfolio');
    }
  };

  const getTemplateIcon = (templateId: string) => {
    switch (templateId) {
      case 'clean-professional':
        return Briefcase;
      case 'minimal-resume':
        return FileText;
      case 'modern-creative':
        return Sparkles;
      default:
        return FileText;
    }
  };

  const getTemplateColor = (templateId: string) => {
    switch (templateId) {
      case 'clean-professional':
        return 'bg-blue-500';
      case 'minimal-resume':
        return 'bg-gray-500';
      case 'modern-creative':
        return 'bg-purple-500';
      default:
        return 'bg-gray-500';
    }
  };

  const renderTemplatePreview = () => {
    if (!selectedTemplate) return null;

    const template = templates.find(t => t.id === selectedTemplate);
    if (!template) return null;

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
              <h1 className="text-lg font-semibold text-gray-900">Template Preview</h1>
              <div className="w-9"></div>
            </div>
          </div>
        </div>

        {/* Preview Content */}
        <div className="max-w-md mx-auto px-4 py-6">
          {/* Template Info */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 ${getTemplateColor(selectedTemplate)} rounded-lg flex items-center justify-center`}>
                {React.createElement(getTemplateIcon(selectedTemplate), { className: "w-5 h-5 text-white" })}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{template.name}</h2>
                <p className="text-sm text-gray-600">{template.description}</p>
              </div>
            </div>
          </div>

          {/* Preview Layout */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
            {/* Profile Section */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
                  <User className="w-8 h-8 text-gray-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Your Name</h3>
                  <p className="text-gray-600">Your Professional Title</p>
                </div>
              </div>
            </div>

            {/* Sections Preview */}
            <div className="p-6 space-y-6">
              {template.sections.map((section, index) => {
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

                const SectionIcon = getSectionIcon(section);

                return (
                  <div key={index} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-8 h-8 ${getSectionColor(section)} rounded-lg flex items-center justify-center`}>
                        <SectionIcon className="w-4 h-4 text-white" />
                      </div>
                      <h4 className="font-semibold text-gray-900 capitalize">{section}</h4>
                    </div>
                    <div className="space-y-2">
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                          <p className="text-sm text-gray-600">Sample document will appear here</p>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                          <p className="text-sm text-gray-600">Another document will appear here</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Use Template Button */}
          <button
            onClick={handleUseTemplate}
            className="w-full py-4 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
          >
            <Eye className="w-5 h-5" />
            Use Template
          </button>
        </div>
      </div>
    );
  };

  // Show preview if template is selected
  if (showPreview && selectedTemplate) {
    return renderTemplatePreview();
  }

  // Show template selection
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
            <h1 className="text-lg font-semibold text-gray-900">Choose Template</h1>
            <div className="w-9"></div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Select a template</h2>
          <p className="text-gray-600">Choose a design that best represents your work</p>
        </div>

        {/* Template Options */}
        <div className="space-y-4">
          {templates.map((template) => {
            const Icon = getTemplateIcon(template.id);
            const color = getTemplateColor(template.id);
            
            return (
              <button
                key={template.id}
                onClick={() => handleTemplateClick(template.id)}
                className="w-full p-6 rounded-2xl border-2 border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition-all text-left"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">{template.name}</h3>
                    <p className="text-gray-600 text-sm mb-3">{template.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {template.sections.map((section, index) => (
                        <span
                          key={index}
                          className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600"
                        >
                          {section}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ChooseTemplate;
