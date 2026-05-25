import React, { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";

// Lazy-load every page so a single import failure won't black-screen the whole app
const Index            = lazy(() => import("@/pages/Index"));
const Login            = lazy(() => import("@/pages/Login"));
const Register         = lazy(() => import("@/pages/Register"));
const BiometricOptions = lazy(() => import("@/pages/BiometricOptions"));
const TempAccess       = lazy(() => import("@/pages/TempAccess"));
const TempAccessFace   = lazy(() => import("@/pages/TempAccessFace"));
const Dashboard        = lazy(() => import("@/pages/Dashboard"));
const VaultPage        = lazy(() => import("@/pages/VaultPage"));
const Profile          = lazy(() => import("@/pages/Profile"));
const ProfileAdvanced  = lazy(() => import("@/pages/ProfileAdvanced"));
const ProfileModern    = lazy(() => import("@/pages/ProfileModern"));
const ScanPage         = lazy(() => import("@/pages/ScanPage"));
const ScanDocumentFlow = lazy(() => import("@/pages/ScanDocumentFlow"));
const UploadPage       = lazy(() => import("@/pages/UploadPage"));
const UploadDevicePage = lazy(() => import("@/pages/UploadDevicePage"));
const UploadFromDevice = lazy(() => import("@/pages/UploadFromDevice"));
const DocumentHub      = lazy(() => import("@/pages/DocumentHub"));
const ReviewPage       = lazy(() => import("@/pages/ReviewPage"));
const NotFound         = lazy(() => import("@/pages/NotFound"));
const SharedImageViewer = lazy(() => import("@/components/SharedImageViewer").then(m => ({ default: m.SharedImageViewer })));

// Portfolio pages
const PortfolioHome        = lazy(() => import("@/pages/portfolio/PortfolioHome"));
const PortfolioBuilder     = lazy(() => import("@/pages/portfolio/PortfolioBuilder"));
const PortfolioView        = lazy(() => import("@/pages/portfolio/PortfolioView"));
const PortfolioEdit        = lazy(() => import("@/pages/portfolio/PortfolioEdit"));
const PortfolioShare       = lazy(() => import("@/pages/portfolio/PortfolioShare"));
const ChoosePortfolioType  = lazy(() => import("@/pages/portfolio/ChoosePortfolioType"));
const SharedPortfolioPage  = lazy(() => import("@/pages/portfolio/SharedPortfolioPage"));
const ActivityPage         = lazy(() => import("@/pages/ActivityPage"));

// Profile sub-pages
const PersonalPage        = lazy(() => import("@/pages/profile/PersonalPage"));
const AcademicPage        = lazy(() => import("@/pages/profile/AcademicPage"));
const CertificationsPage  = lazy(() => import("@/pages/profile/CertificationsPage"));
const ExamsPage           = lazy(() => import("@/pages/profile/ExamsPage"));
const FinancialPage       = lazy(() => import("@/pages/profile/FinancialPage"));
const InternshipsPage     = lazy(() => import("@/pages/profile/InternshipsPage"));
const ProjectsPage        = lazy(() => import("@/pages/profile/ProjectsPage"));

// Full-screen loading shown while a lazy page chunk loads
const PageLoader = () => (
  <div style={{
    width: "100vw",
    height: "100vh",
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: "16px",
  }}>
    <div style={{
      width: "48px",
      height: "48px",
      border: "3px solid rgba(6,182,212,0.2)",
      borderTop: "3px solid #06b6d4",
      borderRadius: "50%",
      animation: "spin 1s linear infinite",
    }} />
    <p style={{ color: "#67e8f9", fontFamily: "monospace", fontSize: "14px" }}>
      Loading...
    </p>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

// Error boundary — catches render errors so the app shows a recovery screen
// instead of a blank black screen.
interface ErrorBoundaryState { hasError: boolean; error: string }

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }

  static getDerivedStateFromError(err: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        width: "100vw",
        height: "100vh",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        padding: "24px",
        color: "white",
        fontFamily: "monospace",
        gap: "16px",
        textAlign: "center",
      }}>
        <div style={{ fontSize: "48px" }}>⚠️</div>
        <h2 style={{ fontSize: "20px", color: "#f87171" }}>Something went wrong</h2>
        <p style={{ fontSize: "13px", color: "#94a3b8", maxWidth: "360px" }}>
          {this.state.error}
        </p>
        <button
          onClick={() => { this.setState({ hasError: false, error: "" }); window.location.href = "/"; }}
          style={{
            marginTop: "12px",
            padding: "10px 24px",
            background: "#06b6d4",
            border: "none",
            borderRadius: "8px",
            color: "white",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          Return to Start
        </button>
      </div>
    );
  }
}

const App = () => (
  <ErrorBoundary>
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* ─── Public / Auth routes ─── */}
          <Route path="/"                 element={<Index />} />
          <Route path="/login"            element={<Login />} />
          <Route path="/register"         element={<Register />} />
          <Route path="/biometric-options" element={<BiometricOptions />} />
          <Route path="/temp-access"      element={<TempAccess />} />
          <Route path="/temp-access-face" element={<TempAccessFace />} />

          {/* ─── Protected routes (require biovault_token + biovault_userId) ─── */}
          <Route path="/dashboard" element={
            <ProtectedRoute><Dashboard /></ProtectedRoute>
          } />
          <Route path="/vault" element={
            <ProtectedRoute><VaultPage /></ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute><Profile /></ProtectedRoute>
          } />
          <Route path="/profile-advanced" element={
            <ProtectedRoute><ProfileAdvanced /></ProtectedRoute>
          } />
          <Route path="/profile-modern" element={
            <ProtectedRoute><ProfileModern /></ProtectedRoute>
          } />
          <Route path="/scan" element={
            <ProtectedRoute><ScanPage /></ProtectedRoute>
          } />
          <Route path="/scan-document-flow" element={
            <ProtectedRoute><ScanDocumentFlow /></ProtectedRoute>
          } />
          <Route path="/upload" element={
            <ProtectedRoute><UploadPage /></ProtectedRoute>
          } />
          <Route path="/upload-device" element={
            <ProtectedRoute><UploadDevicePage /></ProtectedRoute>
          } />
          <Route path="/upload-from-device" element={
            <ProtectedRoute><UploadFromDevice /></ProtectedRoute>
          } />
          <Route path="/document-hub" element={
            <ProtectedRoute><DocumentHub /></ProtectedRoute>
          } />
          <Route path="/review" element={
            <ProtectedRoute><ReviewPage /></ProtectedRoute>
          } />
          <Route path="/activity" element={
            <ProtectedRoute><ActivityPage /></ProtectedRoute>
          } />

          {/* Portfolio */}
          <Route path="/portfolio" element={
            <ProtectedRoute><PortfolioHome /></ProtectedRoute>
          } />
          <Route path="/portfolio/builder" element={
            <ProtectedRoute><PortfolioBuilder /></ProtectedRoute>
          } />
          <Route path="/portfolio/view/:id" element={
            <ProtectedRoute><PortfolioView /></ProtectedRoute>
          } />
          <Route path="/portfolio/edit/:id" element={
            <ProtectedRoute><PortfolioEdit /></ProtectedRoute>
          } />
          <Route path="/portfolio/share/:id" element={
            <ProtectedRoute><PortfolioShare /></ProtectedRoute>
          } />
          <Route path="/portfolio/choose-type" element={
            <ProtectedRoute><ChoosePortfolioType /></ProtectedRoute>
          } />

          {/* Profile sub-pages */}
          <Route path="/profile/personal" element={
            <ProtectedRoute><PersonalPage /></ProtectedRoute>
          } />
          <Route path="/profile/academic" element={
            <ProtectedRoute><AcademicPage /></ProtectedRoute>
          } />
          <Route path="/profile/certifications" element={
            <ProtectedRoute><CertificationsPage /></ProtectedRoute>
          } />
          <Route path="/profile/exams" element={
            <ProtectedRoute><ExamsPage /></ProtectedRoute>
          } />
          <Route path="/profile/financial" element={
            <ProtectedRoute><FinancialPage /></ProtectedRoute>
          } />
          <Route path="/profile/internships" element={
            <ProtectedRoute><InternshipsPage /></ProtectedRoute>
          } />
          <Route path="/profile/projects" element={
            <ProtectedRoute><ProjectsPage /></ProtectedRoute>
          } />

          {/* ─── Public share routes — no login required ─── */}
          <Route path="/share/:token" element={<SharedImageViewer />} />
          <Route path="/shared/portfolio/:token" element={<SharedPortfolioPage />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </ErrorBoundary>
);

export default App;
