import React, { useCallback } from 'react';

interface PersonalInfo {
  fullName: string;
  email: string;
  phone: string;
  role: string;
  summary: string;
}

interface PersonalInfoFormProps {
  data: PersonalInfo;
  onChange: (field: string, value: string) => void;
}

const PersonalInfoForm = React.memo(({ data, onChange }: PersonalInfoFormProps) => {
  const handleChange = useCallback((field: string, value: string) => {
    onChange(field, value);
  }, [onChange]);

  console.log("PersonalInfoForm render"); // Debug log

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Personal Information</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
          <input
            type="text"
            value={data.fullName}
            onChange={(e) => handleChange('fullName', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter your full name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={data.email}
            onChange={(e) => handleChange('email', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter your email"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            value={data.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter your phone number"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <input
            type="text"
            value={data.role}
            onChange={(e) => handleChange('role', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter your role"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Summary</label>
          <textarea
            value={data.summary}
            onChange={(e) => handleChange('summary', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={4}
            placeholder="Enter your professional summary"
          />
        </div>
      </div>
    </div>
  );
});

export default PersonalInfoForm;
