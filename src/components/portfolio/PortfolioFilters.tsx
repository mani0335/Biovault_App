import React from 'react';

interface PortfolioFiltersProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}

const PortfolioFilters: React.FC<PortfolioFiltersProps> = ({
  activeFilter,
  onFilterChange
}) => {
  const filters = ['All', 'Personal', 'Masters', 'Academic', 'Professional'];

  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {filters.map(filter => (
        <button
          key={filter}
          onClick={() => onFilterChange(filter)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            activeFilter === filter
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {filter}
        </button>
      ))}
    </div>
  );
};

export default PortfolioFilters;
