import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Chat from "./pages/Chat";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./pages/AdminDashboard";
// import LabDashboard from "./pages/LabDashboard"; // removed from routing
import { AuthProvider } from "./contexts/AuthContext";
import { RequireRole } from "./components/RequireRole";
import PatientLogin from "./pages/PatientLogin";

// Doctor pages
import DoctorDashboard from "./pages/doctor/DoctorDashboard";
import DoctorCases from "./pages/doctor/DoctorCases";
import DoctorChat from "./pages/doctor/DoctorChat";
import DoctorAnalysis from "./pages/doctor/DoctorAnalysis";

// Lab pages
import LabLayout from "./components/LabLayout";
// import LabDashboard2 from "./pages/lab/LabDashboard"; // removed from routing
import LabCases from "./pages/lab/LabCases";
import CaseDetails from "./pages/lab/CaseDetails";
import LabUpload from "./pages/lab/LabUpload";
// import LabWorkflow from "./pages/lab/LabWorkflow"; // removed from routing
import { Navigate } from "react-router-dom";
import AdminLayout from "./components/AdminLayout";

// Patient pages
import PatientLayout from "./components/PatientLayout";
import { Toaster } from "@/components/ui/toaster";
import PatientDashboard from "./pages/patient/PatientDashboard";
import PatientCases from "./pages/patient/PatientCases";
import CaseView from "./pages/patient/CaseView";

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <Routes>
        {/* Public Landing page (no auth) */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/upload"
          element={
            <RequireRole>
              <Chat />
            </RequireRole>
          }
        />
        <Route path="/patient-login" element={<PatientLogin />} />

        {/* Admin Routes */}
        <Route
          path="/admin/*"
          element={
            <RequireRole role="admin">
              <AdminLayout>
                <Routes>
                  <Route index element={<AdminDashboard />} />
                  <Route path="cases" element={<AdminDashboard />} />
                  <Route path="doctors" element={<AdminDashboard />} />
                  <Route path="labtechs" element={<AdminDashboard />} />
                  <Route path="patients" element={<AdminDashboard />} />
                </Routes>
              </AdminLayout>
            </RequireRole>
          }
        />
        {/* Backward compatibility redirect */}
        <Route path="/admin-dashboard" element={<Navigate to="/admin" replace />} />

  {/* Doctor Routes */}
  <Route path="/doctor" element={<Navigate to="/doctor/cases" replace />} />
        <Route
          path="/doctor-dashboard"
          element={
            <RequireRole role="doctor">
              <DoctorDashboard />
            </RequireRole>
          }
        />
        <Route
          path="/doctor/dashboard"
          element={
            <RequireRole role="doctor">
              <DoctorDashboard />
            </RequireRole>
          }
        />
        <Route
          path="/doctor/cases"
          element={
            <RequireRole role="doctor">
              <DoctorCases />
            </RequireRole>
          }
        />
        <Route
          path="/doctor/chat"
          element={
            <RequireRole role="doctor">
              <DoctorChat />
            </RequireRole>
          }
        />
        <Route
          path="/doctor/analysis/:caseId"
          element={
            <RequireRole role="doctor">
              <DoctorAnalysis />
            </RequireRole>
          }
        />

        {/* Removed standalone lab-dashboard route */}

        {/* Lab Routes with Layout */}
        <Route
          path="/lab/*"
          element={
            <RequireRole role="lab_tech">
              <LabLayout>
                <Routes>
                  <Route index element={<Navigate to="cases" replace />} />
                  <Route path="cases" element={<LabCases />} />
                  <Route path="cases/:caseId" element={<CaseDetails />} />
                  <Route path="upload" element={<LabUpload />} />
                  {/* Workflow removed */}
                </Routes>
              </LabLayout>
            </RequireRole>
          }
        />

        {/* Patient Routes with Layout */}
        <Route
          path="/patient/*"
          element={
            <RequireRole role="patient">
              <PatientLayout>
                <Routes>
                  <Route path="dashboard" element={<PatientDashboard />} />
                  <Route path="cases" element={<PatientCases />} />
                  <Route path="cases/:caseId" element={<CaseView />} />
                  <Route path="chat" element={<Chat />} />
                </Routes>
              </PatientLayout>
            </RequireRole>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  </AuthProvider>
);

export default App;
