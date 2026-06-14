import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import PortfolioCard from '../components/portfolio/PortfolioCard';
import PortfolioFilters from '../components/portfolio/PortfolioFilters';
import type { PortfolioType } from '../types';
import { loadPortfolios, type Portfolio } from '../utils/portfolioBuilder';


const Portfolio: React.FC = () => {
  const navigate = useNavigate();
  const [portfolios, setPortfolios] = useState<PortfolioType[]>([]);
  const [activeFilter, setActiveFilter] = useState('All');
  

  // Load portfolios from localStorage on mount
  useEffect(() => {
    try {
      const portfolioData = loadPortfolios();
      // Convert to PortfolioType format for display
      const formattedPortfolios: PortfolioType[] = portfolioData.map((p: Portfolio) => ({
        id: p.id.toString(),
        name: p.profile?.name || 'Untitled Portfolio',
        type: (p.template as 'professional' | 'placement' | 'masters') || 'professional',
        documents: Object.values(p.sections || {}).reduce((total: number, section: any) => total + section.length, 0),
        views: 0,
        status: 'active',
        createdAt: p.createdAt || new Date().toISOString()
      }));
      setPortfolios(formattedPortfolios);
    } catch (error) {
      console.error('Error loading portfolios:', error);
      setPortfolios([]);
    }
  }, []);

  // Save portfolios to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('portfolios', JSON.stringify(portfolios));
    } catch (error) {
      console.error('Error saving portfolios:', error);
    }
  }, [portfolios]);

  const getFilteredPortfolios = () => {
    switch (activeFilter) {
      case 'Active':
        return portfolios.filter(p => p.status === 'active');
      case 'Shared':
        return portfolios.filter(p => p.status === 'shared');
      case 'Draft':
        return portfolios.filter(p => p.status === 'draft');
      default:
        return portfolios;
    }
  };

  
  const handleTrack = (portfolio: PortfolioType) => {
    console.log('Track portfolio:', portfolio.name);
    // Implement tracking functionality
  };

  const handleShare = (portfolio: PortfolioType) => {
    navigate(`/portfolio/share/${portfolio.id}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-md mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Portfolio</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Filters */}
        <div className="mb-6">
          <PortfolioFilters
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
          />
        </div>

        {/* Portfolio List */}
        <div className="space-y-4">
          {getFilteredPortfolios().length > 0 ? (
            getFilteredPortfolios().map((portfolio) => (
              <PortfolioCard
                key={portfolio.id}
                portfolio={portfolio}
                onView={() => handleTrack(portfolio)}
                onEdit={() => handleTrack(portfolio)}
                onShare={() => handleShare(portfolio)}
                onDelete={() => console.log('Delete not implemented')}
              />
            ))
          ) : (
            <div className="text-center py-16">
              <div className="mb-4">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Plus className="w-10 h-10 text-gray-400" />
                </div>
              </div>
              <p className="text-gray-600 text-lg font-medium mb-2">No portfolios found</p>
              <p className="text-gray-500 text-sm mb-6">
                {activeFilter === 'All' 
                  ? "Create your first portfolio to get started" 
                  : `No ${activeFilter.toLowerCase()} portfolios found`
                }
              </p>
              <button
                onClick={() => navigate('/choose-portfolio-type')}
                className="px-6 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors"
              >
                Create Portfolio
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => navigate('/choose-portfolio-type')}
        className="fixed bottom-24 right-5 bg-blue-500 text-white p-4 rounded-full shadow-lg hover:bg-blue-600 transition-colors"
      >
        <Plus className="w-6 h-6" />
      </button>

          </div>
  );
};

export default Portfolio;
