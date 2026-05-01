import "./App.css";
import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import RecruitDB from "./page/recruitDB";
import Login from "./page/login";
import AuthCallback from "./page/AuthCallback";
import AdminPanel from "./page/AdminPanel";
import RequireAuth from "./components/RequireAuth";
import RequireSuperAdmin from "./components/RequireSuperAdmin";
import { AuthProvider } from "./auth/AuthProvider";
import { Toaster } from "react-hot-toast";

function App() {
  return (
    <div className="container">
      <Router>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route
              path="/recruitDB"
              element={
                <RequireAuth>
                  <RecruitDB />
                </RequireAuth>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <RequireSuperAdmin>
                    <AdminPanel />
                  </RequireSuperAdmin>
                </RequireAuth>
              }
            />
          </Routes>
          <Toaster />
        </AuthProvider>
      </Router>
    </div>
  );
}

export default App;
