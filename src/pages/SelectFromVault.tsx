import { useNavigate, useLocation } from "react-router-dom";
import PageContainer from "../components/layout/PageContainer";
import { useDocument } from "../context/DocumentContext";

const SelectFromVault = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedType = location.state?.type;
  const { setSelectedDoc } = useDocument();

  console.log("Selected Type:", selectedType); // Debug logging

  const documents = JSON.parse(localStorage.getItem("vaultDocuments") || "[]");

  const handleSelect = (doc: any, type?: string) => {
    // Safe data validation
    if (!doc || !doc.id || !doc.name) {
      console.error('Invalid document selected');
      return;
    }

    // Get document type from navigation state
    const documentType = selectedType || mapDocumentToField(doc.name);
    
    console.log("SELECTING DOCUMENT:", { file: doc, type: documentType }); // Debug logging
    
    // Set selected document in global state
    setSelectedDoc({ 
      file: doc, 
      type: documentType 
    });
    
    // Navigate back to template builder
    navigate("/portfolio/create/template");
  };

  // Map document name to specific field
  const mapDocumentToField = (docName: string): string => {
    const name = docName.toLowerCase();
    
    // Personal Proofs - Specific fields
    if (name.includes('resume') || name.includes('cv')) return 'resume';
    if (name.includes('aadhar') || name.includes('aadhaar')) return 'aadhar';
    if (name.includes('passport')) return 'passport';
    if (name.includes('photo') || name.includes('picture')) return 'photo';
    
    // Academic - Specific fields
    if (name.includes('10th') || name.includes('ssc')) return '10th_certificate';
    if (name.includes('12th') || name.includes('hsc')) return '12th_certificate';
    if (name.includes('degree') || name.includes('graduation')) return 'degree_certificate';
    if (name.includes('semester') || name.includes('scorecard')) return 'semester_scorecards';
    
    // Internships - Specific fields
    if (name.includes('internship') || name.includes('offer')) return 'offer_letter';
    if (name.includes('completion') || name.includes('work')) return 'completion_certificate';
    
    // Certifications - Specific fields
    if (name.includes('certificate') || name.includes('course')) return 'courses';
    if (name.includes('workshop')) return 'workshops';
    if (name.includes('hackathon')) return 'hackathons';
    
    // Default
    return 'other';
  };

  return (
    <PageContainer>
      <div className="vault-list">
        <h2 className="text-lg font-semibold mb-4">Select Document</h2>

        {documents.length === 0 ? (
          <p className="text-gray-500">No documents in vault</p>
        ) : (
          documents.map((doc: any) => (
            <div
              key={doc.id}
              className="p-3 mb-3 bg-gray-100 rounded-lg flex justify-between items-center"
            >
              <span>{doc.name}</span>

              <button
                onClick={() => handleSelect(doc, selectedType)}
                className="bg-blue-500 text-white px-3 py-1 rounded"
              >
                Select
              </button>
            </div>
          ))
        )}
      </div>
    </PageContainer>
  );
};

export default SelectFromVault;
