import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AMRDeveloperInterface from './components/AMRDeveloperInterface';
import AMRMonitorPage from './components/AMRMonitorPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AMRDeveloperInterface />} />
        <Route path="/monitor" element={<AMRMonitorPage />} />
      </Routes>
    </Router>
  );
}

export default App;